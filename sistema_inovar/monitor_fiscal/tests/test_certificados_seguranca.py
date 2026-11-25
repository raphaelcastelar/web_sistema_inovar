import io
import os
import zipfile

from django.test import SimpleTestCase

from monitor_fiscal.certificados import (
    CertificadoInvalidoError, analisar_certificado, arquivos_mtls, compatibilidade_contribuinte, validar_para_uso,
)
from monitor_fiscal.seguranca import (
    XMLInseguroError, XMLMalformadoError, criptografar, descriptografar, extrair_xmls_zip, parse_xml_seguro,
)

from . import utils


class CertificadoTests(SimpleTestCase):
    def test_certificado_valido(self):  # cenário 1
        pfx, _ = utils.gerar_pfx('11222333000181')
        info = analisar_certificado(pfx, '1234')
        self.assertEqual(info.cnpj, '11222333000181')
        self.assertTrue(info.vigente)
        self.assertTrue(info.possui_chave_privada)
        self.assertTrue(info.autenticacao_cliente)
        self.assertTrue(info.cadeia_icp_brasil)
        self.assertEqual(validar_para_uso(info), [])

    def test_senha_incorreta(self):  # cenário 2
        pfx, _ = utils.gerar_pfx('11222333000181')
        with self.assertRaisesMessage(CertificadoInvalidoError, 'Senha'):
            analisar_certificado(pfx, 'errada')

    def test_certificado_vencido(self):  # cenário 3
        pfx, _ = utils.gerar_pfx('11222333000181', vencido=True)
        info = analisar_certificado(pfx, '1234')
        self.assertFalse(info.vigente)
        self.assertIn('Certificado vencido ou ainda não vigente.', validar_para_uso(info))

    def test_certificado_incompativel_com_contribuinte(self):  # cenário 4
        pfx, _ = utils.gerar_pfx('11222333000181')
        info = analisar_certificado(pfx, '1234')
        compativel, motivo = compatibilidade_contribuinte(info, '44555666000199')
        self.assertFalse(compativel)
        self.assertIn('593', motivo)
        # Mesmo CNPJ raiz (outro estabelecimento) é aceito.
        self.assertTrue(compatibilidade_contribuinte(info, '11222333000262')[0])

    def test_arquivo_invalido(self):
        with self.assertRaises(CertificadoInvalidoError):
            analisar_certificado(b'nao e um pfx', '1234')

    def test_arquivos_mtls_sao_removidos_e_chave_cifrada(self):
        pfx, _ = utils.gerar_pfx('11222333000181')
        with arquivos_mtls(pfx, '1234') as (cert_path, key_path, _senha):
            with open(key_path, 'rb') as handle:
                self.assertIn(b'ENCRYPTED PRIVATE KEY', handle.read())
            self.assertEqual(os.stat(key_path).st_mode & 0o777, 0o600)
        self.assertFalse(os.path.exists(cert_path))
        self.assertFalse(os.path.exists(key_path))

    def test_criptografia_ida_e_volta(self):
        self.assertEqual(descriptografar(criptografar(b'segredo')), b'segredo')
        self.assertNotIn(b'segredo', criptografar(b'segredo'))


class SegurancaXMLTests(SimpleTestCase):
    def test_xml_malformado(self):  # cenário 32
        with self.assertRaises(XMLMalformadoError):
            parse_xml_seguro(b'<nfeProc><NFe></nfeProc>')

    def test_xml_malicioso_xxe(self):  # cenário 33
        xxe = b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>'
        with self.assertRaises(XMLInseguroError):
            parse_xml_seguro(xxe)

    def test_billion_laughs(self):
        bomba = b'<!DOCTYPE l [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><l>&b;</l>'
        with self.assertRaises(XMLInseguroError):
            parse_xml_seguro(bomba)

    def test_zip_com_taxa_suspeita_e_arquivo_nao_xml(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as arquivo:
            arquivo.writestr('bomba.xml', b'<a>' + b'0' * 3_000_000 + b'</a>')
            arquivo.writestr('virus.exe', b'MZ')
        resultados = {nome: erro for nome, _, erro in extrair_xmls_zip(buffer.getvalue())}
        self.assertIn('zip bomb', resultados['bomba.xml'])
        self.assertIn('somente XML', resultados['virus.exe'])
