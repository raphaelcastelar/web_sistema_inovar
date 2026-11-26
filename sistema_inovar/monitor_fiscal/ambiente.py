"""Ambiente fiscal (produção/homologação da SEFAZ) adotado por esta instalação.

Não confundir com o ambiente do sistema INOVAR: a instalação de homologação do
sistema pode operar somente no ambiente de homologação da SEFAZ, enquanto a
produção opera no ambiente de produção.

MONITOR_FISCAL_AMBIENTE_PADRAO      ambiente usado em novas configurações e telas.
MONITOR_FISCAL_AMBIENTES_PERMITIDOS ambientes que esta instalação pode consultar.
"""
from django.conf import settings

from . import constantes as c


def ambiente_padrao():
    valor = int(getattr(settings, 'MONITOR_FISCAL_AMBIENTE_PADRAO', c.PRODUCAO) or c.PRODUCAO)
    return valor if valor in (c.PRODUCAO, c.HOMOLOGACAO) else c.PRODUCAO


def ambientes_permitidos():
    valores = getattr(settings, 'MONITOR_FISCAL_AMBIENTES_PERMITIDOS', None) or [c.PRODUCAO, c.HOMOLOGACAO]
    permitidos = [int(v) for v in valores if int(v) in (c.PRODUCAO, c.HOMOLOGACAO)]
    return permitidos or [ambiente_padrao()]


def ambiente_permitido(ambiente):
    try:
        return int(ambiente) in ambientes_permitidos()
    except (TypeError, ValueError):
        return False


def mensagem_bloqueio(ambiente):
    nome = dict(c.AMBIENTE_CHOICES).get(int(ambiente), str(ambiente))
    return (f'Esta instalação não opera no ambiente fiscal de {nome}. '
            f'Ambientes permitidos: {", ".join(dict(c.AMBIENTE_CHOICES)[a] for a in ambientes_permitidos())}.')
