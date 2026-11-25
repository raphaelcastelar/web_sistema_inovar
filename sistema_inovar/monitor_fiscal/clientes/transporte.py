"""Transporte HTTPS com autenticação mútua (mTLS) por certificado A1."""
import logging
from dataclasses import dataclass

import requests
from django.conf import settings
from requests.adapters import HTTPAdapter

from ..certificados import arquivos_mtls, criar_contexto_ssl
from ..seguranca import descriptografar

logger = logging.getLogger(__name__)


class ComunicacaoError(Exception):
    """Falha de rede/TLS/HTTP. Nunca contém credenciais."""


@dataclass
class RespostaHTTP:
    status: int
    texto: str
    conteudo: bytes = b''
    content_type: str = ''


class _AdaptadorSSL(HTTPAdapter):
    def __init__(self, contexto, *args, **kwargs):
        self._contexto = contexto
        super().__init__(*args, **kwargs)

    def init_poolmanager(self, *args, **kwargs):
        kwargs['ssl_context'] = self._contexto
        return super().init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, *args, **kwargs):
        kwargs['ssl_context'] = self._contexto
        return super().proxy_manager_for(*args, **kwargs)


class TransporteMTLS:
    """Executa requisições usando o certificado de um CertificadoDigital."""

    def __init__(self, certificado, timeout=None):
        self.certificado = certificado
        self.timeout = timeout or getattr(settings, 'MONITOR_FISCAL_TIMEOUT', 60)
        self.ca_bundle = getattr(settings, 'MONITOR_FISCAL_CA_BUNDLE', '') or None

    def _executar(self, metodo, url, **kwargs):
        pfx = descriptografar(self.certificado.arquivo_cifrado)
        senha = descriptografar(self.certificado.senha_cifrada).decode('utf-8')
        try:
            with arquivos_mtls(pfx, senha) as (cert_path, key_path, key_password):
                contexto = criar_contexto_ssl(cert_path, key_path, key_password, self.ca_bundle)
                with requests.Session() as sessao:
                    sessao.mount('https://', _AdaptadorSSL(contexto))
                    resposta = sessao.request(
                        metodo, url, timeout=self.timeout, verify=self.ca_bundle or True, **kwargs
                    )
        except requests.exceptions.SSLError as exc:
            raise ComunicacaoError(f'Falha TLS com o serviço governamental: {type(exc).__name__}.') from exc
        except requests.exceptions.Timeout as exc:
            raise ComunicacaoError('Tempo limite excedido na comunicação com o serviço governamental.') from exc
        except requests.exceptions.RequestException as exc:
            raise ComunicacaoError(f'Falha de comunicação: {type(exc).__name__}.') from exc
        finally:
            del pfx, senha
        return RespostaHTTP(
            status=resposta.status_code,
            texto=resposta.text,
            conteudo=resposta.content,
            content_type=resposta.headers.get('Content-Type', ''),
        )

    def post(self, url, corpo: bytes, headers: dict):
        return self._executar('POST', url, data=corpo, headers=headers)

    def get(self, url, params=None, headers=None):
        return self._executar('GET', url, params=params, headers=headers or {})
