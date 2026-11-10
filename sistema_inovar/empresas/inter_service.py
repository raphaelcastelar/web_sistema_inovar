import base64
import logging
import os
import threading
import time
from dataclasses import dataclass

import requests
from django.conf import settings


logger = logging.getLogger(__name__)


class InterConfigurationError(RuntimeError):
    pass


class InterAPIError(RuntimeError):
    def __init__(self, message, *, status_code=None, response_body=None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


@dataclass
class _Token:
    value: str = ''
    expires_at: float = 0


_token = _Token()
_token_lock = threading.Lock()


def _certificate_pair():
    certificate = os.path.abspath(os.path.expanduser(settings.INTER_CERT_PATH))
    private_key = os.path.abspath(os.path.expanduser(settings.INTER_KEY_PATH))
    missing = [path for path in (certificate, private_key) if not os.path.isfile(path)]
    if missing:
        raise InterConfigurationError(
            'Certificado/chave do Banco Inter nao encontrados nos caminhos configurados.'
        )
    return certificate, private_key


def validate_configuration():
    if not settings.INTER_CLIENT_ID or not settings.INTER_CLIENT_SECRET:
        raise InterConfigurationError(
            'INTER_CLIENT_ID e INTER_CLIENT_SECRET precisam ser configurados.'
        )
    _certificate_pair()


def _safe_error_body(response):
    try:
        body = response.json()
    except ValueError:
        body = (response.text or '')[:1000]
    if isinstance(body, dict):
        body.pop('access_token', None)
        body.pop('client_secret', None)
    return body


def get_access_token(force_refresh=False):
    validate_configuration()
    now = time.monotonic()
    if not force_refresh and _token.value and now < _token.expires_at:
        return _token.value

    with _token_lock:
        now = time.monotonic()
        if not force_refresh and _token.value and now < _token.expires_at:
            return _token.value

        try:
            response = requests.post(
                settings.INTER_OAUTH_URL,
                data={
                    'client_id': settings.INTER_CLIENT_ID,
                    'client_secret': settings.INTER_CLIENT_SECRET,
                    'grant_type': 'client_credentials',
                    'scope': settings.INTER_SCOPE,
                },
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
                cert=_certificate_pair(),
                timeout=settings.INTER_REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:
            raise InterAPIError('Falha de conexao ao autenticar no Banco Inter.') from exc

        if response.status_code not in (200, 201):
            raise InterAPIError(
                'O Banco Inter recusou a autenticacao.',
                status_code=response.status_code,
                response_body=_safe_error_body(response),
            )

        try:
            data = response.json()
            access_token = data['access_token']
        except (ValueError, KeyError, TypeError) as exc:
            raise InterAPIError('Resposta OAuth invalida do Banco Inter.') from exc

        expires_in = max(int(data.get('expires_in') or 3600), 60)
        _token.value = access_token
        _token.expires_at = time.monotonic() + expires_in - min(60, expires_in // 10)
        return access_token


def _request(method, path, *, json=None, retry_auth=True):
    headers = {
        'Authorization': f'Bearer {get_access_token()}',
        'Accept': 'application/json',
    }
    if json is not None:
        headers['Content-Type'] = 'application/json'
    if settings.INTER_CONTA_CORRENTE:
        headers['x-conta-corrente'] = settings.INTER_CONTA_CORRENTE

    try:
        response = requests.request(
            method,
            f"{settings.INTER_API_BASE_URL.rstrip('/')}/{path.lstrip('/')}",
            headers=headers,
            json=json,
            cert=_certificate_pair(),
            timeout=settings.INTER_REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise InterAPIError('Falha de conexao com a API do Banco Inter.') from exc

    if response.status_code == 401 and retry_auth:
        get_access_token(force_refresh=True)
        return _request(method, path, json=json, retry_auth=False)
    if response.status_code < 200 or response.status_code >= 300:
        raise InterAPIError(
            'A API do Banco Inter recusou a operacao.',
            status_code=response.status_code,
            response_body=_safe_error_body(response),
        )
    return response


def issue_billing(payload):
    response = _request('POST', '/cobrancas', json=payload)
    try:
        data = response.json()
        request_code = data['codigoSolicitacao']
    except (ValueError, KeyError, TypeError) as exc:
        raise InterAPIError('Resposta de emissao invalida do Banco Inter.') from exc
    return str(request_code), data


def retrieve_billing(request_code):
    return _request('GET', f'/cobrancas/{request_code}').json()


def retrieve_billing_pdf(request_code):
    response = _request('GET', f'/cobrancas/{request_code}/pdf')
    content_type = (response.headers.get('Content-Type') or '').lower()
    if 'application/pdf' in content_type or response.content.startswith(b'%PDF'):
        return response.content
    try:
        data = response.json()
        encoded_pdf = data['pdf']
        return base64.b64decode(encoded_pdf, validate=True)
    except (ValueError, KeyError, TypeError) as exc:
        raise InterAPIError('Resposta de PDF invalida do Banco Inter.') from exc


def wait_for_billing(request_code, attempts=6, delay=1.5):
    last_error = None
    for attempt in range(attempts):
        try:
            data = retrieve_billing(request_code)
            situation = str((data.get('cobranca') or {}).get('situacao') or '').upper()
            if situation and situation not in {'EM_PROCESSAMENTO'}:
                return data
        except InterAPIError as exc:
            last_error = exc
            if exc.status_code not in (404, 409, 429, 500, 502, 503, 504):
                raise
        if attempt + 1 < attempts:
            time.sleep(delay)
    if last_error:
        raise last_error
    raise InterAPIError('A cobranca do Banco Inter ainda esta em processamento.')


def wait_for_billing_pdf(request_code, attempts=6, delay=1.5):
    last_error = None
    for attempt in range(attempts):
        try:
            return retrieve_billing_pdf(request_code)
        except InterAPIError as exc:
            last_error = exc
            if exc.status_code not in (404, 409, 429, 500, 502, 503, 504):
                raise
        if attempt + 1 < attempts:
            time.sleep(delay)
    if last_error:
        raise last_error
    raise InterAPIError('O PDF da cobranca do Banco Inter ainda nao esta disponivel.')


def configure_webhook(webhook_url):
    _request('PUT', '/cobrancas/webhook', json={'webhookUrl': webhook_url})


def reset_token_cache():
    """Somente para testes e rotacao controlada de credenciais."""
    with _token_lock:
        _token.value = ''
        _token.expires_at = 0
