"""Identificação e interpretação dos leiautes fiscais.

Os parsers trabalham por nome local dos elementos, tolerando variações de
versão do leiaute. Campos ausentes ficam vazios: nenhum valor é inventado.
"""
import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

from django.utils.dateparse import parse_datetime, parse_date

from . import constantes as c

# --- Helpers XML -------------------------------------------------------------


def nome_local(elemento):
    tag = elemento.tag
    if not isinstance(tag, str):
        return ''
    return tag.rsplit('}', 1)[-1]


def filho(elemento, *caminho):
    atual = elemento
    for nome in caminho:
        if atual is None:
            return None
        encontrado = None
        for item in atual:
            if nome_local(item) == nome:
                encontrado = item
                break
        atual = encontrado
    return atual


def primeiro(*elementos):
    for elemento in elementos:
        if elemento is not None:
            return elemento
    return None


def filhos(elemento, nome):
    if elemento is None:
        return []
    return [item for item in elemento if nome_local(item) == nome]


def descendente(elemento, nome):
    if elemento is None:
        return None
    for item in elemento.iter():
        if nome_local(item) == nome:
            return item
    return None


def texto(elemento, *caminho, padrao=''):
    alvo = filho(elemento, *caminho) if caminho else elemento
    if alvo is None or alvo.text is None:
        return padrao
    return alvo.text.strip()


def decimal(valor) -> Optional[Decimal]:
    if valor in (None, ''):
        return None
    try:
        return Decimal(str(valor).strip())
    except (InvalidOperation, ValueError):
        return None


def data_hora(valor) -> Optional[datetime]:
    if not valor:
        return None
    valor = valor.strip()
    resultado = parse_datetime(valor)
    if resultado is None:
        data = parse_date(valor[:10])
        if data:
            resultado = datetime(data.year, data.month, data.day)
    if resultado is not None and resultado.tzinfo is None:
        from django.utils import timezone
        resultado = timezone.make_aware(resultado, timezone.get_default_timezone())
    return resultado


def documento_participante(elemento):
    if elemento is None:
        return ''
    return texto(elemento, 'CNPJ') or texto(elemento, 'CPF') or texto(elemento, 'idEstrangeiro')


def participante(elemento, papel):
    if elemento is None:
        return None
    endereco = None
    for nome in ('enderEmit', 'enderDest', 'enderReme', 'enderExped', 'enderReceb', 'enderToma', 'end', 'enderNac'):
        endereco = filho(elemento, nome)
        if endereco is not None:
            break
    dados = {
        'papel': papel,
        'documento': documento_participante(elemento),
        'nome': texto(elemento, 'xNome'),
        'ie': texto(elemento, 'IE'),
    }
    if endereco is not None:
        dados['municipio'] = texto(endereco, 'xMun')
        dados['codigo_municipio'] = texto(endereco, 'cMun')
        dados['uf'] = texto(endereco, 'UF')
    return dados


# --- Resultado de parsing ----------------------------------------------------


@dataclass
class DocumentoInterpretado:
    categoria: str  # 'documento' | 'evento'
    tipo_documento: str
    tipo_conteudo: str  # resumo | completo | evento | resumo_evento
    chave: str
    schema: str = ''
    versao: str = ''
    ambiente: Optional[int] = None
    campos: dict = field(default_factory=dict)
    itens: list = field(default_factory=list)
    evento: dict = field(default_factory=dict)


class LeiauteNaoReconhecidoError(ValueError):
    pass


_RE_CHAVE = re.compile(r'(\d{50}|\d{44})')


def _chave_de_id(valor):
    encontrado = _RE_CHAVE.search(valor or '')
    return encontrado.group(1) if encontrado else ''


def _competencia(data):
    if not data:
        return None
    return data.date().replace(day=1)


def _ambiente(valor):
    try:
        numero = int(valor)
    except (TypeError, ValueError):
        return None
    return numero if numero in (c.PRODUCAO, c.HOMOLOGACAO) else None


# --- NF-e --------------------------------------------------------------------


def _tributos_item_nfe(imposto):
    tributos = {}
    if imposto is None:
        return tributos
    for grupo in imposto:
        nome = nome_local(grupo)
        if nome in ('vTotTrib',):
            tributos['vTotTrib'] = grupo.text
            continue
        valores = {}
        for sub in grupo.iter():
            if sub is grupo or len(sub):
                continue
            valores[nome_local(sub)] = (sub.text or '').strip()
        if valores:
            tributos[nome] = valores
    return tributos


