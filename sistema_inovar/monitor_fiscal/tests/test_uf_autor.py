from monitor_fiscal import sincronizacao

from . import utils
from .base import MonitorFiscalTestCase


class UfAutorTests(MonitorFiscalTestCase):
    def test_usa_uf_do_cadastro_quando_configuracao_vazia(self):
        self.config.codigo_uf = ''
        self.config.save()
        self.assertEqual(sincronizacao.codigo_uf_autor(self.config), '32')

    def test_configuracao_tem_prioridade(self):
        self.config.codigo_uf = '35'
        self.config.save()
        self.assertEqual(sincronizacao.codigo_uf_autor(self.config), '35')

    def test_sem_uf_bloqueia_sem_requisicao(self):
        self.config.codigo_uf = ''
        self.config.save()
        self.empresa.uf = ''
        self.empresa.save()
        transporte = utils.TransporteFalso([])
        with self.assertRaisesMessage(sincronizacao.SincronizacaoNaoPermitidaError, 'Informe a UF'):
            sincronizacao.sincronizar(self.controle_nfe, transporte=transporte)
        self.assertEqual(transporte.requisicoes, [])
