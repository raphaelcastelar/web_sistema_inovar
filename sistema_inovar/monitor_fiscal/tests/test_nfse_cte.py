import json

from monitor_fiscal import constantes as c
from monitor_fiscal import sincronizacao
from monitor_fiscal.clientes import adn
from monitor_fiscal.models import ControleSincronizacao, DocumentoFiscal

from . import utils
from .base import CNPJ, MonitorFiscalTestCase

CH1 = '32053091112223330001810000000000000110000000001234'
CH2 = '32053091112223330001810000000000000210000000001234'
CH3 = '32053097766655500014400000000000000310000000001234'


def resposta_adn(itens, status='DOCUMENTOS_LOCALIZADOS'):
    return json.dumps({
        'StatusProcessamento': status,
        'LoteDFe': [{'NSU': nsu, 'ChaveAcesso': ch, 'TipoDocumento': tipo, 'ArquivoXml': utils.gz64(xml),
                     'DataHoraGeracao': '2026-11-20T10:00:00'} for nsu, ch, tipo, xml in itens],
        'Alertas': [], 'Erros': [],
    })


class NFSeTests(MonitorFiscalTestCase):
    def setUp(self):
        super().setUp()
        self.config.monitorar_nfse = True
        self.config.save()
        self.controle = {ct.fonte: ct for ct in sincronizacao.garantir_controles(self.config)}[c.FONTE_ADN_NFSE]

    def _sincronizar(self, respostas):
        transporte = utils.TransporteFalso(respostas)
        execucao = sincronizacao.sincronizar(self.controle, transporte=transporte)
        self.controle.refresh_from_db()
        return execucao, transporte

    def test_nfse_prestada_tomada_e_intermediacao(self):  # cenários 24, 25 e 26
        itens = [
            ('1', CH1, 'NFSE', utils.nfse(CH1, prestador=CNPJ)),
            ('2', CH2, 'NFSE', utils.nfse(CH2, prestador='77666555000144', tomador=CNPJ)),
            ('3', CH3, 'NFSE', utils.nfse(CH3, prestador='77666555000144', tomador='33222111000155',
                                          intermediario=CNPJ)),
        ]
        execucao, transporte = self._sincronizar([resposta_adn(itens), (404, json.dumps(
            {'StatusProcessamento': 'NENHUM_DOCUMENTO_LOCALIZADO', 'LoteDFe': []}))])
        req = transporte.requisicoes[0]
        self.assertTrue(req['url'].endswith('/contribuintes/DFe/0'))
        self.assertEqual(req['params'], {'lote': 'true', 'cnpjConsulta': CNPJ})
        self.assertTrue(transporte.requisicoes[1]['url'].endswith('/DFe/3'))
        classes = dict(DocumentoFiscal.objects.values_list('chave', 'classificacao'))
        self.assertEqual(classes[CH1], 'servico_prestado')
        self.assertEqual(classes[CH2], 'servico_tomado')
        self.assertEqual(classes[CH3], 'intermediacao')
        doc = DocumentoFiscal.objects.get(chave=CH1)
        self.assertEqual(doc.valores_tributarios['iss'], '50.00')
        self.assertEqual(doc.dados['codigo_servico'], '010101')
        self.assertEqual(str(doc.competencia), '2026-11-01')
        self.assertEqual(self.controle.ult_nsu, '000000000000003')
        self.assertEqual(self.controle.situacao, ControleSincronizacao.SITUACAO_SINCRONIZADO)
        # NSU próprio da NFS-e: não interfere no controle da NF-e.
        self.controle_nfe.refresh_from_db()
        self.assertEqual(self.controle_nfe.ult_nsu, '0')

    def test_cancelamento_de_nfse(self):  # cenário 27
        self._sincronizar([resposta_adn([
            ('1', CH1, 'NFSE', utils.nfse(CH1)),
            ('2', CH1, 'EVENTO', utils.evento_nfse(CH1, '101101')),
        ]), resposta_adn([], 'NENHUM_DOCUMENTO_LOCALIZADO')])
        doc = DocumentoFiscal.objects.get(chave=CH1)
        self.assertEqual(doc.situacao_fiscal, 'cancelado')
        self.assertEqual(doc.eventos.count(), 1)

    def test_substituicao_de_nfse_vincula_notas(self):  # cenário 28
        self._sincronizar([resposta_adn([
            ('1', CH1, 'NFSE', utils.nfse(CH1)),
            ('2', CH2, 'NFSE', utils.nfse(CH2, subst=CH1)),
            ('3', CH1, 'EVENTO', utils.evento_nfse(CH1, '105102', subst=CH2)),
        ]), resposta_adn([], 'NENHUM_DOCUMENTO_LOCALIZADO')])
        antiga = DocumentoFiscal.objects.get(chave=CH1)
        nova = DocumentoFiscal.objects.get(chave=CH2)
        self.assertEqual(antiga.situacao_fiscal, 'substituido')
        self.assertEqual(antiga.substituido_por, nova)
        self.assertFalse(antiga.conta_como_movimentacao)
        self.assertTrue(nova.conta_como_movimentacao)

    def test_municipio_sem_documentos_no_adn(self):  # cenário 40
        execucao, _ = self._sincronizar([(404, json.dumps({'StatusProcessamento': 'NENHUM_DOCUMENTO_LOCALIZADO'}))])
        self.assertTrue(execucao.sucesso)
        self.assertEqual(DocumentoFiscal.objects.count(), 0)
        self.assertIn('Nenhum documento', self.controle.ultima_mensagem)

    def test_rejeicao_adn(self):
        self._sincronizar([(400, json.dumps({'StatusProcessamento': 'REJEICAO', 'Erros': [{'Codigo': 'E1', 'Descricao': 'x'}]}))])
        self.assertEqual(self.controle.situacao, ControleSincronizacao.SITUACAO_ERRO)

    def test_interpretador_aceita_camel_case(self):
        retorno = adn.interpretar_retorno({'statusProcessamento': 'DOCUMENTOS_LOCALIZADOS', 'loteDfe': [
            {'nsu': 5, 'chaveAcesso': CH1, 'tipoDocumento': 'NFSE', 'arquivoXml': utils.gz64(utils.nfse(CH1))}]})
        self.assertEqual(retorno.documentos[0].nsu, '5')