def _parse_nfe_completa(raiz, nfe, prot):
    inf = filho(nfe, 'infNFe')
    if inf is None:
        raise LeiauteNaoReconhecidoError('NF-e sem grupo infNFe.')
    ide = filho(inf, 'ide')
    emit = filho(inf, 'emit')
    dest = filho(inf, 'dest')
    total = filho(inf, 'total', 'ICMSTot')
    chave = _chave_de_id(inf.get('Id'))
    inf_prot = filho(prot, 'infProt') if prot is not None else None
    emissao = data_hora(texto(ide, 'dhEmi') or texto(ide, 'dEmi'))

    participantes = [p for p in (participante(emit, 'emitente'), participante(dest, 'destinatario')) if p]
    transp = filho(inf, 'transp')
    transporta = filho(transp, 'transporta')
    if transporta is not None:
        participantes.append(participante(transporta, 'transportador'))
    for aut in filhos(inf, 'autXML'):
        participantes.append({'papel': 'autorizado_xml', 'documento': documento_participante(aut)})

    totais = {}
    if total is not None:
        totais = {nome_local(e): (e.text or '').strip() for e in total if not len(e)}
    ibscbs = filho(inf, 'total', 'IBSCBSTot')
    if ibscbs is not None:
        totais['IBSCBSTot'] = {nome_local(e): (e.text or '').strip() for e in ibscbs.iter() if not len(e)}
    is_tot = filho(inf, 'total', 'ISTot')
    if is_tot is not None:
        totais['ISTot'] = {nome_local(e): (e.text or '').strip() for e in is_tot.iter() if not len(e)}

    itens = []
    for det in filhos(inf, 'det'):
        prod = filho(det, 'prod')
        itens.append({
            'numero_item': int(det.get('nItem') or len(itens) + 1),
            'codigo': texto(prod, 'cProd'),
            'descricao': texto(prod, 'xProd')[:500],
            'ncm': texto(prod, 'NCM'),
            'cest': texto(prod, 'CEST'),
            'cfop': texto(prod, 'CFOP'),
            'gtin': texto(prod, 'cEAN'),
            'unidade': texto(prod, 'uCom'),
            'quantidade': decimal(texto(prod, 'qCom')),
            'valor_unitario': decimal(texto(prod, 'vUnCom')),
            'valor_total': decimal(texto(prod, 'vProd')),
            'tributos': {
                **_tributos_item_nfe(filho(det, 'imposto')),
                'vFrete': texto(prod, 'vFrete'), 'vSeg': texto(prod, 'vSeg'),
                'vDesc': texto(prod, 'vDesc'), 'vOutro': texto(prod, 'vOutro'),
            },
        })

    cstat_prot = texto(inf_prot, 'cStat')
    situacao = 'autorizado'
    if cstat_prot in ('110', '301', '302', '303'):
        situacao = 'denegado'
    elif not cstat_prot:
        situacao = 'desconhecida'

    ender_emit = filho(emit, 'enderEmit')
    return DocumentoInterpretado(
        categoria='documento',
        tipo_documento=c.TIPO_NFE,
        tipo_conteudo='completo' if prot is not None else 'completo_sem_protocolo',
        chave=chave,
        versao=inf.get('versao', ''),
        ambiente=_ambiente(texto(ide, 'tpAmb')),
        campos={
            'modelo': texto(ide, 'mod'),
            'numero': texto(ide, 'nNF'),
            'serie': texto(ide, 'serie'),
            'data_emissao': emissao,
            'competencia': _competencia(emissao),
            'data_autorizacao': data_hora(texto(inf_prot, 'dhRecbto')),
            'protocolo': texto(inf_prot, 'nProt'),
            'emitente_documento': documento_participante(emit),
            'emitente_nome': texto(emit, 'xNome'),
            'emitente_ie': texto(emit, 'IE'),
            'destinatario_documento': documento_participante(dest),
            'destinatario_nome': texto(dest, 'xNome'),
            'participantes': {'lista': participantes},
            'municipio_codigo': texto(ender_emit, 'cMun'),
            'municipio_nome': texto(ender_emit, 'xMun'),
            'uf': texto(ender_emit, 'UF'),
            'tipo_operacao': texto(ide, 'tpNF'),
            'valor_total': decimal(texto(total, 'vNF')),
            'valores_tributarios': totais,
            'situacao_fiscal': situacao,
            'dados': {
                'natureza_operacao': texto(ide, 'natOp'),
                'finalidade': texto(ide, 'finNFe'),
                'informacoes_complementares': texto(inf, 'infAdic', 'infCpl')[:2000],
                'informacoes_fisco': texto(inf, 'infAdic', 'infAdFisco')[:2000],
                'modalidade_frete': texto(transp, 'modFrete'),
                'cstat_protocolo': cstat_prot,
                'referencias': [texto(ref, 'refNFe') for ref in filhos(ide, 'NFref') if texto(ref, 'refNFe')],
            },
        },
        itens=itens,
    )


