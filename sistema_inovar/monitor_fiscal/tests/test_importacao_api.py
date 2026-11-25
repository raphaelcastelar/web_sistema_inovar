import io
import zipfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from rest_framework.test import APIClient

from empresas.models import Empresa, Funcionario
from monitor_fiscal import constantes as c
from monitor_fiscal.models import DocumentoFiscal, PendenciaVinculo, RegistroAuditoria
from monitor_fiscal.processador import processar_conteudo

from . import utils
from .base import CNPJ, MonitorFiscalTestCase


class ImportacaoTests(MonitorFiscalTestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _importar(self, arquivos, **extra):
        return self.client.post('/api/monitor-fiscal/importacao/', {'arquivos': arquivos, **extra}, format='multipart')

    def test_importacao_xml_individual(self):  # cenário 30
        ch = utils.chave(numero=31)
        resposta = self._importar([SimpleUploadedFile('nota.xml', utils.nfe_proc(ch))])
        self.assertEqual(resposta.status_code, 201, resposta.content)
        self.assertEqual(resposta.data['totais']['importados'], 1)
        doc = DocumentoFiscal.objects.get(chave=ch)
        self.assertEqual(doc.fontes, [c.FONTE_IMPORTACAO])
        self.assertEqual(doc.classificacao, 'entrada')

    def test_importacao_zip_com_duplicidade_e_rejeicoes(self):  # cenários 31, 32, 33
        ch = utils.chave(numero=32)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as arquivo:
            arquivo.writestr('a.xml', utils.nfe_proc(ch))
            arquivo.writestr('b.xml', utils.nfe_proc(ch))
            arquivo.writestr('ruim.xml', b'<nfeProc><NFe>')
            arquivo.writestr('xxe.xml', b'<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>')
            arquivo.writestr('sem_protocolo.xml', utils.nfe_proc(utils.chave(numero=33), protocolo=False))
        resposta = self._importar([SimpleUploadedFile('lote.zip', buffer.getvalue())])
        totais = resposta.data['totais']
        self.assertEqual(totais['importados'], 1)
        self.assertEqual(totais['duplicados'], 1)
        self.assertEqual(totais['rejeitados'], 3)
        motivos = ' '.join(r['motivo'] for r in resposta.data['resultados'] if r['status'] == 'rejeitado')
        self.assertIn('malicioso', motivos)
        self.assertIn('protocolo', motivos)

    def test_documento_sem_empresa_autorizada_vai_para_analise(self):
        ch = utils.chave(numero=34)
        xml = utils.nfe_proc(ch, cnpj_dest='44555666000199')
        resposta = self._importar([SimpleUploadedFile('x.xml', xml)])
        self.assertEqual(resposta.data['totais']['pendentes_vinculo'], 1)
        self.assertTrue(PendenciaVinculo.objects.filter(chave=ch).exists())
        self.assertFalse(DocumentoFiscal.objects.filter(chave=ch).exists())

    def test_documento_recebido_por_diferentes_fontes(self):  # cenário 41
        ch = utils.chave(numero=35)
        with transaction.atomic():
            processar_conteudo(utils.nfe_proc(ch), fonte=c.FONTE_AN_NFE, ambiente=c.PRODUCAO, empresa=self.empresa,
                               nsu='000000000000001')
        resposta = self._importar([SimpleUploadedFile('n.xml', utils.nfe_proc(ch))])
        self.assertEqual(resposta.data['totais']['duplicados'], 1)
        doc = DocumentoFiscal.objects.get(chave=ch)
        self.assertEqual(doc.fontes, [c.FONTE_AN_NFE, c.FONTE_IMPORTACAO])
        self.assertEqual(doc.recebimentos.count(), 2)


class ApiTests(MonitorFiscalTestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.ch_valida = utils.chave(numero=41)
        self.ch_cancelada = utils.chave(numero=42)
        with transaction.atomic():
            processar_conteudo(utils.nfe_proc(self.ch_valida, valor='1000.00', itens=[
                ('P', 'PROD', '84713012', '5102', '1', '1000', '1000.00')]),
                fonte=c.FONTE_AN_NFE, ambiente=c.PRODUCAO, empresa=self.empresa, nsu='000000000000001')
            processar_conteudo(utils.nfe_proc(self.ch_cancelada, valor='5000.00', itens=[
                ('P', 'PROD', '84713012', '5102', '1', '5000', '5000.00')]),
                fonte=c.FONTE_AN_NFE, ambiente=c.PRODUCAO, empresa=self.empresa, nsu='000000000000002')
            processar_conteudo(utils.proc_evento_nfe(self.ch_cancelada), fonte=c.FONTE_AN_NFE, ambiente=c.PRODUCAO,
                               empresa=self.empresa, nsu='000000000000003')
        self.doc = DocumentoFiscal.objects.get(chave=self.ch_valida)

    def test_download_individual(self):  # cenário 34
        resposta = self.client.get(f'/api/monitor-fiscal/documentos/{self.doc.pk}/xml/')
        self.assertEqual(resposta.status_code, 200)
        self.assertIn(b'nfeProc', resposta.content)
        self.assertTrue(RegistroAuditoria.objects.filter(operacao='download_xml').exists())

    def test_exportacao_em_lote(self):  # cenário 35
        resposta = self.client.get('/api/monitor-fiscal/documentos/exportar/', {'empresa': self.empresa.pk})
        self.assertEqual(resposta.status_code, 200)
        nomes = zipfile.ZipFile(io.BytesIO(resposta.content)).namelist()
        self.assertTrue(any(n.endswith(f'NFE-{self.ch_valida}.xml') and '/NFE/Entrada/' in n for n in nomes))
        self.assertTrue(any('/eventos/' in n for n in nomes))
        self.assertIn('LEIA-ME.txt', nomes)

    def test_acesso_a_empresa_nao_autorizada(self):  # cenário 36
        usuario = Funcionario.objects.create_user('fiscal-mf', password='x', cargo='fiscal')
        usuario.empresas_gerenciadas.clear()
        cliente = APIClient()
        cliente.force_authenticate(usuario)
        self.assertEqual(cliente.get(f'/api/monitor-fiscal/documentos/{self.doc.pk}/').status_code, 404)
        self.assertEqual(cliente.get(f'/api/monitor-fiscal/documentos/{self.doc.pk}/xml/').status_code, 404)
        self.assertEqual(cliente.get('/api/monitor-fiscal/documentos/').data['count'], 0)

    def test_permissao_sensivel_exige_autorizacao(self):
        usuario = Funcionario.objects.create_user('fiscal-mf2', password='x', cargo='fiscal')
        cliente = APIClient()
        cliente.force_authenticate(usuario)
        self.assertEqual(cliente.get('/api/monitor-fiscal/certificados/').status_code, 403)
        resposta = cliente.post(f'/api/monitor-fiscal/documentos/{self.doc.pk}/manifestar/',
                                {'tipo_evento': '210210', 'confirmacao': True}, format='json')
        self.assertEqual(resposta.status_code, 403)
        pessoal = Funcionario.objects.create_user('pessoal-mf', password='x', cargo='pessoal')
        cliente.force_authenticate(pessoal)
        self.assertEqual(cliente.get('/api/monitor-fiscal/documentos/').status_code, 403)

    def test_nota_cancelada_nao_conta_como_movimentacao(self):  # cenário 42
        resposta = self.client.get('/api/monitor-fiscal/dashboard/', {'inicio': '2026-01-01', 'fim': '2026-12-31'})
        self.assertEqual(resposta.status_code, 200)
        totais = resposta.data['totais']
        self.assertEqual(totais['compras_documentadas'], 1000)
        self.assertEqual(totais['cancelados'], 1)
        self.assertIn('não faturamento', resposta.data['aviso_cobertura'])

    def test_certificado_nunca_exposto(self):
        resposta = self.client.get('/api/monitor-fiscal/certificados/')
        self.assertEqual(resposta.status_code, 200)
        texto = resposta.content.decode()
        self.assertNotIn('arquivo_cifrado', texto)
        self.assertNotIn('senha', texto)

    def test_upload_certificado_senha_incorreta_e_valido(self):
        pfx, _ = utils.gerar_pfx(CNPJ)
        resposta = self.client.post('/api/monitor-fiscal/certificados/', {
            'arquivo': SimpleUploadedFile('c.pfx', pfx), 'senha': 'errada'}, format='multipart')
        self.assertEqual(resposta.status_code, 400)
        resposta = self.client.post('/api/monitor-fiscal/certificados/', {
            'arquivo': SimpleUploadedFile('c.pfx', pfx), 'senha': '1234', 'empresa_ids': [self.empresa.pk]},
            format='multipart')
        self.assertEqual(resposta.status_code, 201, resposta.content)
        self.assertNotIn('1234', resposta.content.decode())
        log = RegistroAuditoria.objects.filter(operacao='certificado_upload', resultado='sucesso').last()
        self.assertNotIn('1234', str(log.detalhes))

    def test_relatorio_csv_e_xlsx(self):
        csv = self.client.get('/api/monitor-fiscal/relatorios/documentos/', {'formato': 'csv'})
        self.assertEqual(csv.status_code, 200)
        self.assertIn('somente com os documentos disponíveis', csv.content.decode('utf-8'))
        xlsx = self.client.get('/api/monitor-fiscal/relatorios/cfop/', {'formato': 'xlsx'})
        self.assertEqual(xlsx.status_code, 200)
        self.assertTrue(xlsx.content.startswith(b'PK'))

    def test_pdf_auxiliar(self):
        resposta = self.client.get(f'/api/monitor-fiscal/documentos/{self.doc.pk}/pdf/')
        self.assertEqual(resposta.status_code, 200)
        self.assertTrue(resposta.content.startswith(b'%PDF'))

    def test_filtros_e_auditoria(self):
        resposta = self.client.get('/api/monitor-fiscal/documentos/', {'situacao_fiscal': 'cancelado'})
        self.assertEqual(resposta.data['count'], 1)
        resposta = self.client.post('/api/monitor-fiscal/auditoria/', {'empresa_id': self.empresa.pk}, format='json')
        self.assertEqual(resposta.status_code, 200)
        regras = set(self.client.get('/api/monitor-fiscal/auditoria/').data['results'][i]['regra']
                     for i in range(len(self.client.get('/api/monitor-fiscal/auditoria/').data['results'])))
        self.assertIn('documento_cancelado', regras)

    def test_configuracao_ciencia_exige_registro_de_autorizacao(self):
        url = f'/api/monitor-fiscal/empresas/{self.empresa.pk}/configuracao/'
        self.assertEqual(self.client.patch(url, {'ciencia_automatica': True}, format='json').status_code, 400)
        resposta = self.client.patch(url, {'ciencia_automatica': True, 'ciencia_autorizacao_descricao':
                                           'Termo assinado pelo sócio João em 01/11/2026'}, format='json')
        self.assertEqual(resposta.status_code, 200)
        self.assertIsNotNone(resposta.data['configuracao']['ciencia_autorizada_em'])
