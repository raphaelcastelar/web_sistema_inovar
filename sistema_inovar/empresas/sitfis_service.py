"""Relatório de Situação Fiscal (SITFIS) pelo Integra Contador.

Fluxo oficial (documentação Integra Contador > Integra SITFIS):
  1. /Apoiar  SOLICITARPROTOCOLO91 (dados vazio) -> protocoloRelatorio e tempoEspera (ms).
  2. /Emitir  RELATORIOSITFIS92 {"protocoloRelatorio": ...}
       200 -> PDF em base64 (campo "pdf");
       202 -> ainda em processamento, novo tempoEspera em "dados" ([Sucesso-Sitfis-SC02]);
       204 -> ainda em processamento, tempoEspera no cabeçalho ETag ("tempoEspera:4000").
  - O protocolo vale somente na data da solicitação: fica em cache até o fim do dia
    para que novas tentativas não paguem um novo /Apoiar.
  - [Aviso-Sitfis-AV02/AV03] no /Apoiar: aguardar tempoEspera e solicitar de novo.
  - [Erro-Sitfis-ER05] ou campo divergente (EI01) no /Emitir: iniciar novo /Apoiar.

A espera dentro de uma requisição HTTP é limitada; quando o relatório ainda não está
pronto, o chamador recebe "pendente" com o tempo de espera e repete a chamada, que
reaproveita o protocolo em cache.
"""
import json
import logging
import re
import time
from datetime import timedelta

import requests
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from empresas.serpro_service import (
    GATEWAY_URL,
    SERPRO_TIMEOUT,
    SERPRO_TOKEN_CACHE_KEY,
    _documentos_base64_consdecrec,
    _get_serpro_auth_error,
    get_serpro_token,
)

logger = logging.getLogger(__name__)

ID_SISTEMA = 'SITFIS'
SERVICO_PROTOCOLO = 'SOLICITARPROTOCOLO91'
SERVICO_RELATORIO = 'RELATORIOSITFIS92'
ESPERA_PADRAO_MS = 4000
ESPERA_MAXIMA_UNITARIA_MS = 15000
MAX_CHAMADAS_EMITIR = 6
MAX_SOLICITACOES_PROTOCOLO = 2


def _versao():
    return str(getattr(settings, 'SERPRO_SITFIS_VERSAO', '2.0'))


def _prazo_padrao():
    return float(getattr(settings, 'SERPRO_SITFIS_PRAZO_SEGUNDOS', 40))


def _somente_digitos(valor):
    return re.sub(r'\D', '', str(valor or ''))


def chave_cache_protocolo(cnpj, hoje=None):
    hoje = hoje or timezone.localdate()
    return f'sitfis_protocolo:{cnpj}:{hoje:%Y%m%d}'