def _parse_res_nfe(raiz):
    emissao = data_hora(texto(raiz, 'dhEmi'))
    sit = texto(raiz, 'cSitNFe')
    situacao = {'1': 'autorizado', '2': 'denegado', '3': 'cancelado'}.get(sit, 'desconhecida')
    return DocumentoInterpretado(
        categoria='documento',
        tipo_documento=c.TIPO_NFE,
        tipo_conteudo='resumo',
        chave=texto(raiz, 'chNFe'),
        versao=raiz.get('versao', ''),
        campos={
            'modelo': '55',
            'numero': str(int(texto(raiz, 'chNFe')[25:34])) if len(texto(raiz, 'chNFe')) == 44 else '',
            'serie': str(int(texto(raiz, 'chNFe')[22:25])) if len(texto(raiz, 'chNFe')) == 44 else '',
            'data_emissao': emissao,
            'competencia': _competencia(emissao),
            'data_autorizacao': data_hora(texto(raiz, 'dhRecbto')),
            'protocolo': texto(raiz, 'nProt'),
            'emitente_documento': texto(raiz, 'CNPJ') or texto(raiz, 'CPF'),
            'emitente_nome': texto(raiz, 'xNome'),
            'emitente_ie': texto(raiz, 'IE'),
            'tipo_operacao': texto(raiz, 'tpNF'),
            'valor_total': decimal(texto(raiz, 'vNF')),
            'situacao_fiscal': situacao,
            'dados': {'digest_value': texto(raiz, 'digVal'), 'cSitNFe': sit},
        },
    )


def _parse_evento_proc(raiz, tipo_documento):
    """procEventoNFe / procEventoCTe / procEventoMDFe."""
    evento = primeiro(filho(raiz, 'evento'), filho(raiz, 'eventoCTe'), filho(raiz, 'eventoMDFe'))
    ret = primeiro(filho(raiz, 'retEvento'), filho(raiz, 'retEventoCTe'), filho(raiz, 'retEventoMDFe'))
    inf = filho(evento, 'infEvento')
    inf_ret = filho(ret, 'infEvento')
    chave = texto(inf, 'chNFe') or texto(inf, 'chCTe') or texto(inf, 'chMDFe')
    det = filho(inf, 'detEvento')
    detalhes = {}
    if det is not None:
        for item in det.iter():
            if item is det or len(item):
                continue
            detalhes[nome_local(item)] = (item.text or '').strip()
        # Primeiro filho do detEvento contém o grupo específico (ex.: evCancCTe)
    tipo_evento = texto(inf, 'tpEvento')
    return DocumentoInterpretado(
        categoria='evento',
        tipo_documento=tipo_documento,
        tipo_conteudo='evento',
        chave=chave,
        versao=raiz.get('versao', ''),
        ambiente=_ambiente(texto(inf, 'tpAmb')),
        evento={
            'tipo_evento': tipo_evento,
            'descricao': detalhes.get('descEvento') or texto(inf_ret, 'xEvento') or c.EVENTOS_NFE.get(tipo_evento, ''),
            'sequencia': int(texto(inf, 'nSeqEvento') or 1),
            'identificador': inf.get('Id', '') if inf is not None else '',
            'data_evento': data_hora(texto(inf, 'dhEvento')),
            'data_registro': data_hora(texto(inf_ret, 'dhRegEvento')),
            'protocolo': texto(inf_ret, 'nProt') or detalhes.get('nProt', ''),
            'autor_documento': texto(inf, 'CNPJ') or texto(inf, 'CPF'),
            'cstat': texto(inf_ret, 'cStat'),
            'dados': detalhes,
            'completo': True,
        },
    )


