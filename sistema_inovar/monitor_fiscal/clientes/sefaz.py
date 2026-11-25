"""Clientes SOAP 1.2 dos serviços de distribuição e de recepção de eventos.

Leiautes conforme MOC NF-e (NFeDistribuicaoDFe, NFeRecepcaoEvento), MOC CT-e
(CTeDistribuicaoDFe) e MOC MDF-e (MDFeDistribuicaoDFe).
"""
from dataclasses import dataclass, field
from typing import List, Optional

from django.conf import settings
from lxml import etree

from .. import constantes as c
from ..parsers import descendente, filho, filhos, nome_local, texto
from ..seguranca import descompactar_gzip_base64, parse_xml_seguro
from .transporte import ComunicacaoError


class RespostaInvalidaError(ComunicacaoError):
    pass


@dataclass
class DocZip:
    nsu: str
    schema: str
    conteudo: bytes


@dataclass
class RetornoDistribuicao:
    cstat: str
    motivo: str
    ult_nsu: str = ''
    max_nsu: str = ''
    data_resposta: str = ''
    documentos: List[DocZip] = field(default_factory=list)
    erros_documentos: list = field(default_factory=list)
    xml_resposta: str = ''


@dataclass
class ServicoDistribuicao:
    fonte: str
    endpoint_chave: str
    ns_dados: str
    ns_wsdl: str
    versao: str
    operacao: str
    elemento_dados: str
    acao_soap: str
    cabecalho_mdfe: bool = False
    aceita_chave: bool = False


SERVICOS = {
    c.FONTE_AN_NFE: ServicoDistribuicao(
        fonte=c.FONTE_AN_NFE, endpoint_chave='NFE_DISTRIBUICAO', ns_dados=c.NS_NFE,
        ns_wsdl=c.NS_WSDL_NFE_DIST, versao='1.01', operacao='nfeDistDFeInteresse',
        elemento_dados='nfeDadosMsg', acao_soap=f'{c.NS_WSDL_NFE_DIST}/nfeDistDFeInteresse', aceita_chave=True,
    ),
    c.FONTE_AN_CTE: ServicoDistribuicao(
        fonte=c.FONTE_AN_CTE, endpoint_chave='CTE_DISTRIBUICAO', ns_dados=c.NS_CTE,
        ns_wsdl=c.NS_WSDL_CTE_DIST, versao='1.00', operacao='cteDistDFeInteresse',
        elemento_dados='cteDadosMsg', acao_soap=f'{c.NS_WSDL_CTE_DIST}/cteDistDFeInteresse',
    ),
    c.FONTE_AN_MDFE: ServicoDistribuicao(
        fonte=c.FONTE_AN_MDFE, endpoint_chave='MDFE_DISTRIBUICAO', ns_dados=c.NS_MDFE,
        ns_wsdl=c.NS_WSDL_MDFE_DIST, versao='1.00', operacao='mdfeDistDFeInteresse',
        elemento_dados='mdfeDadosMsg', acao_soap=f'{c.NS_WSDL_MDFE_DIST}/mdfeDistDFeInteresse',
        cabecalho_mdfe=True,
    ),
}


def endpoint(chave, ambiente):
    sobrescritos = getattr(settings, 'MONITOR_FISCAL_ENDPOINTS', {}) or {}
    url = (sobrescritos.get(chave) or {}).get(ambiente) or c.ENDPOINTS[chave].get(ambiente, '')
    if not url:
        raise ComunicacaoError(
            f'Endereço oficial de {chave} para o ambiente {ambiente} não está configurado. '
            'Confirme-o na relação oficial de Web Services e defina MONITOR_FISCAL_ENDPOINTS.'
        )
    return url


def formatar_nsu(valor) -> str:
    """NSU com 15 posições e zeros à esquerda, conforme leiaute."""
    return str(int(str(valor or '0').strip() or '0')).zfill(15)


