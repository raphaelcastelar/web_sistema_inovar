from django.db import transaction
from lxml import etree

from monitor_fiscal import constantes as c
from monitor_fiscal import manifestacao, sincronizacao
from monitor_fiscal.assinatura import verificar
from monitor_fiscal.models import DocumentoFiscal, Manifestacao
from monitor_fiscal.processador import processar_conteudo

from . import utils
from .base import CNPJ, MonitorFiscalTestCase

NS = '{http://www.portalfiscal.inf.br/nfe}'
DS = '{http://www.w3.org/2000/09/xmldsig#}'


class ManifestacaoTests(MonitorFiscalTestCase):
    def setUp(self):
        super().setUp()
        from django.utils import timezone
        self.chave = utils.chave(numero=21)
        agora = timezone.localtime().isoformat(timespec='seconds')
        with transaction.atomic():
            processar_conteudo(utils.res_nfe(self.chave, dh=agora), fonte=c.FONTE_AN_NFE, ambiente=c.PRODUCAO,
                               empresa=self.empresa, nsu='000000000000001')
        self.documento = DocumentoFiscal.objects.get(chave=self.chave)

    def test_ciencia_autorizada_assinada_e_registrada(self):  # cenário 13
        registro = manifestacao.solicitar(self.documento, c.EVENTO_CIENCIA, usuario=self.admin)
        transporte = utils.TransporteFalso([utils.soap_ret_evento(ch=self.chave)])
        registro = manifestacao.transmitir(registro, transporte=transporte)
        self.assertEqual(registro.situacao, 'registrada')
        self.assertEqual(registro.protocolo, '891260000000001')
        self.assertIn(b'nfeDadosMsg', transporte.requisicoes[0]['corpo'])
        # A assinatura é verificada sobre o envEvento isolado (conteúdo de nfeDadosMsg).
        enviado = etree.fromstring(registro.xml_enviado.encode())
        inf = enviado.find(f'.//{NS}infEvento')
        self.assertEqual(inf.get('Id'), f'ID210210{self.chave}01')
        self.assertEqual(inf.findtext(f'{NS}cOrgao'), '91')
        self.assertEqual(inf.findtext(f'{NS}CNPJ'), CNPJ)
        self.assertEqual(inf.findtext(f'.//{NS}descEvento'), 'Ciencia da Operacao')
        assinatura = enviado.find(f'.//{DS}Signature')
        self.assertTrue(verificar(inf, assinatura, self.cert_x509))
        self.assertEqual(transporte.requisicoes[0]['url'], c.ENDPOINTS['NFE_RECEPCAO_EVENTO_AN'][c.PRODUCAO])
        self.documento.refresh_from_db()
        self.assertEqual(self.documento.situacao_manifestacao, 'ciencia')
        self.assertTrue(self.documento.eventos.filter(tipo_evento=c.EVENTO_CIENCIA).exists())

    def test_manifestacao_rejeitada_pela_sefaz(self):  # cenário 14
        registro = manifestacao.solicitar(self.documento, c.EVENTO_CONFIRMACAO, usuario=self.admin)
        transporte = utils.TransporteFalso([utils.soap_ret_evento(cstat='596', motivo='Rejeicao: Evento fora do prazo',
                                                                  ch=self.chave, tp='210200')])
        registro = manifestacao.transmitir(registro, transporte=transporte)
        self.assertEqual(registro.situacao, 'rejeitada')
        self.assertEqual(registro.cstat, '596')
        self.documento.refresh_from_db()
        self.assertEqual(self.documento.situacao_manifestacao, 'nao_manifestada')

    def test_http_ok_com_lote_rejeitado_nao_e_sucesso(self):
        registro = manifestacao.solicitar(self.documento, c.EVENTO_CIENCIA, usuario=self.admin)
        transporte = utils.TransporteFalso([utils.soap_ret_evento(cstat_lote='215', cstat='', ch=self.chave)])
        registro = manifestacao.transmitir(registro, transporte=transporte)
        self.assertEqual(registro.situacao, 'rejeitada')

    def test_manifestacao_duplicada_bloqueada_localmente(self):  # cenário 15
        registro = manifestacao.solicitar(self.documento, c.EVENTO_CIENCIA, usuario=self.admin)
        manifestacao.transmitir(registro, transporte=utils.TransporteFalso([utils.soap_ret_evento(ch=self.chave)]))
        with self.assertRaises(manifestacao.ManifestacaoNaoPermitidaError):
            manifestacao.solicitar(self.documento, c.EVENTO_CIENCIA, usuario=self.admin)

    def test_operacao_nao_realizada_exige_justificativa(self):
        with self.assertRaisesMessage(manifestacao.ManifestacaoNaoPermitidaError, 'justificativa'):
            manifestacao.solicitar(self.documento, c.EVENTO_NAO_REALIZADA, usuario=self.admin, justificativa='curta')

    def test_ciencia_nao_permitida_para_nota_cancelada(self):
        self.documento.situacao_fiscal = 'cancelado'
        self.documento.save()
        with self.assertRaises(manifestacao.ManifestacaoNaoPermitidaError):
            manifestacao.solicitar(self.documento, c.EVENTO_CIENCIA, usuario=self.admin)

    def test_ciencia_automatica_somente_com_autorizacao(self):
        outra = utils.chave(numero=22)
        resposta = utils.soap_ret_dist('138', '', ult='000000000000002', maximo='000000000000002',
                                       docs=[('000000000000002', 'resNFe_v1.01.xsd', utils.res_nfe(outra))])
        sincronizacao.sincronizar(self.controle_nfe, transporte=utils.TransporteFalso([resposta]))
        self.assertFalse(Manifestacao.objects.filter(documento__chave=outra).exists())

        from django.utils import timezone
        self.config.ciencia_automatica = True
        self.config.ciencia_autorizada_em = timezone.now()
        self.config.ciencia_autorizacao_descricao = 'Autorização assinada pelo sócio administrador'
        self.config.save()
        terceira = utils.chave(numero=23)
        self.controle_nfe.refresh_from_db()
        self.controle_nfe.proxima_consulta_em = None
        self.controle_nfe.save()
        resposta = utils.soap_ret_dist('138', '', ult='000000000000003', maximo='000000000000003',
                                       docs=[('000000000000003', 'resNFe_v1.01.xsd', utils.res_nfe(terceira))])
        with self.settings(MONITOR_FISCAL_MAX_LOTES_POR_EXECUCAO=1):
            transporte = utils.TransporteFalso([resposta])
            sincronizacao.sincronizar(self.controle_nfe, transporte=transporte)
        pendente = Manifestacao.objects.get(documento__chave=terceira)
        self.assertTrue(pendente.automatica)
        self.assertEqual(pendente.tipo_evento, c.EVENTO_CIENCIA)
        # Somente ciência é automatizada; eventos conclusivos nunca.
        self.assertFalse(Manifestacao.objects.exclude(tipo_evento=c.EVENTO_CIENCIA).filter(automatica=True).exists())