def _parse_res_evento(raiz):
    tipo_evento = texto(raiz, 'tpEvento')
    return DocumentoInterpretado(
        categoria='evento',
        tipo_documento=c.TIPO_NFE,
        tipo_conteudo='resumo_evento',
        chave=texto(raiz, 'chNFe'),
        versao=raiz.get('versao', ''),
        evento={
            'tipo_evento': tipo_evento,
            'descricao': texto(raiz, 'xEvento') or c.EVENTOS_NFE.get(tipo_evento, ''),
            'sequencia': int(texto(raiz, 'nSeqEvento') or 1),
            'data_evento': data_hora(texto(raiz, 'dhEvento')),
            'data_registro': data_hora(texto(raiz, 'dhRecbto')),
            'protocolo': texto(raiz, 'nProt'),
            'autor_documento': texto(raiz, 'CNPJ') or texto(raiz, 'CPF'),
            'dados': {'cOrgao': texto(raiz, 'cOrgao')},
            'completo': False,
        },
    )


def _situacao_protocolo(cstat):
    if cstat in ('100', '150'):
        return 'autorizado'
    if cstat in ('110', '301', '302', '303'):
        return 'denegado'
    return 'desconhecida'


# --- CT-e --------------------------------------------------------------------


def _parse_cte(raiz, cte, prot):
    inf = filho(cte, 'infCte')
    if inf is None:
        raise LeiauteNaoReconhecidoError('CT-e sem grupo infCte.')
    ide = filho(inf, 'ide')
    emit = filho(inf, 'emit')
    rem, dest = filho(inf, 'rem'), filho(inf, 'dest')
    exped, receb = filho(inf, 'exped'), filho(inf, 'receb')
    vprest = filho(inf, 'vPrest')
    inf_prot = filho(prot, 'infProt') if prot is not None else None
    emissao = data_hora(texto(ide, 'dhEmi'))

    papeis = {'0': ('remetente', rem), '1': ('expedidor', exped), '2': ('recebedor', receb), '3': ('destinatario', dest)}
    tomador_doc = ''
    toma3 = primeiro(filho(ide, 'toma3'), filho(ide, 'toma'))
    toma4 = filho(ide, 'toma4')
    if toma4 is not None:
        tomador_doc = documento_participante(toma4)
        tomador = participante(toma4, 'tomador')
    elif toma3 is not None:
        papel, elemento = papeis.get(texto(toma3, 'toma'), ('', None))
        tomador_doc = documento_participante(elemento)
        tomador = participante(elemento, 'tomador') if elemento is not None else None
    else:
        tomador = None

    participantes = [
        p for p in (
            participante(emit, 'emitente'), participante(rem, 'remetente'), participante(exped, 'expedidor'),
            participante(receb, 'recebedor'), participante(dest, 'destinatario'), tomador,
        ) if p
    ]
    inf_doc = descendente(inf, 'infDoc')
    docs_relacionados = [texto(i, 'chave') for i in (inf_doc if inf_doc is not None else []) if texto(i, 'chave')]
    imp = filho(inf, 'imp')
    tributos = {}
    if imp is not None:
        tributos = {nome_local(e): (e.text or '').strip() for e in imp.iter() if not len(e)}
    modal_map = {'01': 'Rodoviário', '02': 'Aéreo', '03': 'Aquaviário', '04': 'Ferroviário', '05': 'Dutoviário', '06': 'Multimodal'}
    cstat_prot = texto(inf_prot, 'cStat')
    return DocumentoInterpretado(
        categoria='documento',
        tipo_documento=c.TIPO_CTE,
        tipo_conteudo='completo',
        chave=_chave_de_id(inf.get('Id')),
        versao=inf.get('versao', ''),
        ambiente=_ambiente(texto(ide, 'tpAmb')),
        campos={
            'modelo': texto(ide, 'mod'),
            'numero': texto(ide, 'nCT'),
            'serie': texto(ide, 'serie'),
            'data_emissao': emissao,
            'competencia': _competencia(emissao),
            'data_autorizacao': data_hora(texto(inf_prot, 'dhRecbto')),
            'protocolo': texto(inf_prot, 'nProt'),
            'emitente_documento': documento_participante(emit),
            'emitente_nome': texto(emit, 'xNome'),
            'emitente_ie': texto(emit, 'IE'),
            'destinatario_documento': documento_participante(dest),
            'destinatario_nome': texto(dest, 'xNome'),
            'participantes': {'lista': participantes, 'tomador_documento': tomador_doc},
            'municipio_codigo': texto(ide, 'cMunIni'),
            'municipio_nome': texto(ide, 'xMunIni'),
            'uf': texto(ide, 'UFIni'),
            'valor_total': decimal(texto(vprest, 'vTPrest')),
            'valores_tributarios': tributos,
            'situacao_fiscal': _situacao_protocolo(cstat_prot),
            'dados': {
                'cfop': texto(ide, 'CFOP'),
                'natureza_operacao': texto(ide, 'natOp'),
                'modal': modal_map.get(texto(ide, 'modal'), texto(ide, 'modal')),
                'municipio_origem': f"{texto(ide, 'xMunIni')}/{texto(ide, 'UFIni')}",
                'municipio_destino': f"{texto(ide, 'xMunFim')}/{texto(ide, 'UFFim')}",
                'codigo_municipio_destino': texto(ide, 'cMunFim'),
                'valor_receber': texto(vprest, 'vRec'),
                'documentos_relacionados': docs_relacionados,
                'tipo_cte': texto(ide, 'tpCTe'),
            },
        },
    )


