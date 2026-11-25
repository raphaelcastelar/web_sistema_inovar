import shutil
import tempfile

from django.test import TestCase, override_settings

from empresas.models import Empresa, Funcionario
from monitor_fiscal import constantes as c
from monitor_fiscal.certificados import analisar_certificado
from monitor_fiscal.models import CertificadoDigital, ConfiguracaoMonitorFiscal
from monitor_fiscal.seguranca import criptografar
from monitor_fiscal.sincronizacao import garantir_controles

from . import utils

CNPJ = '11222333000181'


def salvar_certificado(pfx, senha='1234'):
    info = analisar_certificado(pfx, senha)
    return CertificadoDigital.objects.create(
        titular=info.titular, cnpj=info.cnpj, cpf=info.cpf, emissor=info.emissor, numero_serie=info.numero_serie,
        fingerprint_sha256=info.fingerprint_sha256, valido_de=info.valido_de, valido_ate=info.valido_ate,
        autenticacao_cliente=info.autenticacao_cliente, cadeia_icp_brasil=info.cadeia_icp_brasil,
        arquivo_cifrado=criptografar(pfx), senha_cifrada=criptografar(senha.encode()),
    )


class MonitorFiscalTestCase(TestCase):
    @classmethod
    def setUpClass(cls):
        # O cadastro de empresas cria pastas em MEDIA_ROOT: isola em diretório temporário.
        cls._media = tempfile.mkdtemp(prefix='mf-media-')
        cls._override = override_settings(MEDIA_ROOT=cls._media)
        cls._override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._override.disable()
        shutil.rmtree(cls._media, ignore_errors=True)

    def setUp(self):
        self.admin = Funcionario.objects.create_user('admin-mf', password='x', cargo='admin', is_staff=True)
        self.empresa = Empresa.objects.create(nome='EMPRESA TESTE', cnpj='11.222.333/0001-81', uf='ES')
        pfx, self.cert_x509 = utils.gerar_pfx(CNPJ)
        self.certificado = salvar_certificado(pfx)
        self.config = ConfiguracaoMonitorFiscal.objects.create(
            empresa=self.empresa, ativo=True, certificado=self.certificado, codigo_uf='32',
            monitorar_nfse=False, monitorar_cte=False, monitorar_mdfe=False,
        )
        self.controles = {ct.fonte: ct for ct in garantir_controles(self.config)}
        self.controle_nfe = self.controles[c.FONTE_AN_NFE]
