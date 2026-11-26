from datetime import timedelta
from unittest import mock

from django.db import IntegrityError
from django.utils import timezone
from lxml import etree

from empresas.models import Empresa
from monitor_fiscal import constantes as c
from monitor_fiscal import sincronizacao
from monitor_fiscal.models import (
    ConfiguracaoMonitorFiscal, ControleSincronizacao, DocumentoFiscal, EventoFiscal, RecebimentoDFe,
)

from . import utils
from .base import CNPJ, MonitorFiscalTestCase, salvar_certificado


def nsu(n):
    return str(n).zfill(15)


class SincronizacaoNFeTests(MonitorFiscalTestCase):
    def _sincronizar(self, respostas, controle=None):
        transporte = utils.TransporteFalso(respostas)
        execucao = sincronizacao.sincronizar(controle or self.controle_nfe, transporte=transporte)
        (controle or self.controle_nfe).refresh_from_db()
        return execucao, transporte

    def test_primeira_sincronizacao_monta_requisicao_oficial(self):  # cenário 5
        execucao, transporte = self._sincronizar([utils.soap_ret_dist('137', 'Nenhum documento localizado')])
        corpo = transporte.requisicoes[0]['corpo']
        raiz = etree.fromstring(corpo)
        dist = raiz.find('.//{http://www.portalfiscal.inf.br/nfe}distDFeInt')
        self.assertEqual(dist.get('versao'), '1.01')
        self.assertEqual(dist.findtext('{http://www.portalfiscal.inf.br/nfe}CNPJ'), CNPJ)
        self.assertEqual(dist.findtext('{http://www.portalfiscal.inf.br/nfe}cUFAutor'), '32')
        self.assertEqual(dist.findtext('.//{http://www.portalfiscal.inf.br/nfe}ultNSU'), '000000000000000')
        self.assertEqual(transporte.requisicoes[0]['url'], c.ENDPOINTS['NFE_DISTRIBUICAO'][c.PRODUCAO])
        self.assertTrue(execucao.sucesso)

    def test_consulta_sem_documentos_respeita_uma_hora(self):  # cenário 8
        self._sincronizar([utils.soap_ret_dist('137', 'Nenhum documento localizado', ult=nsu(10), maximo=nsu(10))])
        self.assertEqual(self.controle_nfe.ult_nsu, nsu(10))
        self.assertGreaterEqual(self.controle_nfe.proxima_consulta_em, timezone.now() + timedelta(minutes=59))
        with self.assertRaises(sincronizacao.SincronizacaoNaoPermitidaError):
            sincronizacao.sincronizar(self.controle_nfe, origem='manual', transporte=utils.TransporteFalso([]))

    def test_multiplos_lotes_e_nsu_existente(self):  # cenários 6 e 7
        self.controle_nfe.ult_nsu = nsu(100)
        self.controle_nfe.save()
        ch1, ch2 = utils.chave(numero=1), utils.chave(numero=2)
        lote1 = utils.soap_ret_dist('138', 'Documento localizado', ult=nsu(101), maximo=nsu(102),
                                    docs=[(nsu(101), 'resNFe_v1.01.xsd', utils.res_nfe(ch1))])
        lote2 = utils.soap_ret_dist('138', 'Documento localizado', ult=nsu(102), maximo=nsu(102),
                                    docs=[(nsu(102), 'resNFe_v1.01.xsd', utils.res_nfe(ch2))])
        execucao, transporte = self._sincronizar([lote1, lote2])
        self.assertIn(b'<ultNSU>000000000000100</ultNSU>', transporte.requisicoes[0]['corpo'])
        self.assertIn(b'<ultNSU>000000000000101</ultNSU>', transporte.requisicoes[1]['corpo'])
        self.assertEqual(self.controle_nfe.ult_nsu, nsu(102))
        self.assertEqual(execucao.documentos, 2)
        self.assertEqual(DocumentoFiscal.objects.count(), 2)
        self.assertEqual(self.controle_nfe.situacao, ControleSincronizacao.SITUACAO_SINCRONIZADO)

    def test_consumo_indevido_bloqueia_e_impede_nova_tentativa(self):  # cenários 9 e 10
        self._sincronizar([utils.soap_ret_dist('656', 'Rejeicao: Consumo Indevido')])
        self.assertEqual(self.controle_nfe.situacao, ControleSincronizacao.SITUACAO_BLOQUEADO)
        self.assertGreater(self.controle_nfe.bloqueado_ate, timezone.now())
        transporte = utils.TransporteFalso([])
        with self.assertRaisesMessage(sincronizacao.SincronizacaoNaoPermitidaError, 'bloqueada'):
            sincronizacao.sincronizar(self.controle_nfe, origem='manual', transporte=transporte)
        self.assertEqual(transporte.requisicoes, [])
        self.assertTrue(self.empresa.alertas_fiscais.filter(tipo='consumo_indevido').exists())

    def test_resumo_e_depois_xml_completo_sem_duplicar(self):  # cenários 11 e 12
        ch = utils.chave(numero=7)
        self._sincronizar([utils.soap_ret_dist('138', '', ult=nsu(1), maximo=nsu(1),
                                               docs=[(nsu(1), 'resNFe_v1.01.xsd', utils.res_nfe(ch))])])
        doc = DocumentoFiscal.objects.get(chave=ch)
        self.assertEqual(doc.situacao_xml, 'resumo')
        self.assertEqual(doc.situacao_manifestacao, 'nao_manifestada')
        self.assertEqual(doc.classificacao, 'entrada')

        ControleSincronizacao.objects.filter(pk=self.controle_nfe.pk).update(proxima_consulta_em=None)
        self._sincronizar([utils.soap_ret_dist('138', '', ult=nsu(2), maximo=nsu(2),
                                               docs=[(nsu(2), 'procNFe_v4.00.xsd', utils.nfe_proc(ch))])])
        self.assertEqual(DocumentoFiscal.objects.filter(chave=ch).count(), 1)
        doc.refresh_from_db()
        self.assertEqual(doc.situacao_xml, 'completo')
        self.assertTrue(doc.xml_resumo)
        self.assertEqual(doc.itens.count(), 1)
        self.assertEqual(doc.destinatario_documento, CNPJ)
        self.assertTrue(self.empresa.alertas_fiscais.filter(tipo='xml_disponivel').exists())

    def test_resumo_nao_substitui_xml_completo(self):
        ch = utils.chave(numero=8)
        self._sincronizar([utils.soap_ret_dist('138', '', ult=nsu(2), maximo=nsu(2), docs=[
            (nsu(1), 'procNFe_v4.00.xsd', utils.nfe_proc(ch)), (nsu(2), 'resNFe_v1.01.xsd', utils.res_nfe(ch))])])
        doc = DocumentoFiscal.objects.get(chave=ch)
        self.assertEqual(doc.situacao_xml, 'completo')
        self.assertIn('nfeProc', doc.xml_completo)

    def test_nota_cancelada_e_evento_antes_da_nota(self):  # cenários 16 e 17
        ch = utils.chave(numero=9)
        self._sincronizar([utils.soap_ret_dist('138', '', ult=nsu(2), maximo=nsu(2), docs=[
            (nsu(1), 'procEventoNFe_v1.00.xsd', utils.proc_evento_nfe(ch)),
            (nsu(2), 'resNFe_v1.01.xsd', utils.res_nfe(ch)),
        ])])
        doc = DocumentoFiscal.objects.get(chave=ch)
        evento = EventoFiscal.objects.get(chave_documento=ch)
        self.assertEqual(evento.documento, doc)
        self.assertEqual(doc.situacao_fiscal, 'cancelado')
        self.assertIn('nfeProc', utils.nfe_proc(ch).decode())  # XML original não é alterado pelo evento

    def test_recebimento_repetido_e_idempotente(self):  # cenário 18
        ch = utils.chave(numero=10)
        resposta = utils.soap_ret_dist('138', '', ult=nsu(1), maximo=nsu(1),
                                       docs=[(nsu(1), 'procNFe_v4.00.xsd', utils.nfe_proc(ch))])
        self._sincronizar([resposta])
        ControleSincronizacao.objects.filter(pk=self.controle_nfe.pk).update(proxima_consulta_em=None, ult_nsu='0')
        self._sincronizar([resposta])
        self.assertEqual(DocumentoFiscal.objects.filter(chave=ch).count(), 1)
        self.assertEqual(RecebimentoDFe.objects.filter(nsu=nsu(1)).count(), 1)

    def test_falha_na_persistencia_nao_avanca_nsu(self):  # cenário 19
        ch1, ch2 = utils.chave(numero=11), utils.chave(numero=12)
        resposta = utils.soap_ret_dist('138', '', ult=nsu(2), maximo=nsu(2), docs=[
            (nsu(1), 'resNFe_v1.01.xsd', utils.res_nfe(ch1)), (nsu(2), 'resNFe_v1.01.xsd', utils.res_nfe(ch2))])
        original = sincronizacao.processar_conteudo
        chamadas = {'n': 0}

        def falhar_no_segundo(*args, **kwargs):
            chamadas['n'] += 1
            if chamadas['n'] == 2:
                raise IntegrityError('falha simulada de banco')
            return original(*args, **kwargs)

        with mock.patch.object(sincronizacao, 'processar_conteudo', side_effect=falhar_no_segundo):
            execucao, _ = self._sincronizar([resposta])
        self.assertFalse(execucao.sucesso)
        self.assertEqual(self.controle_nfe.ult_nsu, '0')
        self.assertEqual(DocumentoFiscal.objects.count(), 0)
        self.assertIsNone(self.controle_nfe.executando_desde)

    def test_falha_de_comunicacao_preserva_nsu_e_agenda_retentativa(self):  # cenários 20 e 38
        self.controle_nfe.ult_nsu = nsu(50)
        self.controle_nfe.save()
        self._sincronizar([utils.FalhaRede('Tempo limite excedido')])
        self.assertEqual(self.controle_nfe.ult_nsu, nsu(50))
        self.assertEqual(self.controle_nfe.situacao, ControleSincronizacao.SITUACAO_INDISPONIVEL)
        self.assertGreater(self.controle_nfe.proxima_consulta_em, timezone.now())

    def test_servico_paralisado(self):  # cenário 38
        self._sincronizar([utils.soap_ret_dist('108', 'Servico Paralisado Momentaneamente')])
        self.assertEqual(self.controle_nfe.situacao, ControleSincronizacao.SITUACAO_INDISPONIVEL)

    def test_reinicializacao_durante_sincronizacao(self):  # cenário 21
        ControleSincronizacao.objects.filter(pk=self.controle_nfe.pk).update(
            executando_desde=timezone.now() - timedelta(hours=1), execucao_token='antigo')
        execucao, _ = self._sincronizar([utils.soap_ret_dist('137', '')])
        self.assertTrue(execucao.sucesso)

    def test_sincronizacao_concorrente_da_mesma_empresa(self):  # cenário 22
        ControleSincronizacao.objects.filter(pk=self.controle_nfe.pk).update(
            executando_desde=timezone.now(), execucao_token='em-andamento')
        with self.assertRaises(sincronizacao.ExecucaoConcorrenteError):
            sincronizacao.sincronizar(self.controle_nfe, transporte=utils.TransporteFalso([]))

    def test_empresas_diferentes_sincronizam_independentemente(self):  # cenário 23
        outra = Empresa.objects.create(nome='OUTRA', cnpj='11.222.333/0002-62', uf='SP')
        config = ConfiguracaoMonitorFiscal.objects.create(empresa=outra, ativo=True, certificado=self.certificado,
                                                          monitorar_nfse=False, monitorar_cte=False)
        controle_outra = {ct.fonte: ct for ct in sincronizacao.garantir_controles(config)}[c.FONTE_AN_NFE]
        self._sincronizar([utils.soap_ret_dist('137', '', ult=nsu(5), maximo=nsu(5))])
        self._sincronizar([utils.soap_ret_dist('137', '', ult=nsu(9), maximo=nsu(9))], controle_outra)
        self.assertEqual(self.controle_nfe.ult_nsu, nsu(5))
        self.assertEqual(controle_outra.ult_nsu, nsu(9))
        self.assertEqual(controle_outra.cnpj_consultado, '11222333000262')

    def test_certificado_substituido_preserva_nsu(self):  # cenário 37
        self.controle_nfe.ult_nsu = nsu(77)
        self.controle_nfe.certificado_fingerprint = self.certificado.fingerprint_sha256
        self.controle_nfe.save()
        pfx, _ = utils.gerar_pfx(CNPJ, dias_validade=700)
        novo = salvar_certificado(pfx)
        self.config.certificado = novo
        self.config.save()
        _, transporte = self._sincronizar([utils.soap_ret_dist('137', '', ult=nsu(77), maximo=nsu(77))])
        self.assertIn(b'<ultNSU>000000000000077</ultNSU>', transporte.requisicoes[0]['corpo'])
        self.assertEqual(self.controle_nfe.certificado_fingerprint, novo.fingerprint_sha256)

    def test_certificado_incompativel_impede_consulta(self):  # cenário 4
        pfx, _ = utils.gerar_pfx('44555666000199')
        self.config.certificado = salvar_certificado(pfx)
        self.config.save()
        transporte = utils.TransporteFalso([])
        with self.assertRaises(sincronizacao.SincronizacaoNaoPermitidaError):
            sincronizacao.sincronizar(self.controle_nfe, transporte=transporte)
        self.assertEqual(transporte.requisicoes, [])

    def test_rejeicao_593_marca_certificado(self):
        self._sincronizar([utils.soap_ret_dist('593', 'CNPJ-Base consultado difere do CNPJ-Base do Certificado')])
        self.assertEqual(self.controle_nfe.situacao, ControleSincronizacao.SITUACAO_CERTIFICADO)

    def test_separacao_producao_homologacao(self):  # cenário 39
        ch = utils.chave(numero=13)
        self._sincronizar([utils.soap_ret_dist('138', '', ult=nsu(1), maximo=nsu(1),
                                               docs=[(nsu(1), 'procNFe_v4.00.xsd', utils.nfe_proc(ch, tp_amb='2'))])])
        self.assertFalse(DocumentoFiscal.objects.filter(chave=ch).exists())
        recebimento = RecebimentoDFe.objects.get(nsu=nsu(1))
        self.assertIn('ambiente', recebimento.erro)
        self.assertEqual(self.controle_nfe.ult_nsu, nsu(1))  # conteúdo preservado; sequência não trava

    def test_lacuna_de_nsu_registrada(self):
        ch = utils.chave(numero=14)
        self._sincronizar([utils.soap_ret_dist('138', '', ult=nsu(3), maximo=nsu(3),
                                               docs=[(nsu(3), 'resNFe_v1.01.xsd', utils.res_nfe(ch))])])
        self.assertEqual(self.controle_nfe.lacunas_nsu, [nsu(1), nsu(2)])

    def test_monitoramento_desativado_preserva_historico(self):
        ch = utils.chave(numero=15)
        self._sincronizar([utils.soap_ret_dist('138', '', ult=nsu(1), maximo=nsu(1),
                                               docs=[(nsu(1), 'resNFe_v1.01.xsd', utils.res_nfe(ch))])])
        self.config.ativo = False
        self.config.save()
        with self.assertRaises(sincronizacao.SincronizacaoNaoPermitidaError):
            sincronizacao.sincronizar(self.controle_nfe, transporte=utils.TransporteFalso([]))
        self.assertTrue(DocumentoFiscal.objects.filter(chave=ch).exists())


class ComandosTests(MonitorFiscalTestCase):
    def test_rodada_agendada_e_rotinas(self):
        import io
        from django.core.management import call_command

        with mock.patch.object(sincronizacao, 'TransporteMTLS',
                               return_value=utils.TransporteFalso([utils.soap_ret_dist('137', '')])):
            saida = io.StringIO()
            call_command('monitor_fiscal_sincronizar', stdout=saida)
        self.assertIn('1 controle(s) processado(s)', saida.getvalue())
        self.controle_nfe.refresh_from_db()
        self.assertEqual(self.controle_nfe.situacao, ControleSincronizacao.SITUACAO_SINCRONIZADO)
        # Na rodada seguinte o intervalo obrigatório impede nova consulta.
        saida = io.StringIO()
        call_command('monitor_fiscal_sincronizar', stdout=saida)
        self.assertIn('0 controle(s) processado(s)', saida.getvalue())
        saida = io.StringIO()
        call_command('monitor_fiscal_rotinas', stdout=saida)
        self.assertIn('Alertas de certificado', saida.getvalue())
