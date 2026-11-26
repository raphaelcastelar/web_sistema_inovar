"""Leitura, validação e uso seguro de certificados digitais ICP-Brasil (A1).

A chave privada nunca é gravada em disco em claro: para a conexão mTLS ela é
exportada para um arquivo temporário cifrado com uma senha aleatória de uso
único, em diretório com permissão 0700, removido logo após o uso.
"""
import contextlib
import os
import re
import secrets
import shutil
import ssl
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone as dt_timezone
from typing import Optional

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

OID_CNPJ = '2.16.76.1.3.3'
OID_CPF_PF = '2.16.76.1.3.1'  # dados do titular PF: nascimento(8) + CPF(11) + ...
OID_RESPONSAVEL_PJ = '2.16.76.1.3.4'  # dados do responsável pela PJ: nascimento(8) + CPF(11)

TAMANHO_MAXIMO_PFX = 64 * 1024


class CertificadoInvalidoError(ValueError):
    pass


@dataclass
class InfoCertificado:
    titular: str
    cnpj: str = ''
    cpf: str = ''
    emissor: str = ''
    numero_serie: str = ''
    valido_de: Optional[datetime] = None
    valido_ate: Optional[datetime] = None
    fingerprint_sha256: str = ''
    possui_chave_privada: bool = False
    autenticacao_cliente: bool = False
    cadeia_icp_brasil: Optional[bool] = None
    alertas: list = field(default_factory=list)

    @property
    def documento(self):
        return self.cnpj or self.cpf

    @property
    def vigente(self):
        agora = datetime.now(dt_timezone.utc)
        return bool(self.valido_de and self.valido_ate and self.valido_de <= agora <= self.valido_ate)


def _somente_digitos(valor):
    return re.sub(r'\D', '', valor or '')


def _decodificar_other_name(valor: bytes) -> str:
    """Decodifica o valor DER de um OtherName ICP-Brasil (string ASN.1 simples)."""
    if not valor:
        return ''
    dados = valor
    # Tipos de string ASN.1 (OCTET STRING, UTF8String, PrintableString, IA5String)
    if dados[0] in (0x04, 0x0C, 0x13, 0x16) and len(dados) > 2:
        tamanho = dados[1]
        inicio = 2
        if tamanho & 0x80:
            n = tamanho & 0x7F
            tamanho = int.from_bytes(dados[2:2 + n], 'big')
            inicio = 2 + n
        dados = dados[inicio:inicio + tamanho]
    return dados.decode('latin-1', errors='ignore')


def _extrair_documentos(cert: x509.Certificate):
    cnpj = cpf = ''
    try:
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        for item in san:
            if not isinstance(item, x509.OtherName):
                continue
            texto = _decodificar_other_name(item.value)
            oid = item.type_id.dotted_string
            if oid == OID_CNPJ:
                cnpj = _somente_digitos(texto)[:14]
            elif oid == OID_CPF_PF and not cnpj:
                digitos = _somente_digitos(texto)
                if len(digitos) >= 19:
                    cpf = digitos[8:19]
    except x509.ExtensionNotFound:
        pass

    if not cnpj and not cpf:
        # Padrão ICP-Brasil: CN = "RAZAO SOCIAL:CNPJ" ou "NOME:CPF"
        try:
            cn = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
        except IndexError:
            cn = ''
        if ':' in cn:
            digitos = _somente_digitos(cn.rsplit(':', 1)[1])
            if len(digitos) == 14:
                cnpj = digitos
            elif len(digitos) == 11:
                cpf = digitos
    return cnpj, cpf


def _nome(cert_name: x509.Name) -> str:
    try:
        return cert_name.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    except IndexError:
        return cert_name.rfc4514_string()


def _cadeia_icp(cert: x509.Certificate, adicionais) -> Optional[bool]:
    """Indica se a cadeia aparenta pertencer à ICP-Brasil.

    A verificação completa (assinaturas, LCR, revogação) é feita pelo servidor
    governamental no handshake TLS. Aqui registramos apenas o indício local:
    True quando a cadeia presente no arquivo referencia a ICP-Brasil, None
    quando o arquivo não traz informações suficientes para concluir.
    """
    textos = [cert.issuer.rfc4514_string()] + [c.subject.rfc4514_string() for c in adicionais or []]
    if any('ICP-Brasil' in texto for texto in textos):
        return True
    return None


def carregar_pfx(conteudo: bytes, senha: str):
    if not conteudo:
        raise CertificadoInvalidoError('Arquivo de certificado vazio.')
    if len(conteudo) > TAMANHO_MAXIMO_PFX:
        raise CertificadoInvalidoError('Arquivo de certificado excede o tamanho esperado para um A1.')
    try:
        chave, cert, adicionais = pkcs12.load_key_and_certificates(
            conteudo, (senha or '').encode('utf-8')
        )
    except ValueError as exc:
        mensagem = str(exc).lower()
        if 'password' in mensagem or 'mac' in mensagem or 'decrypt' in mensagem:
            raise CertificadoInvalidoError('Senha do certificado incorreta.') from exc
        raise CertificadoInvalidoError('Arquivo não é um certificado PFX/P12 válido.') from exc
    if cert is None:
        raise CertificadoInvalidoError('O arquivo não contém certificado.')
    return chave, cert, adicionais or []