# --- MDF-e -------------------------------------------------------------------


def _parse_mdfe(raiz, mdfe, prot):
    inf = filho(mdfe, 'infMDFe')
    if inf is None:
        raise LeiauteNaoReconhecidoError('MDF-e sem grupo infMDFe.')
    ide = filho(inf, 'ide')
    emit = filho(inf, 'emit')
    tot = filho(inf, 'tot')
    inf_prot = filho(prot, 'infProt') if prot is not None else None
    emissao = data_hora(texto(ide, 'dhEmi'))
    return DocumentoInterpretado(
        categoria='documento',
        tipo_documento=c.TIPO_MDFE,
        tipo_conteudo='completo',
        chave=_chave_de_id(inf.get('Id')),
        versao=inf.get('versao', ''),
        ambiente=_ambiente(texto(ide, 'tpAmb')),
        campos={
            'modelo': texto(ide, 'mod'),
            'numero': texto(ide, 'nMDF'),
            'serie': texto(ide, 'serie'),
            'data_emissao': emissao,
            'competencia': _competencia(emissao),
            'data_autorizacao': data_hora(texto(inf_prot, 'dhRecbto')),
            'protocolo': texto(inf_prot, 'nProt'),
            'emitente_documento': documento_participante(emit),
            'emitente_nome': texto(emit, 'xNome'),
            'emitente_ie': texto(emit, 'IE'),
            'participantes': {'lista': [participante(emit, 'emitente')]},
            'uf': texto(ide, 'UFIni'),
            'valor_total': decimal(texto(tot, 'vCarga')),
            'situacao_fiscal': 'autorizado' if texto(inf_prot, 'cStat') == '100' else 'desconhecida',
            'dados': {
                'uf_inicio': texto(ide, 'UFIni'), 'uf_fim': texto(ide, 'UFFim'),
                'quantidade_cte': texto(tot, 'qCTe'), 'quantidade_nfe': texto(tot, 'qNFe'),
                'peso_carga': texto(tot, 'qCarga'), 'modal': texto(ide, 'modal'),
            },
        },
    )


# --- NFS-e Nacional ----------------------------------------------------------