def _segundos_ate_fim_do_dia():
    agora = timezone.localtime()
    fim = (agora + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(60, int((fim - agora).total_seconds()) - 30)


def _json(response):
    try:
        corpo = response.json()
    except ValueError:
        return {}
    return corpo if isinstance(corpo, dict) else {}


def _dados(corpo):
    dados = corpo.get('dados')
    if isinstance(dados, str):
        dados = dados.strip()
        if not dados:
            return None
        try:
            return json.loads(dados)
        except ValueError:
            return dados
    return dados


def _procurar(valor, campo):
    """Busca um campo (sem diferenciar maiúsculas) em dicionários e listas aninhados."""
    alvo = campo.lower()
    if isinstance(valor, dict):
        for chave, item in valor.items():
            if str(chave).lower() == alvo and item not in (None, ''):
                return item
        for item in valor.values():
            encontrado = _procurar(item, campo)
            if encontrado not in (None, ''):
                return encontrado
    elif isinstance(valor, list):
        for item in valor:
            encontrado = _procurar(item, campo)
            if encontrado not in (None, ''):
                return encontrado
    return None


def _valor_etag(response, campo):
    """ETag no formato "campo:valor" (aspas e prefixo W/ opcionais)."""
    etag = (response.headers.get('ETag') or response.headers.get('etag') or '').strip()
    if etag.startswith('W/'):
        etag = etag[2:]
    etag = etag.strip('"').strip()
    for parte in re.split(r'[;,]', etag):
        nome, _, valor = parte.partition(':')
        if nome.strip().lower() == campo.lower() and valor.strip():
            return valor.strip()
    return None


def _espera_ms(response, dados):
    bruto = _procurar(dados, 'tempoEspera') or _valor_etag(response, 'tempoEspera')
    try:
        return max(0, int(float(bruto)))
    except (TypeError, ValueError):
        return None


def _mensagens(corpo):
    itens = corpo.get('mensagens') or []
    return [
        (str(item.get('codigo') or ''), str(item.get('texto') or ''))
        for item in itens if isinstance(item, dict)
    ]


def _tem_codigo(corpo, *codigos):
    presentes = ' '.join(codigo for codigo, _ in _mensagens(corpo)).upper()
    return any(codigo.upper() in presentes for codigo in codigos)


def _texto_erro(corpo, padrao):
    textos = [texto for _, texto in _mensagens(corpo) if texto]
    return ' '.join(textos) if textos else padrao


def _chamar(endpoint, id_servico, cnpj, dados, tokens):
    contratante = _somente_digitos(settings.MEU_ESCRITORIO_CNPJ)
    payload = {
        'contratante': {'numero': contratante, 'tipo': 2},
        'autorPedidoDados': {'numero': contratante, 'tipo': 2},
        'contribuinte': {'numero': cnpj, 'tipo': 2},
        'pedidoDados': {
            'idSistema': ID_SISTEMA,
            'idServico': id_servico,
            'versaoSistema': _versao(),
            'dados': dados,
        },
    }

    def enviar(atuais):
        headers = {
            'Authorization': f"Bearer {atuais['access_token']}",
            'jwt_token': atuais['jwt_token'],
            'Content-Type': 'application/json',
        }
        return requests.post(f'{GATEWAY_URL}/{endpoint}', json=payload, headers=headers, timeout=SERPRO_TIMEOUT)

    response = enviar(tokens)
    if response.status_code == 401:
        cache.delete(SERPRO_TOKEN_CACHE_KEY)
        novos = get_serpro_token()
        if not novos:
            return None, tokens
        tokens.update(novos)
        response = enviar(tokens)
    logger.info('SITFIS %s para %s: HTTP %s', id_servico, cnpj, response.status_code)
    return response, tokens


def solicitar_protocolo(cnpj, tokens):
    """Retorna {'protocolo', 'espera_ms'} | {'aguardar_ms'} | {'erro', 'detalhes'}."""
    response, tokens = _chamar('Apoiar', SERVICO_PROTOCOLO, cnpj, '', tokens)
    if response is None:
        return _get_serpro_auth_error('Falha ao renovar token.')
    corpo = _json(response)
    dados = _dados(corpo)
    protocolo = _procurar(dados, 'protocoloRelatorio') or _valor_etag(response, 'protocoloRelatorio')
    espera = _espera_ms(response, dados)

    if response.status_code in (200, 304) and protocolo:
        return {'protocolo': str(protocolo), 'espera_ms': espera or 0}
    if response.status_code in (200, 503) and espera is not None:
        # AV02 (limite de solicitações em processamento) / AV03 (tente após o tempo de espera).
        return {'aguardar_ms': espera, 'mensagem': _texto_erro(corpo, 'Receita Federal pediu para aguardar.')}
    return {
        'erro': _texto_erro(corpo, f'Não foi possível solicitar o relatório (HTTP {response.status_code}).'),
        'detalhes': corpo or response.text[:2000],
    }


def emitir_relatorio(cnpj, protocolo, tokens):
    """Retorna {'pdf'} | {'aguardar_ms'} | {'reiniciar', 'erro'} | {'erro', 'detalhes'}."""
    dados_envio = json.dumps({'protocoloRelatorio': protocolo})
    response, tokens = _chamar('Emitir', SERVICO_RELATORIO, cnpj, dados_envio, tokens)
    if response is None:
        return _get_serpro_auth_error('Falha ao renovar token.')
    corpo = _json(response)
    dados = _dados(corpo)

    if response.status_code == 200:
        documentos = _documentos_base64_consdecrec(dados if dados is not None else corpo)
        if documentos:
            return {'pdf': documentos[0][1]}
        espera = _espera_ms(response, dados)
        if espera is not None:
            return {'aguardar_ms': espera}
        return {'erro': _texto_erro(corpo, 'A Receita Federal não devolveu o PDF do relatório.'),
                'detalhes': corpo or response.text[:2000]}
    if response.status_code in (202, 204, 304):
        espera = _espera_ms(response, dados)
        return {'aguardar_ms': ESPERA_PADRAO_MS if espera is None else espera}
    if _tem_codigo(corpo, 'ER05', 'EI01'):
        return {'reiniciar': True, 'erro': _texto_erro(corpo, 'Protocolo do relatório inválido.'),
                'detalhes': corpo}
    return {
        'erro': _texto_erro(corpo, f'Não foi possível emitir o relatório (HTTP {response.status_code}).'),
        'detalhes': corpo or response.text[:2000],
    }


def obter_relatorio_situacao_fiscal(cnpj, prazo_segundos=None, dormir=time.sleep, relogio=time.monotonic):
    """Executa o fluxo completo dentro do prazo.

    Retorna {'sucesso': True, 'file_content', 'filename', 'content_type'}
         ou {'sucesso': False, 'pendente': True, 'espera_ms', 'mensagem'}
         ou {'sucesso': False, 'erro', 'detalhes'}.
    """
    cnpj = _somente_digitos(cnpj)
    if len(cnpj) != 14:
        return {'sucesso': False, 'erro': 'Informe um CNPJ válido com 14 dígitos.'}
    tokens = get_serpro_token()
    if not tokens:
        return {'sucesso': False, **_get_serpro_auth_error()}
    tokens = dict(tokens)

    prazo = _prazo_padrao() if prazo_segundos is None else prazo_segundos
    limite = relogio() + prazo
    chave = chave_cache_protocolo(cnpj)
    protocolo = cache.get(chave)
    solicitacoes = 0
    emissoes = 0
    espera = 0

    def pendente(espera_ms, mensagem='O relatório ainda está sendo gerado pela Receita Federal.'):
        return {'sucesso': False, 'pendente': True, 'espera_ms': int(espera_ms or ESPERA_PADRAO_MS),
                'mensagem': mensagem}

    def aguardar(espera_ms):
        """Dorme se couber no prazo; False quando é preciso devolver 'pendente'."""
        segundos = min(espera_ms or ESPERA_PADRAO_MS, ESPERA_MAXIMA_UNITARIA_MS) / 1000
        if relogio() + segundos > limite:
            return False
        dormir(segundos)
        return True

    try:
        while True:
            if not protocolo:
                if solicitacoes >= MAX_SOLICITACOES_PROTOCOLO:
                    return {'sucesso': False, 'erro': 'A Receita Federal não liberou o protocolo do relatório. Tente novamente mais tarde.'}
                solicitacoes += 1
                retorno = solicitar_protocolo(cnpj, tokens)
                if 'erro' in retorno:
                    return {'sucesso': False, **retorno}
                if 'aguardar_ms' in retorno:
                    if not aguardar(retorno['aguardar_ms']):
                        return pendente(retorno['aguardar_ms'], retorno.get('mensagem') or 'A Receita Federal pediu para aguardar.')
                    continue
                protocolo = retorno['protocolo']
                cache.set(chave, protocolo, timeout=_segundos_ate_fim_do_dia())
                espera = retorno.get('espera_ms') or 0

            if espera:
                if not aguardar(espera):
                    return pendente(espera)
                espera = 0

            if emissoes >= MAX_CHAMADAS_EMITIR:
                return pendente(ESPERA_PADRAO_MS)
            emissoes += 1
            retorno = emitir_relatorio(cnpj, protocolo, tokens)
            if 'pdf' in retorno:
                cache.delete(chave)
                agora = timezone.localtime()
                return {
                    'sucesso': True,
                    'file_content': retorno['pdf'],
                    'filename': f'SITUACAO_FISCAL_{cnpj}_{agora:%Y%m%d}.pdf',
                    'content_type': 'application/pdf',
                }
            if retorno.get('reiniciar'):
                cache.delete(chave)
                protocolo = None
                continue
            if 'aguardar_ms' in retorno:
                espera = retorno['aguardar_ms'] or ESPERA_PADRAO_MS
                continue
            return {'sucesso': False, **retorno}
    except requests.exceptions.RequestException as exc:
        logger.error('Erro de comunicação no SITFIS para %s: %s', cnpj, exc)
        return {'sucesso': False, 'erro': 'Erro de comunicação com a API Serpro.', 'detalhes': str(exc)}