def montar_dist_dfe(servico: ServicoDistribuicao, *, ambiente, cnpj, cuf_autor='', ult_nsu=None,
                    nsu=None, chave=None) -> bytes:
    ns = servico.ns_dados
    raiz = etree.Element(f'{{{ns}}}distDFeInt', nsmap={None: ns}, versao=servico.versao)
    etree.SubElement(raiz, f'{{{ns}}}tpAmb').text = str(ambiente)
    if cuf_autor and servico.fonte != c.FONTE_AN_MDFE:
        etree.SubElement(raiz, f'{{{ns}}}cUFAutor').text = str(cuf_autor)
    etree.SubElement(raiz, f'{{{ns}}}CNPJ').text = cnpj
    if chave:
        if not servico.aceita_chave:
            raise ValueError('Consulta por chave não é suportada por este serviço.')
        grupo = etree.SubElement(raiz, f'{{{ns}}}consChNFe')
        etree.SubElement(grupo, f'{{{ns}}}chNFe').text = chave
    elif nsu is not None:
        grupo = etree.SubElement(raiz, f'{{{ns}}}consNSU')
        etree.SubElement(grupo, f'{{{ns}}}NSU').text = formatar_nsu(nsu)
    else:
        grupo = etree.SubElement(raiz, f'{{{ns}}}distNSU')
        etree.SubElement(grupo, f'{{{ns}}}ultNSU').text = formatar_nsu(ult_nsu)
    return etree.tostring(raiz, encoding='utf-8')


def envelope_soap12(servico: ServicoDistribuicao, dados_xml: bytes, cuf='') -> bytes:
    soap = c.NS_SOAP12
    env = etree.Element(f'{{{soap}}}Envelope', nsmap={'soap12': soap})
    if servico.cabecalho_mdfe:
        header = etree.SubElement(env, f'{{{soap}}}Header')
        cab = etree.SubElement(header, f'{{{servico.ns_wsdl}}}mdfeCabecMsg', nsmap={None: servico.ns_wsdl})
        if cuf:
            etree.SubElement(cab, f'{{{servico.ns_wsdl}}}cUF').text = str(cuf)
        etree.SubElement(cab, f'{{{servico.ns_wsdl}}}versaoDados').text = servico.versao
    body = etree.SubElement(env, f'{{{soap}}}Body')
    if servico.cabecalho_mdfe:
        container = body
    else:
        container = etree.SubElement(body, f'{{{servico.ns_wsdl}}}{servico.operacao}', nsmap={None: servico.ns_wsdl})
    dados = etree.SubElement(container, f'{{{servico.ns_wsdl}}}{servico.elemento_dados}', nsmap={None: servico.ns_wsdl})
    dados.append(etree.fromstring(dados_xml))
    return etree.tostring(env, encoding='utf-8', xml_declaration=True)


def _cabecalhos(servico):
    return {'Content-Type': f'application/soap+xml; charset=utf-8; action="{servico.acao_soap}"'}


def interpretar_retorno_distribuicao(conteudo) -> RetornoDistribuicao:
    raiz = parse_xml_seguro(conteudo)
    ret = raiz if nome_local(raiz) == 'retDistDFeInt' else descendente(raiz, 'retDistDFeInt')
    if ret is None:
        fault = descendente(raiz, 'Fault')
        if fault is not None:
            motivo = texto(descendente(fault, 'Text')) or texto(descendente(fault, 'faultstring'))
            raise RespostaInvalidaError(f'SOAP Fault: {motivo[:300]}')
        raise RespostaInvalidaError('Resposta sem retDistDFeInt.')
    retorno = RetornoDistribuicao(
        cstat=texto(ret, 'cStat'),
        motivo=texto(ret, 'xMotivo'),
        ult_nsu=texto(ret, 'ultNSU'),
        max_nsu=texto(ret, 'maxNSU'),
        data_resposta=texto(ret, 'dhResp'),
    )
    lote = filho(ret, 'loteDistDFeInt')
    for doc in filhos(lote, 'docZip'):
        nsu = doc.get('NSU', '')
        schema = doc.get('schema', '')
        try:
            conteudo_doc = descompactar_gzip_base64(doc.text or '')
            retorno.documentos.append(DocZip(nsu=nsu, schema=schema, conteudo=conteudo_doc))
        except Exception as exc:  # noqa: BLE001 - registra e preserva o NSU com erro
            retorno.erros_documentos.append({'nsu': nsu, 'schema': schema, 'erro': str(exc)[:300],
                                             'conteudo_base64': (doc.text or '')[:200000]})
    return retorno