def _valores_nfse(inf_dps, valores_nfse):
    valores_dps = filho(inf_dps, 'valores')
    trib = filho(valores_dps, 'trib')
    trib_mun = filho(trib, 'tribMun')
    trib_fed = filho(trib, 'tribFed')
    resultado = {
        'valor_servico': texto(valores_dps, 'vServPrest', 'vServ'),
        'desconto_incondicionado': texto(valores_dps, 'vDescCondIncond', 'vDescIncond'),
        'desconto_condicionado': texto(valores_dps, 'vDescCondIncond', 'vDescCond'),
        'deducoes': texto(valores_dps, 'vDedRed', 'vDR'),
        'base_calculo': texto(valores_nfse, 'vBC'),
        'aliquota': texto(valores_nfse, 'pAliqAplic') or texto(trib_mun, 'pAliq'),
        'iss': texto(valores_nfse, 'vISSQN'),
        'tipo_retencao_iss': texto(trib_mun, 'tpRetISSQN'),
        'total_retencoes': texto(valores_nfse, 'vTotalRet'),
        'valor_liquido': texto(valores_nfse, 'vLiq'),
    }
    if trib_fed is not None:
        resultado['federais'] = {nome_local(e): (e.text or '').strip() for e in trib_fed.iter() if not len(e)}
    ibscbs = descendente(inf_dps, 'IBSCBS')
    if ibscbs is not None:
        resultado['ibs_cbs'] = {nome_local(e): (e.text or '').strip() for e in ibscbs.iter() if not len(e)}
    resultado['iss_retido'] = resultado['tipo_retencao_iss'] in ('2', '3')
    return resultado


def _parse_nfse(raiz):
    inf = filho(raiz, 'infNFSe')
    if inf is None:
        raise LeiauteNaoReconhecidoError('NFS-e sem grupo infNFSe.')
    dps = filho(inf, 'DPS')
    inf_dps = filho(dps, 'infDPS')
    emit = filho(inf, 'emit')
    prest = filho(inf_dps, 'prest')
    toma = filho(inf_dps, 'toma')
    interm = filho(inf_dps, 'interm')
    serv = filho(inf_dps, 'serv')
    valores_nfse = filho(inf, 'valores')
    emissao = data_hora(texto(inf_dps, 'dhEmi'))
    competencia = parse_date(texto(inf_dps, 'dCompet') or '') if texto(inf_dps, 'dCompet') else None
    valores = _valores_nfse(inf_dps, valores_nfse)
    participantes = [p for p in (
        participante(emit, 'emitente'),
        participante(prest, 'prestador'),
        participante(toma, 'tomador'),
        participante(interm, 'intermediario'),
    ) if p]
    prest_doc = documento_participante(prest) or documento_participante(emit)
    cstat = texto(inf, 'cStat')
    return DocumentoInterpretado(
        categoria='documento',
        tipo_documento=c.TIPO_NFSE,
        tipo_conteudo='completo',
        chave=_chave_de_id(inf.get('Id')),
        versao=raiz.get('versao', ''),
        ambiente=_ambiente(texto(inf_dps, 'tpAmb')),
        campos={
            'modelo': 'NFSe',
            'numero': texto(inf, 'nNFSe'),
            'serie': texto(inf_dps, 'serie'),
            'data_emissao': emissao,
            'competencia': competencia.replace(day=1) if competencia else _competencia(emissao),
            'data_autorizacao': data_hora(texto(inf, 'dhProc')),
            'protocolo': texto(inf, 'nDFSe'),
            'emitente_documento': prest_doc,
            'emitente_nome': texto(emit, 'xNome') or texto(prest, 'xNome'),
            'destinatario_documento': documento_participante(toma),
            'destinatario_nome': texto(toma, 'xNome'),
            'participantes': {
                'lista': participantes,
                'intermediario_documento': documento_participante(interm),
            },
            'municipio_codigo': texto(inf, 'cLocIncid') or texto(serv, 'locPrest', 'cLocPrestacao'),
            'municipio_nome': texto(inf, 'xLocIncid') or texto(inf, 'xLocPrestacao'),
            'valor_total': decimal(valores['valor_servico']),
            'valores_tributarios': valores,
            'situacao_fiscal': 'autorizado',
            'dados': {
                'codigo_servico': texto(serv, 'cServ', 'cTribNac'),
                'codigo_servico_municipal': texto(serv, 'cServ', 'cTribMun'),
                'descricao_servico': texto(serv, 'cServ', 'xDescServ')[:2000],
                'codigo_nbs': texto(serv, 'cServ', 'cNBS'),
                'municipio_emissao': texto(inf, 'xLocEmi'),
                'municipio_prestacao': texto(inf, 'xLocPrestacao'),
                'municipio_incidencia': texto(inf, 'xLocIncid'),
                'codigo_municipio_incidencia': texto(inf, 'cLocIncid'),
                'numero_dps': texto(inf_dps, 'nDPS'),
                'cstat': cstat,
                'chave_substituida': texto(inf_dps, 'subst', 'chSubstda'),
            },
        },
    )


