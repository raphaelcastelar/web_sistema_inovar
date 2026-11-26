from django.test import override_settings
from rest_framework.test import APIClient

from empresas.models import Empresa
from monitor_fiscal import constantes as c
from monitor_fiscal import manifestacao, sincronizacao
from monitor_fiscal.models import ConfiguracaoMonitorFiscal, DocumentoFiscal

from . import utils
from .base import MonitorFiscalTestCase

SOMENTE_HOMOLOGACAO = dict(MONITOR_FISCAL_AMBIENTE_PADRAO=2, MONITOR_FISCAL_AMBIENTES_PERMITIDOS=[2])


@override_settings(**SOMENTE_HOMOLOGACAO)
class InstalacaoSomenteHomologacaoTests(MonitorFiscalTestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_nova_configuracao_nasce_em_homologacao(self):
        outra = Empresa.objects.create(nome='NOVA', cnpj='11.222.333/0002-62')
        resposta = self.client.get(f'/api/monitor-fiscal/empresas/{outra.pk}/configuracao/')
        self.assertEqual(resposta.data['configuracao']['ambiente'], c.HOMOLOGACAO)

    def test_nao_permite_configurar_producao(self):
        resposta = self.client.patch(f'/api/monitor-fiscal/empresas/{self.empresa.pk}/configuracao/',
                                     {'ambiente': 1}, format='json')
        self.assertEqual(resposta.status_code, 400)
        self.assertIn('não opera', str(resposta.data))

    def test_sincronizacao_de_producao_bloqueada_sem_requisicao(self):
        transporte = utils.TransporteFalso([])
        with self.assertRaisesMessage(sincronizacao.SincronizacaoNaoPermitidaError, 'não opera'):
            sincronizacao.sincronizar(self.controle_nfe, transporte=transporte)
        self.assertEqual(transporte.requisicoes, [])
        self.assertEqual(list(sincronizacao.controles_pendentes()), [])

    def test_sincronizacao_em_homologacao_usa_endpoint_de_homologacao(self):
        self.config.ambiente = c.HOMOLOGACAO
        self.config.save()
        controle = {ct.fonte: ct for ct in sincronizacao.garantir_controles(self.config)}[c.FONTE_AN_NFE]
        transporte = utils.TransporteFalso([utils.soap_ret_dist('137', 'Nenhum documento localizado')])
        sincronizacao.sincronizar(controle, transporte=transporte)
        self.assertEqual(transporte.requisicoes[0]['url'], c.ENDPOINTS['NFE_DISTRIBUICAO'][c.HOMOLOGACAO])
        self.assertIn(b'<tpAmb>2</tpAmb>', transporte.requisicoes[0]['corpo'])

    def test_manifestacao_de_documento_de_producao_bloqueada(self):
        doc = DocumentoFiscal.objects.create(
            empresa=self.empresa, tipo_documento=c.TIPO_NFE, chave=utils.chave(numero=90), ambiente=c.PRODUCAO,
            situacao_manifestacao='nao_manifestada', situacao_fiscal='autorizado')
        with self.assertRaisesMessage(manifestacao.ManifestacaoNaoPermitidaError, 'não opera'):
            manifestacao.solicitar(doc, c.EVENTO_CIENCIA, usuario=self.admin)

    def test_permissoes_informam_ambiente(self):
        dados = self.client.get('/api/monitor-fiscal/permissoes/').data
        self.assertEqual(dados['ambiente_padrao'], 2)
        self.assertEqual(dados['ambientes_permitidos'], [2])

    def test_xml_real_importado_continua_visivel_no_filtro_de_producao(self):
        ch = utils.chave(numero=91)
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.client.post('/api/monitor-fiscal/importacao/', {'arquivos': [SimpleUploadedFile('n.xml', utils.nfe_proc(ch))]},
                         format='multipart')
        self.assertEqual(self.client.get('/api/monitor-fiscal/documentos/').data['count'], 0)
        self.assertEqual(self.client.get('/api/monitor-fiscal/documentos/', {'ambiente': 1}).data['count'], 1)
