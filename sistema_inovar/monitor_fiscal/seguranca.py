"""Primitivas de segurança do Monitor Fiscal.

- Criptografia simétrica (Fernet) para certificados e senhas.
- Parser XML endurecido contra XXE, entidades e acesso à rede.
- Leitura de ZIP com limites contra zip bomb e path traversal.
"""
import hashlib
import io
import zipfile

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from lxml import etree


class XMLInseguroError(ValueError):
    """XML rejeitado por conter construções potencialmente maliciosas."""


class XMLMalformadoError(ValueError):
    """XML sintaticamente inválido."""


# --- Criptografia ------------------------------------------------------------

def _fernet():
    chave = getattr(settings, 'MONITOR_FISCAL_CHAVE_CRIPTOGRAFIA', '') or ''
    if not chave:
        raise ImproperlyConfigured(
            'MONITOR_FISCAL_CHAVE_CRIPTOGRAFIA não configurada. Gere uma chave com '
            '"python -c \'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\'" '
            'e defina-a no .env do servidor. Sem ela nenhum certificado é armazenado.'
        )
    try:
        return Fernet(chave.encode() if isinstance(chave, str) else chave)
    except (ValueError, TypeError) as exc:
        raise ImproperlyConfigured('MONITOR_FISCAL_CHAVE_CRIPTOGRAFIA inválida.') from exc


def criptografar(dados: bytes) -> bytes:
    return _fernet().encrypt(dados)


def descriptografar(dados: bytes) -> bytes:
    try:
        return _fernet().decrypt(bytes(dados))
    except InvalidToken as exc:
        raise ImproperlyConfigured(
            'Não foi possível descriptografar o dado protegido. A chave '
            'MONITOR_FISCAL_CHAVE_CRIPTOGRAFIA foi alterada?'
        ) from exc


def sha256_hex(dados) -> str:
    if isinstance(dados, str):
        dados = dados.encode('utf-8')
    return hashlib.sha256(dados).hexdigest()


# --- XML seguro --------------------------------------------------------------

TAMANHO_MAXIMO_XML = 10 * 1024 * 1024  # 10 MB por documento


def _parser():
    return etree.XMLParser(
        resolve_entities=False,
        no_network=True,
        load_dtd=False,
        dtd_validation=False,
        huge_tree=False,
        remove_comments=False,
        recover=False,
    )


def parse_xml_seguro(conteudo):
    """Faz o parse de um XML rejeitando DTD/entidades (XXE e billion laughs)."""
    if isinstance(conteudo, str):
        conteudo = conteudo.encode('utf-8')
    if not conteudo or not conteudo.strip():
        raise XMLMalformadoError('Conteúdo XML vazio.')
    if len(conteudo) > TAMANHO_MAXIMO_XML:
        raise XMLInseguroError('XML excede o tamanho máximo permitido.')
    cabecalho = conteudo[:4096].upper()
    if b'<!DOCTYPE' in cabecalho or b'<!ENTITY' in conteudo.upper():
        raise XMLInseguroError('XML com DTD ou declaração de entidade não é aceito.')
    # Remove BOM UTF-8 eventualmente presente.
    if conteudo.startswith(b'\xef\xbb\xbf'):
        conteudo = conteudo[3:]
    try:
        raiz = etree.fromstring(conteudo.strip(), parser=_parser())
    except etree.XMLSyntaxError as exc:
        raise XMLMalformadoError(f'XML malformado: {exc}') from exc
    if raiz is None:
        raise XMLMalformadoError('XML sem elemento raiz.')
    return raiz


# --- ZIP seguro --------------------------------------------------------------

ZIP_MAX_ARQUIVOS = 5000
ZIP_MAX_TAMANHO_TOTAL = 500 * 1024 * 1024  # descompactado
ZIP_MAX_TAMANHO_ARQUIVO = TAMANHO_MAXIMO_XML
ZIP_MAX_TAXA_COMPRESSAO = 200


class ZipInseguroError(ValueError):
    pass


def extrair_xmls_zip(conteudo: bytes):
    """Gera (nome, bytes) de cada XML do ZIP, respeitando limites de segurança.

    Arquivos que não terminam em .xml são ignorados e informados como rejeitados.
    ZIPs aninhados não são expandidos.
    """
    try:
        arquivo = zipfile.ZipFile(io.BytesIO(conteudo))
    except zipfile.BadZipFile as exc:
        raise ZipInseguroError('Arquivo ZIP inválido.') from exc

    infos = [info for info in arquivo.infolist() if not info.is_dir()]
    if len(infos) > ZIP_MAX_ARQUIVOS:
        raise ZipInseguroError(f'ZIP contém mais de {ZIP_MAX_ARQUIVOS} arquivos.')
    total = sum(info.file_size for info in infos)
    if total > ZIP_MAX_TAMANHO_TOTAL:
        raise ZipInseguroError('Conteúdo descompactado do ZIP excede o limite permitido.')

    for info in infos:
        nome = info.filename
        if not nome.lower().endswith('.xml'):
            yield nome, None, 'Arquivo ignorado: somente XML é processado.'
            continue
        if info.file_size > ZIP_MAX_TAMANHO_ARQUIVO:
            yield nome, None, 'Arquivo excede o tamanho máximo permitido.'
            continue
        if info.compress_size and info.file_size / max(info.compress_size, 1) > ZIP_MAX_TAXA_COMPRESSAO:
            yield nome, None, 'Taxa de compressão suspeita (possível zip bomb).'
            continue
        with arquivo.open(info) as handle:
            dados = handle.read(ZIP_MAX_TAMANHO_ARQUIVO + 1)
        if len(dados) > ZIP_MAX_TAMANHO_ARQUIVO:
            yield nome, None, 'Arquivo excede o tamanho máximo permitido.'
            continue
        yield nome, dados, None


def descompactar_gzip_base64(valor: str) -> bytes:
    """Decodifica o conteúdo docZip (base64 + gzip) com limite de tamanho."""
    import base64
    import gzip

    bruto = base64.b64decode(valor)
    with gzip.GzipFile(fileobj=io.BytesIO(bruto)) as handle:
        dados = handle.read(TAMANHO_MAXIMO_XML + 1)
    if len(dados) > TAMANHO_MAXIMO_XML:
        raise XMLInseguroError('Documento descompactado excede o tamanho máximo.')
    return dados