def _parse_evento_nfse(raiz):
    inf = filho(raiz, 'infEvento')
    ped = descendente(raiz, 'infPedReg')
    chave = texto(ped, 'chNFSe')
    tipo_evento = ''
    detalhes = {}
    if ped is not None:
        for item in ped:
            nome = nome_local(item)
            if re.fullmatch(r'e\d{6}', nome):
                tipo_evento = nome[1:]
                detalhes = {nome_local(e): (e.text or '').strip() for e in item.iter() if not len(e)}
    return DocumentoInterpretado(
        categoria='evento',
        tipo_documento=c.TIPO_NFSE,
        tipo_conteudo='evento',
        chave=chave,
        versao=raiz.get('versao', ''),
        ambiente=_ambiente(texto(ped, 'tpAmb')),
        evento={
            'tipo_evento': tipo_evento,
            'descricao': detalhes.get('xDesc') or c.EVENTOS_NFSE.get(tipo_evento, ''),
            'sequencia': int(texto(ped, 'nPedRegEvento') or 1),
            'identificador': inf.get('Id', '') if inf is not None else '',
            'data_evento': data_hora(texto(ped, 'dhEvento')),
            'data_registro': data_hora(texto(inf, 'dhProc')),
            'protocolo': texto(inf, 'nDFe') or texto(inf, 'nSeqEvento'),
            'autor_documento': texto(ped, 'CNPJAutor') or texto(ped, 'CPFAutor'),
            'dados': detalhes,
            'completo': True,
            'chave_substituta': detalhes.get('chSubstituta', ''),
        },
    )


# --- Identificação -----------------------------------------------------------


def interpretar(raiz, schema='') -> DocumentoInterpretado:
    nome = nome_local(raiz)
    resultado = None
    if nome == 'nfeProc':
        resultado = _parse_nfe_completa(raiz, filho(raiz, 'NFe'), filho(raiz, 'protNFe'))
    elif nome == 'NFe':
        resultado = _parse_nfe_completa(raiz, raiz, None)
    elif nome == 'resNFe':
        resultado = _parse_res_nfe(raiz)
    elif nome == 'resEvento':
        resultado = _parse_res_evento(raiz)
    elif nome == 'procEventoNFe':
        resultado = _parse_evento_proc(raiz, c.TIPO_NFE)
    elif nome == 'cteProc':
        resultado = _parse_cte(raiz, filho(raiz, 'CTe'), filho(raiz, 'protCTe'))
    elif nome in ('CTe',):
        resultado = _parse_cte(raiz, raiz, None)
    elif nome == 'procEventoCTe':
        resultado = _parse_evento_proc(raiz, c.TIPO_CTE)
    elif nome == 'mdfeProc':
        resultado = _parse_mdfe(raiz, filho(raiz, 'MDFe'), filho(raiz, 'protMDFe'))
    elif nome == 'procEventoMDFe':
        resultado = _parse_evento_proc(raiz, c.TIPO_MDFE)
    elif nome == 'NFSe':
        resultado = _parse_nfse(raiz)
    elif nome == 'evento' and raiz.nsmap.get(None) == c.NS_NFSE:
        resultado = _parse_evento_nfse(raiz)
    elif nome == 'evento' and descendente(raiz, 'infPedReg') is not None:
        resultado = _parse_evento_nfse(raiz)
    if resultado is None:
        raise LeiauteNaoReconhecidoError(f'Leiaute não reconhecido: {nome}.')
    if not resultado.chave:
        raise LeiauteNaoReconhecidoError('Chave de acesso não identificada no documento.')
    resultado.schema = schema or nome
    return resultado


def validar_chave_44(chave: str) -> bool:
    """Valida o dígito verificador (módulo 11) de chaves de 44 posições."""
    if not re.fullmatch(r'\d{44}', chave or ''):
        return False
    pesos = [2, 3, 4, 5, 6, 7, 8, 9]
    soma = sum(int(d) * pesos[i % 8] for i, d in enumerate(reversed(chave[:43])))
    resto = soma % 11
    dv = 0 if resto in (0, 1) else 11 - resto
    return dv == int(chave[43])
