"""Cliente da API de Distribuição de Contribuintes do ADN (NFS-e Nacional).

Confirmado no "Manual dos Contribuintes - Guia para utilização das APIs do ADN"
v1.0 (12/02/2026):
  - GET /DFe/{NSU}: documentos fiscais de serviço a partir do NSU informado;
  - GET /NFSe/{ChaveAcesso}/Eventos: eventos vinculados a uma NFS-e;
  - autenticação por certificado (mTLS), aceitando certificado com o mesmo
    CNPJ raiz do contribuinte consultado; para a consulta por NSU existe um
    parâmetro adicional para informar o CNPJ consultado.

PENDENTE DE CONFIRMAÇÃO NO SWAGGER (o servidor exige certificado cliente já no
handshake TLS e não pôde ser lido sem um certificado válido):
  - nome exato do parâmetro do CNPJ consultado (adotado: "cnpjConsulta");
  - parâmetro de lote (adotado: "lote=true");
  - nomes dos campos JSON da resposta. O interpretador abaixo aceita as grafias
    conhecidas em PascalCase e camelCase e registra o JSON bruto quando não
    reconhece a estrutura, sem descartar a resposta.
Os nomes podem ser ajustados por MONITOR_FISCAL_ADN_PARAMETROS sem alterar código.
"""
from dataclasses import dataclass, field
from typing import List

from django.conf import settings

from .. import constantes as c
from ..seguranca import descompactar_gzip_base64
from .sefaz import endpoint
from .transporte import ComunicacaoError

STATUS_LOCALIZADOS = 'DOCUMENTOS_LOCALIZADOS'
STATUS_NENHUM = 'NENHUM_DOCUMENTO_LOCALIZADO'
STATUS_REJEICAO = 'REJEICAO'


class RespostaADNInvalidaError(ComunicacaoError):
    pass


@dataclass
class DocumentoADN:
    nsu: str
    chave: str
    tipo_documento: str
    tipo_evento: str
    conteudo: bytes
    data_geracao: str = ''


@dataclass
class RetornoADN:
    status: str
    documentos: List[DocumentoADN] = field(default_factory=list)
    alertas: list = field(default_factory=list)
    erros: list = field(default_factory=list)
    erros_documentos: list = field(default_factory=list)
    http_status: int = 200
    bruto: str = ''


def _parametros():
    padrao = {'cnpj': 'cnpjConsulta', 'lote': 'lote'}
    padrao.update(getattr(settings, 'MONITOR_FISCAL_ADN_PARAMETROS', {}) or {})
    return padrao


def _campo(dados, *nomes, padrao=None):
    if not isinstance(dados, dict):
        return padrao
    normalizado = {str(k).lower(): v for k, v in dados.items()}
    for nome in nomes:
        if nome.lower() in normalizado:
            return normalizado[nome.lower()]
    return padrao


def interpretar_retorno(dados, http_status=200) -> RetornoADN:
    if not isinstance(dados, dict):
        raise RespostaADNInvalidaError('Resposta do ADN não é um objeto JSON.')
    status = str(_campo(dados, 'StatusProcessamento', 'status', padrao='') or '').upper()
    lote = _campo(dados, 'LoteDFe', 'loteDfe', 'Lote', padrao=[]) or []
    retorno = RetornoADN(
        status=status,
        alertas=_campo(dados, 'Alertas', padrao=[]) or [],
        erros=_campo(dados, 'Erros', 'Erro', padrao=[]) or [],
        http_status=http_status,
    )
    for item in lote:
        nsu = str(_campo(item, 'NSU', padrao='') or '')
        try:
            arquivo = _campo(item, 'ArquivoXml', 'arquivoXml', 'Arquivo', padrao='')
            conteudo = descompactar_gzip_base64(arquivo)
        except Exception as exc:  # noqa: BLE001 - preserva o NSU com erro
            retorno.erros_documentos.append({'nsu': nsu, 'erro': str(exc)[:300]})
            continue
        retorno.documentos.append(DocumentoADN(
            nsu=nsu,
            chave=str(_campo(item, 'ChaveAcesso', padrao='') or ''),
            tipo_documento=str(_campo(item, 'TipoDocumento', padrao='') or ''),
            tipo_evento=str(_campo(item, 'TipoEvento', padrao='') or ''),
            conteudo=conteudo,
            data_geracao=str(_campo(item, 'DataHoraGeracao', padrao='') or ''),
        ))
    if not status:
        status = STATUS_LOCALIZADOS if retorno.documentos else (STATUS_REJEICAO if retorno.erros else STATUS_NENHUM)
        retorno.status = status
    return retorno


class ClienteADN:
    def __init__(self, transporte, ambiente):
        self.transporte = transporte
        self.ambiente = ambiente

    def _url(self, caminho):
        return endpoint('ADN_CONTRIBUINTES', self.ambiente).rstrip('/') + caminho

    def distribuicao(self, *, ult_nsu, cnpj_consulta) -> RetornoADN:
        nomes = _parametros()
        params = {nomes['lote']: 'true'}
        if cnpj_consulta:
            params[nomes['cnpj']] = cnpj_consulta
        resposta = self.transporte.get(self._url(f'/DFe/{int(ult_nsu or 0)}'), params=params,
                                       headers={'Accept': 'application/json'})
        return self._interpretar(resposta)

    def eventos_por_chave(self, chave) -> RetornoADN:
        resposta = self.transporte.get(self._url(f'/NFSe/{chave}/Eventos'), headers={'Accept': 'application/json'})
        return self._interpretar(resposta)

    def _interpretar(self, resposta):
        import json

        if resposta.status in (401, 403, 495, 496):
            raise ComunicacaoError(f'ADN recusou o certificado (HTTP {resposta.status}).')
        if resposta.status >= 500:
            raise ComunicacaoError(f'ADN indisponível (HTTP {resposta.status}).')
        if resposta.status == 429:
            retorno = RetornoADN(status='LIMITE_EXCEDIDO', http_status=429, bruto=resposta.texto[:5000])
            return retorno
        try:
            dados = json.loads(resposta.texto or '{}')
        except ValueError as exc:
            raise RespostaADNInvalidaError(f'Resposta do ADN não é JSON (HTTP {resposta.status}).') from exc
        retorno = interpretar_retorno(dados, http_status=resposta.status)
        if resposta.status == 404 and not retorno.documentos:
            retorno.status = retorno.status or STATUS_NENHUM
        retorno.bruto = (resposta.texto or '')[:20000]
        return retorno


FONTE = c.FONTE_ADN_NFSE
