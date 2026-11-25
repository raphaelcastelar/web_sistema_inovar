"""Assinatura XMLDSig no padrão do Projeto NF-e.

Padrão do leiaute (Manual de Orientação do Contribuinte, item Assinatura
Digital): assinatura enveloped, C14N 1.0 (REC-xml-c14n-20010315), RSA-SHA1,
digest SHA1, referência ao atributo Id do elemento assinado e certificado em
X509Data.
"""
import base64
import hashlib

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from lxml import etree

from .constantes import NS_DSIG

C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'
RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1'


def _c14n(elemento) -> bytes:
    return etree.tostring(elemento, method='c14n', exclusive=False, with_comments=False)


def assinar(elemento_pai, elemento_assinado, chave_privada, certificado):
    """Insere <Signature> como último filho de elemento_pai, assinando elemento_assinado."""
    referencia = elemento_assinado.get('Id')
    if not referencia:
        raise ValueError('Elemento a ser assinado não possui atributo Id.')

    digest = base64.b64encode(hashlib.sha1(_c14n(elemento_assinado)).digest()).decode()

    ds = NS_DSIG
    assinatura = etree.SubElement(elemento_pai, f'{{{ds}}}Signature', nsmap={None: ds})
    signed_info = etree.SubElement(assinatura, f'{{{ds}}}SignedInfo')
    etree.SubElement(signed_info, f'{{{ds}}}CanonicalizationMethod', Algorithm=C14N)
    etree.SubElement(signed_info, f'{{{ds}}}SignatureMethod', Algorithm=RSA_SHA1)
    ref = etree.SubElement(signed_info, f'{{{ds}}}Reference', URI=f'#{referencia}')
    transforms = etree.SubElement(ref, f'{{{ds}}}Transforms')
    etree.SubElement(transforms, f'{{{ds}}}Transform', Algorithm=ENVELOPED)
    etree.SubElement(transforms, f'{{{ds}}}Transform', Algorithm=C14N)
    etree.SubElement(ref, f'{{{ds}}}DigestMethod', Algorithm=SHA1)
    etree.SubElement(ref, f'{{{ds}}}DigestValue').text = digest

    assinatura_bytes = chave_privada.sign(_c14n(signed_info), padding.PKCS1v15(), hashes.SHA1())
    etree.SubElement(assinatura, f'{{{ds}}}SignatureValue').text = base64.b64encode(assinatura_bytes).decode()
    key_info = etree.SubElement(assinatura, f'{{{ds}}}KeyInfo')
    x509_data = etree.SubElement(key_info, f'{{{ds}}}X509Data')
    der = certificado.public_bytes(serialization.Encoding.DER)
    etree.SubElement(x509_data, f'{{{ds}}}X509Certificate').text = base64.b64encode(der).decode()
    return assinatura


def verificar(elemento_assinado, assinatura, certificado) -> bool:
    """Verificação local (usada em testes e na conferência do XML gerado)."""
    ds = {'ds': NS_DSIG}
    digest_esperado = assinatura.findtext('ds:SignedInfo/ds:Reference/ds:DigestValue', namespaces=ds)
    digest = base64.b64encode(hashlib.sha1(_c14n(elemento_assinado)).digest()).decode()
    if digest != digest_esperado:
        return False
    signed_info = assinatura.find('ds:SignedInfo', namespaces=ds)
    valor = base64.b64decode(assinatura.findtext('ds:SignatureValue', namespaces=ds))
    try:
        certificado.public_key().verify(valor, _c14n(signed_info), padding.PKCS1v15(), hashes.SHA1())
    except Exception:  # noqa: BLE001
        return False
    return True
