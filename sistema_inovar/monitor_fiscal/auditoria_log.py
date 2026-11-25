"""Trilha de auditoria das operações sensíveis do Monitor Fiscal."""
import logging

from .models import RegistroAuditoria

logger = logging.getLogger(__name__)

_CHAVES_PROIBIDAS = ('senha', 'password', 'pfx', 'chave_privada', 'private', 'arquivo_cifrado', 'certificado_conteudo')


def _sanitizar(valor):
    if isinstance(valor, dict):
        return {
            k: ('***' if any(p in str(k).lower() for p in _CHAVES_PROIBIDAS) else _sanitizar(v))
            for k, v in valor.items()
        }
    if isinstance(valor, (list, tuple)):
        return [_sanitizar(v) for v in valor]
    if isinstance(valor, (bytes, bytearray)):
        return '<binário omitido>'
    if isinstance(valor, (str, int, float, bool)) or valor is None:
        return valor
    return str(valor)


def registrar(usuario, empresa, operacao, origem='usuario', resultado='sucesso', detalhes=None, antes=None,
              depois=None):
    try:
        return RegistroAuditoria.objects.create(
            usuario=usuario if getattr(usuario, 'pk', None) else None,
            empresa=empresa,
            operacao=operacao,
            origem=origem,
            resultado=resultado,
            detalhes=_sanitizar(detalhes or {}),
            antes=_sanitizar(antes or {}),
            depois=_sanitizar(depois or {}),
        )
    except Exception:  # noqa: BLE001 - auditoria não pode derrubar a operação principal
        logger.exception('Falha ao registrar auditoria da operação %s', operacao)
        return None