class ClienteDistribuicao:
    def __init__(self, fonte, transporte, ambiente):
        if fonte not in SERVICOS:
            raise ValueError(f'Fonte sem cliente SOAP: {fonte}')
        self.servico = SERVICOS[fonte]
        self.transporte = transporte
        self.ambiente = ambiente

    def consultar(self, *, cnpj, cuf_autor='', ult_nsu=None, nsu=None, chave=None) -> RetornoDistribuicao:
        dados = montar_dist_dfe(self.servico, ambiente=self.ambiente, cnpj=cnpj, cuf_autor=cuf_autor,
                                ult_nsu=ult_nsu, nsu=nsu, chave=chave)
        corpo = envelope_soap12(self.servico, dados, cuf=cuf_autor)
        url = endpoint(self.servico.endpoint_chave, self.ambiente)
        resposta = self.transporte.post(url, corpo, _cabecalhos(self.servico))
        if resposta.status >= 500 and 'Envelope' not in (resposta.texto or ''):
            raise ComunicacaoError(f'Serviço governamental respondeu HTTP {resposta.status}.')
        if resposta.status in (401, 403):
            raise ComunicacaoError(
                f'Acesso negado pelo serviço (HTTP {resposta.status}). Verifique o certificado digital.'
            )
        retorno = interpretar_retorno_distribuicao(resposta.conteudo or resposta.texto.encode('utf-8'))
        retorno.xml_resposta = resposta.texto[:20000]
        return retorno


# --- Recepção de evento (manifestação) ---------------------------------------


@dataclass
class RetornoEvento:
    cstat_lote: str
    motivo_lote: str
    cstat: str = ''
    motivo: str = ''
    protocolo: str = ''
    data_registro: str = ''
    xml_ret_evento: str = ''
    xml_resposta: str = ''


def envelope_evento(env_evento: bytes) -> bytes:
    soap = c.NS_SOAP12
    ns = c.NS_WSDL_NFE_EVENTO
    env = etree.Element(f'{{{soap}}}Envelope', nsmap={'soap12': soap})
    body = etree.SubElement(env, f'{{{soap}}}Body')
    dados = etree.SubElement(body, f'{{{ns}}}nfeDadosMsg', nsmap={None: ns})
    dados.append(etree.fromstring(env_evento))
    return etree.tostring(env, encoding='utf-8', xml_declaration=True)


def interpretar_retorno_evento(conteudo) -> RetornoEvento:
    raiz = parse_xml_seguro(conteudo)
    ret = raiz if nome_local(raiz) == 'retEnvEvento' else descendente(raiz, 'retEnvEvento')
    if ret is None:
        raise RespostaInvalidaError('Resposta sem retEnvEvento.')
    retorno = RetornoEvento(cstat_lote=texto(ret, 'cStat'), motivo_lote=texto(ret, 'xMotivo'))
    ret_evento = filho(ret, 'retEvento')
    if ret_evento is not None:
        inf = filho(ret_evento, 'infEvento')
        retorno.cstat = texto(inf, 'cStat')
        retorno.motivo = texto(inf, 'xMotivo')
        retorno.protocolo = texto(inf, 'nProt')
        retorno.data_registro = texto(inf, 'dhRegEvento')
        retorno.xml_ret_evento = etree.tostring(ret_evento, encoding='unicode')
    return retorno


class ClienteRecepcaoEvento:
    def __init__(self, transporte, ambiente):
        self.transporte = transporte
        self.ambiente = ambiente

    def enviar(self, env_evento: bytes) -> RetornoEvento:
        corpo = envelope_evento(env_evento)
        url = endpoint('NFE_RECEPCAO_EVENTO_AN', self.ambiente)
        headers = {
            'Content-Type': f'application/soap+xml; charset=utf-8; action="{c.NS_WSDL_NFE_EVENTO}/nfeRecepcaoEvento"'
        }
        resposta = self.transporte.post(url, corpo, headers)
        if resposta.status in (401, 403):
            raise ComunicacaoError(f'Acesso negado pelo serviço (HTTP {resposta.status}).')
        if resposta.status >= 500 and 'Envelope' not in (resposta.texto or ''):
            raise ComunicacaoError(f'Serviço governamental respondeu HTTP {resposta.status}.')
        retorno = interpretar_retorno_evento(resposta.conteudo or resposta.texto.encode('utf-8'))
        retorno.xml_resposta = resposta.texto[:20000]
        return retorno