def analisar_certificado(conteudo: bytes, senha: str) -> InfoCertificado:
    chave, cert, adicionais = carregar_pfx(conteudo, senha)
    cnpj, cpf = _extrair_documentos(cert)
    try:
        eku = cert.extensions.get_extension_for_class(x509.ExtendedKeyUsage).value
        autenticacao_cliente = ExtendedKeyUsageOID.CLIENT_AUTH in eku
    except x509.ExtensionNotFound:
        autenticacao_cliente = False

    info = InfoCertificado(
        titular=re.sub(r':\d{11,14}$', '', _nome(cert.subject)).strip(),
        cnpj=cnpj,
        cpf=cpf,
        emissor=_nome(cert.issuer),
        numero_serie=format(cert.serial_number, 'x'),
        valido_de=cert.not_valid_before_utc,
        valido_ate=cert.not_valid_after_utc,
        fingerprint_sha256=cert.fingerprint(hashes.SHA256()).hex(),
        possui_chave_privada=chave is not None,
        autenticacao_cliente=autenticacao_cliente,
        cadeia_icp_brasil=_cadeia_icp(cert, adicionais),
    )
    if not info.possui_chave_privada:
        info.alertas.append('Certificado sem chave privada: não pode autenticar nos serviços.')
    if not info.autenticacao_cliente:
        info.alertas.append('Certificado sem uso estendido de autenticação de cliente (clientAuth).')
    if not info.documento:
        info.alertas.append('CNPJ/CPF do titular não identificado no certificado.')
    if not info.vigente:
        info.alertas.append('Certificado fora do período de validade.')
    if info.cadeia_icp_brasil is None:
        info.alertas.append(
            'Cadeia ICP-Brasil não verificável localmente; será confirmada pelo servidor governamental.'
        )
    return info


def validar_para_uso(info: InfoCertificado):
    """Erros que impedem o vínculo do certificado ao monitoramento."""
    erros = []
    if not info.possui_chave_privada:
        erros.append('Certificado sem chave privada utilizável.')
    if not info.vigente:
        erros.append('Certificado vencido ou ainda não vigente.')
    if not info.documento:
        erros.append('Não foi possível identificar o CNPJ/CPF do certificado.')
    return erros


def compatibilidade_contribuinte(info: InfoCertificado, cnpj_contribuinte: str):
    """Regras dos serviços de distribuição: autenticação pelo CNPJ base.

    Retorna (compatível, mensagem). O certificado de um escritório contábil NÃO
    é compatível com o CNPJ de seus clientes nos serviços de distribuição.
    """
    cnpj = _somente_digitos(cnpj_contribuinte)
    if info.cpf and not info.cnpj:
        return False, 'Certificado de pessoa física não pode consultar documentos de CNPJ.'
    if len(cnpj) != 14:
        return False, 'CNPJ do contribuinte inválido.'
    if info.cnpj == cnpj:
        return True, 'Certificado do próprio estabelecimento.'
    if info.cnpj[:8] == cnpj[:8]:
        return True, 'Certificado de estabelecimento com o mesmo CNPJ raiz.'
    return False, (
        'CNPJ raiz do certificado difere do contribuinte. Os serviços de distribuição '
        'autenticam pelo CNPJ base e rejeitam a consulta (cStat 593).'
    )


@contextlib.contextmanager
def arquivos_mtls(conteudo_pfx: bytes, senha: str):
    """Disponibiliza (cert_path, key_path, key_password) temporários para mTLS."""
    chave, cert, adicionais = carregar_pfx(conteudo_pfx, senha)
    if chave is None:
        raise CertificadoInvalidoError('Certificado sem chave privada.')
    senha_temporaria = secrets.token_urlsafe(32).encode()
    diretorio = tempfile.mkdtemp(prefix='mf-mtls-')
    os.chmod(diretorio, 0o700)
    try:
        cert_path = os.path.join(diretorio, 'cert.pem')
        key_path = os.path.join(diretorio, 'key.pem')
        cadeia = cert.public_bytes(serialization.Encoding.PEM) + b''.join(
            c.public_bytes(serialization.Encoding.PEM) for c in adicionais
        )
        fd = os.open(cert_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as handle:
            handle.write(cadeia)
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as handle:
            handle.write(chave.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.BestAvailableEncryption(senha_temporaria),
            ))
        yield cert_path, key_path, senha_temporaria
    finally:
        shutil.rmtree(diretorio, ignore_errors=True)


def criar_contexto_ssl(cert_path, key_path, key_password, ca_bundle=None):
    contexto = ssl.create_default_context(cafile=ca_bundle) if ca_bundle else ssl.create_default_context()
    contexto.minimum_version = ssl.TLSVersion.TLSv1_2
    contexto.load_cert_chain(cert_path, key_path, password=key_password)
    return contexto


def chave_e_certificado(conteudo_pfx: bytes, senha: str):
    """Retorna (chave_privada, certificado) para assinatura XML."""
    chave, cert, _ = carregar_pfx(conteudo_pfx, senha)
    if chave is None:
        raise CertificadoInvalidoError('Certificado sem chave privada.')
    return chave, cert