class CTeTests(MonitorFiscalTestCase):
    def test_captura_cte_tomador(self):  # cenário 29
        self.config.monitorar_cte = True
        self.config.save()
        controle = {ct.fonte: ct for ct in sincronizacao.garantir_controles(self.config)}[c.FONTE_AN_CTE]
        ch = utils.chave(cnpj_emit='55444333000122', modelo='57', numero=5)
        resposta = utils.soap_ret_dist('138', '', ult='000000000000001', maximo='000000000000001', ns=utils.NS_CTE,
                                       versao='1.00', docs=[('000000000000001', 'procCTe_v4.00.xsd', utils.cte_proc(ch))])
        transporte = utils.TransporteFalso([resposta])
        sincronizacao.sincronizar(controle, transporte=transporte)
        corpo = transporte.requisicoes[0]['corpo']
        self.assertIn(b'cteDistDFeInteresse', corpo)
        self.assertIn(b'<distDFeInt xmlns="http://www.portalfiscal.inf.br/cte" versao="1.00">', corpo)
        doc = DocumentoFiscal.objects.get(chave=ch)
        self.assertEqual(doc.tipo_documento, c.TIPO_CTE)
        self.assertEqual(doc.classificacao, 'transporte_contratado')  # toma=3 (destinatário = empresa)
        self.assertEqual(str(doc.valor_total), '350.00')
        self.assertEqual(doc.dados['modal'], 'Rodoviário')
        self.assertEqual(doc.dados['documentos_relacionados'], ['1' * 44])
