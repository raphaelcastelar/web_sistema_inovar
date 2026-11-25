"""Processamento único de documentos fiscais para todas as fontes.

Captura automática e importação manual passam por aqui, garantindo as mesmas
regras de identificação, deduplicação, classificação e preservação do XML.
"""
import logging
import re
from dataclasses import dataclass, field
from typing import Optional

from django.db import transaction

from . import constantes as c
from . import parsers
from .models import (
    ConfiguracaoMonitorFiscal, DocumentoFiscal, EventoFiscal, ItemDocumentoFiscal, Manifestacao, RecebimentoDFe,
)
from .seguranca import parse_xml_seguro, sha256_hex

logger = logging.getLogger(__name__)


class ProcessamentoError(ValueError):
    pass


@dataclass
class ResultadoProcessamento:
    status: str  # importado | atualizado | duplicado | rejeitado
    mensagem: str = ''
    documento: Optional[DocumentoFiscal] = None
    evento: Optional[EventoFiscal] = None
    recebimento: Optional[RecebimentoDFe] = None
    interpretado: Optional[parsers.DocumentoInterpretado] = None
    alertas: list = field(default_factory=list)


def somente_digitos(valor):
    return re.sub(r'\D', '', valor or '')


def _mesmo_contribuinte(doc_a, doc_b):
    a, b = somente_digitos(doc_a), somente_digitos(doc_b)
    return bool(a) and a == b


def _papeis_empresa(interpretado, cnpj_empresa):
    """Papéis da empresa no documento (por CNPJ completo)."""
    cnpj = somente_digitos(cnpj_empresa)
    campos = interpretado.campos
    papeis = set()
    if _mesmo_contribuinte(campos.get('emitente_documento'), cnpj):
        papeis.add('emitente')
    if _mesmo_contribuinte(campos.get('destinatario_documento'), cnpj):
        papeis.add('destinatario')
    participantes = (campos.get('participantes') or {})
    for item in participantes.get('lista', []):
        if item and _mesmo_contribuinte(item.get('documento'), cnpj):
            papeis.add(item.get('papel'))
    if _mesmo_contribuinte(participantes.get('tomador_documento'), cnpj):
        papeis.add('tomador')
    if _mesmo_contribuinte(participantes.get('intermediario_documento'), cnpj):
        papeis.add('intermediario')
    return papeis


def classificar(interpretado, cnpj_empresa):
    tipo = interpretado.tipo_documento
    papeis = _papeis_empresa(interpretado, cnpj_empresa)
    tp_nf = interpretado.campos.get('tipo_operacao')
    if tipo == c.TIPO_NFE:
        if interpretado.tipo_conteudo == 'resumo' and not papeis:
            # Resumos de NF-e são distribuídos somente ao destinatário.
            papeis.add('destinatario')
        if 'emitente' in papeis:
            return 'entrada' if tp_nf == '0' else 'saida'
        if 'destinatario' in papeis:
            return 'saida' if tp_nf == '0' else 'entrada'
        if papeis & {'transportador', 'autorizado_xml'}:
            return 'terceiro_autorizado'
        return 'outros'
    if tipo == c.TIPO_CTE:
        if 'emitente' in papeis:
            return 'transporte_prestado'
        if 'tomador' in papeis:
            return 'transporte_contratado'
        if papeis:
            return 'terceiro_autorizado'
        return 'outros'
    if tipo == c.TIPO_NFSE:
        if papeis & {'emitente', 'prestador'}:
            return 'servico_prestado'
        if 'tomador' in papeis:
            return 'servico_tomado'
        if 'intermediario' in papeis:
            return 'intermediacao'
        return 'outros'
    if tipo == c.TIPO_MDFE:
        return 'transporte_prestado' if 'emitente' in papeis else 'terceiro_autorizado'
    return 'outros'


def manifestacao_aplicavel(interpretado, cnpj_empresa):
    if interpretado.tipo_documento != c.TIPO_NFE:
        return False
    if interpretado.tipo_conteudo == 'resumo':
        return True
    papeis = _papeis_empresa(interpretado, cnpj_empresa)
    return 'destinatario' in papeis and interpretado.campos.get('modelo', '55') == '55'


# Situações fiscais definidas por eventos não podem ser rebaixadas por resumos/XML.
_SITUACOES_FINAIS = {'cancelado', 'substituido', 'denegado', 'encerrado'}

_CAMPOS_DOCUMENTO = (
    'modelo', 'numero', 'serie', 'data_emissao', 'competencia', 'data_autorizacao', 'protocolo',
    'emitente_documento', 'emitente_nome', 'emitente_ie', 'destinatario_documento', 'destinatario_nome',
    'participantes', 'municipio_codigo', 'municipio_nome', 'uf', 'tipo_operacao', 'valor_total',
    'valores_tributarios', 'dados',
)


def _aplicar_campos(documento, interpretado, sobrescrever=True):
    for nome in _CAMPOS_DOCUMENTO:
        if nome not in interpretado.campos:
            continue
        valor = interpretado.campos[nome]
        if valor in (None, '', {}, []) and not sobrescrever:
            continue
        if valor in (None, '', {}, []) and getattr(documento, nome) not in (None, '', {}, []):
            continue  # não apaga informação existente
        if nome == 'dados' and isinstance(documento.dados, dict):
            valor = {**documento.dados, **valor}
        setattr(documento, nome, valor if valor is not None else getattr(documento, nome))
    situacao = interpretado.campos.get('situacao_fiscal')
    if situacao and documento.situacao_fiscal not in _SITUACOES_FINAIS:
        documento.situacao_fiscal = situacao
    elif situacao in _SITUACOES_FINAIS:
        documento.situacao_fiscal = situacao


def _substituir_itens(documento, itens):
    documento.itens.all().delete()
    ItemDocumentoFiscal.objects.bulk_create([
        ItemDocumentoFiscal(documento=documento, **item) for item in itens
    ])


def _registrar_fonte(documento, fonte):
    fontes = list(documento.fontes or [])
    if fonte not in fontes:
        fontes.append(fonte)
        documento.fontes = fontes
        return True
    return False


def _efeito_evento_no_documento(documento, evento):
    """Aplica ao documento os efeitos de um evento, sem alterar o XML original."""
    tipo_doc, tipo = evento.tipo_documento, evento.tipo_evento
    alterou = []
    if tipo_doc == c.TIPO_NFE:
        if tipo in c.EVENTOS_CANCELAMENTO_NFE:
            documento.situacao_fiscal = 'cancelado'
            alterou.append('cancelado')
        elif tipo in c.EVENTOS_MANIFESTACAO and _mesmo_contribuinte(evento.autor_documento, documento.empresa.cnpj):
            mapa = {
                c.EVENTO_CIENCIA: 'ciencia', c.EVENTO_CONFIRMACAO: 'confirmada',
                c.EVENTO_DESCONHECIMENTO: 'desconhecida', c.EVENTO_NAO_REALIZADA: 'nao_realizada',
            }
            nova = mapa[tipo]
            # Ciência nunca rebaixa uma manifestação conclusiva.
            if not (nova == 'ciencia' and documento.situacao_manifestacao in ('confirmada', 'desconhecida', 'nao_realizada')):
                documento.situacao_manifestacao = nova
    elif tipo_doc == c.TIPO_CTE and tipo in c.EVENTOS_CANCELAMENTO_CTE:
        documento.situacao_fiscal = 'cancelado'
        alterou.append('cancelado')
    elif tipo_doc == c.TIPO_MDFE:
        if tipo in c.EVENTOS_CANCELAMENTO_MDFE:
            documento.situacao_fiscal = 'cancelado'
            alterou.append('cancelado')
        elif tipo == '110112' and documento.situacao_fiscal != 'cancelado':
            documento.situacao_fiscal = 'encerrado'
    elif tipo_doc == c.TIPO_NFSE:
        if tipo in c.EVENTOS_CANCELAMENTO_NFSE:
            documento.situacao_fiscal = 'cancelado'
            alterou.append('cancelado')
        elif tipo in c.EVENTOS_SUBSTITUICAO_NFSE:
            documento.situacao_fiscal = 'substituido'
            substituta = (evento.dados or {}).get('chSubstituta', '')
            if substituta:
                documento.chave_substituta = substituta
                documento.substituido_por = DocumentoFiscal.objects.filter(
                    empresa=documento.empresa, ambiente=documento.ambiente,
                    tipo_documento=c.TIPO_NFSE, chave=substituta,
                ).first()
            alterou.append('substituido')
    return alterou


def _vincular_substituicao_nfse(documento):
    """Quando chega a NFS-e substituta, marca a substituída e cria o vínculo."""
    chave_antiga = (documento.dados or {}).get('chave_substituida')
    if not chave_antiga:
        return
    antiga = DocumentoFiscal.objects.select_for_update().filter(
        empresa=documento.empresa, ambiente=documento.ambiente, tipo_documento=c.TIPO_NFSE, chave=chave_antiga,
    ).first()
    if antiga:
        antiga.situacao_fiscal = 'substituido'
        antiga.substituido_por = documento
        antiga.chave_substituta = documento.chave
        antiga.save(update_fields=['situacao_fiscal', 'substituido_por', 'chave_substituta', 'atualizado_em'])
    # Notas substitutas que chegaram antes: vincula reverso.
    DocumentoFiscal.objects.filter(
        empresa=documento.empresa, ambiente=documento.ambiente, tipo_documento=c.TIPO_NFSE,
        chave_substituta=documento.chave, substituido_por__isnull=True,
    ).exclude(pk=documento.pk).update(substituido_por=documento)


def _processar_documento(interpretado, *, empresa, ambiente, fonte, conteudo_texto, hash_conteudo):
    cnpj_empresa = empresa.cnpj
    documento = DocumentoFiscal.objects.select_for_update().filter(
        empresa=empresa, tipo_documento=interpretado.tipo_documento, chave=interpretado.chave, ambiente=ambiente,
    ).first()
    eh_resumo = interpretado.tipo_conteudo == 'resumo'
    alertas = []

    if documento is None:
        documento = DocumentoFiscal(
            empresa=empresa,
            cnpj_estabelecimento=somente_digitos(cnpj_empresa),
            tipo_documento=interpretado.tipo_documento,
            chave=interpretado.chave,
            ambiente=ambiente,
            schema=interpretado.schema,
            versao_leiaute=interpretado.versao,
        )
        _aplicar_campos(documento, interpretado)
        if eh_resumo:
            documento.xml_resumo = conteudo_texto
            documento.situacao_xml = 'resumo'
        else:
            documento.xml_completo = conteudo_texto
            documento.situacao_xml = 'completo'
        documento.hash_xml = hash_conteudo
        documento.classificacao = classificar(interpretado, cnpj_empresa)
        documento.situacao_manifestacao = (
            'nao_manifestada' if manifestacao_aplicavel(interpretado, cnpj_empresa) else 'nao_aplicavel'
        )
        _registrar_fonte(documento, fonte)
        documento.save()
        if interpretado.itens:
            _substituir_itens(documento, interpretado.itens)
        status = 'importado'
        alertas.append({'nfe': 'nova_nfe', 'cte': 'novo_cte', 'nfse': 'nova_nfse', 'mdfe': 'novo_mdfe'}[
            interpretado.tipo_documento.lower()])
    else:
        nova_fonte = _registrar_fonte(documento, fonte)
        if eh_resumo:
            if documento.xml_completo or documento.xml_resumo and documento.hash_xml == hash_conteudo:
                # Nunca substituir XML completo por resumo; resumo repetido é duplicidade.
                if documento.xml_completo and interpretado.campos.get('situacao_fiscal') in _SITUACOES_FINAIS:
                    documento.situacao_fiscal = interpretado.campos['situacao_fiscal']
                    documento.save()
                    return documento, 'atualizado', ['documento_cancelado']
                if nova_fonte:
                    documento.save(update_fields=['fontes', 'atualizado_em'])
                return documento, 'duplicado', []
            documento.xml_resumo = conteudo_texto
            documento.hash_xml = hash_conteudo
            _aplicar_campos(documento, interpretado)
            status = 'atualizado'
        else:
            if documento.xml_completo and sha256_hex(documento.xml_completo) == hash_conteudo:
                if nova_fonte:
                    documento.save(update_fields=['fontes', 'atualizado_em'])
                return documento, 'duplicado', []
            tinha_completo = bool(documento.xml_completo)
            documento.xml_completo = conteudo_texto
            documento.hash_xml = hash_conteudo
            documento.situacao_xml = 'completo'
            documento.schema = interpretado.schema
            documento.versao_leiaute = interpretado.versao
            _aplicar_campos(documento, interpretado)
            documento.classificacao = classificar(interpretado, cnpj_empresa)
            if interpretado.itens:
                _substituir_itens(documento, interpretado.itens)
            if not tinha_completo:
                alertas.append('xml_disponivel')
            status = 'atualizado'
        documento.save()

    # Eventos recebidos antes do documento: vincula e reaplica efeitos.
    orfaos = EventoFiscal.objects.filter(
        empresa=empresa, ambiente=ambiente, tipo_documento=interpretado.tipo_documento,
        chave_documento=interpretado.chave, documento__isnull=True,
    )
    alterado = False
    for evento in orfaos:
        evento.documento = documento
        evento.save(update_fields=['documento', 'atualizado_em'])
        _efeito_evento_no_documento(documento, evento)
        alterado = True
    if alterado:
        documento.save()
    if interpretado.tipo_documento == c.TIPO_NFSE:
        _vincular_substituicao_nfse(documento)
    return documento, status, alertas


def _processar_evento(interpretado, *, empresa, ambiente, fonte, conteudo_texto, hash_conteudo):
    dados = interpretado.evento
    chaves = dict(
        empresa=empresa, ambiente=ambiente, tipo_documento=interpretado.tipo_documento,
        chave_documento=interpretado.chave, tipo_evento=dados['tipo_evento'], sequencia=dados['sequencia'],
    )
    evento = EventoFiscal.objects.select_for_update().filter(**chaves).first()
    status = 'importado'
    if evento is None:
        evento = EventoFiscal(**chaves, fonte=fonte)
    else:
        if evento.hash_xml == hash_conteudo or (evento.completo and not dados.get('completo')):
            return evento, 'duplicado', []
        status = 'atualizado'
    for nome in ('descricao', 'identificador', 'data_evento', 'data_registro', 'protocolo', 'autor_documento', 'cstat'):
        valor = dados.get(nome)
        if valor not in (None, ''):
            setattr(evento, nome, valor)
    evento.dados = {**(evento.dados or {}), **(dados.get('dados') or {})}
    if dados.get('chave_substituta'):
        evento.dados['chSubstituta'] = dados['chave_substituta']
    evento.completo = bool(dados.get('completo'))
    evento.xml = conteudo_texto
    evento.hash_xml = hash_conteudo
    evento.documento = DocumentoFiscal.objects.select_for_update().filter(
        empresa=empresa, ambiente=ambiente, tipo_documento=interpretado.tipo_documento,
        chave=interpretado.chave,
    ).first()
    evento.save()

    alertas = []
    if evento.documento is not None:
        efeitos = _efeito_evento_no_documento(evento.documento, evento)
        evento.documento.save()
        alertas.extend('documento_cancelado' if e == 'cancelado' else 'documento_substituido' for e in efeitos)
    return evento, status, alertas


def registrar_recebimento(conteudo: bytes, *, fonte, ambiente, empresa=None, nsu=None, schema='',
                          usuario=None, importacao=None):
    hash_conteudo = sha256_hex(conteudo)
    texto = conteudo.decode('utf-8', errors='replace')
    if nsu is not None and empresa is not None:
        recebimento, criado = RecebimentoDFe.objects.get_or_create(
            empresa=empresa, fonte=fonte, ambiente=ambiente, nsu=nsu,
            defaults=dict(schema=schema, conteudo=texto, hash_conteudo=hash_conteudo, usuario=usuario),
        )
        return recebimento, criado
    recebimento = RecebimentoDFe.objects.create(
        empresa=empresa, fonte=fonte, ambiente=ambiente, nsu=nsu, schema=schema, conteudo=texto,
        hash_conteudo=hash_conteudo, usuario=usuario, importacao=importacao,
    )
    return recebimento, True


def processar_conteudo(conteudo: bytes, *, fonte, ambiente, empresa, nsu=None, schema='', usuario=None,
                       importacao=None, raiz=None, interpretado=None) -> ResultadoProcessamento:
    """Processa um XML já associado a uma empresa. Deve rodar dentro de transação."""
    recebimento, criado = registrar_recebimento(
        conteudo, fonte=fonte, ambiente=ambiente, empresa=empresa, nsu=nsu, schema=schema,
        usuario=usuario, importacao=importacao,
    )
    if not criado and recebimento.processado:
        return ResultadoProcessamento('duplicado', 'NSU já processado anteriormente.', recebimento=recebimento,
                                      documento=recebimento.documento, evento=recebimento.evento)

    try:
        with transaction.atomic():
            if interpretado is None:
                raiz = raiz if raiz is not None else parse_xml_seguro(conteudo)
                interpretado = parsers.interpretar(raiz, schema=schema)
            ambiente_doc = interpretado.ambiente
            if ambiente_doc and ambiente_doc != ambiente:
                raise ProcessamentoError(
                    'Documento de ambiente diferente do esperado (produção e homologação não se misturam).'
                )
            hash_conteudo = recebimento.hash_conteudo
            texto = recebimento.conteudo
            kwargs = dict(empresa=empresa, ambiente=ambiente, fonte=fonte,
                          conteudo_texto=texto, hash_conteudo=hash_conteudo)
            if interpretado.categoria == 'documento':
                documento, status, alertas = _processar_documento(interpretado, **kwargs)
                recebimento.documento = documento
                recebimento.tipo_conteudo = 'resumo' if interpretado.tipo_conteudo == 'resumo' else 'completo'
                resultado = ResultadoProcessamento(status, documento=documento, alertas=alertas)
            else:
                evento, status, alertas = _processar_evento(interpretado, **kwargs)
                recebimento.evento = evento
                recebimento.documento = evento.documento
                recebimento.tipo_conteudo = 'evento' if interpretado.tipo_conteudo == 'evento' else 'resumo_evento'
                resultado = ResultadoProcessamento(status, evento=evento, documento=evento.documento, alertas=alertas)
            recebimento.processado = True
            recebimento.erro = ''
            recebimento.schema = recebimento.schema or interpretado.schema
            recebimento.save()
    except (ProcessamentoError, parsers.LeiauteNaoReconhecidoError, ValueError) as exc:
        recebimento.processado = False
        recebimento.erro = str(exc)[:2000]
        recebimento.save(update_fields=['processado', 'erro'])
        return ResultadoProcessamento('rejeitado', str(exc), recebimento=recebimento)

    resultado.recebimento = recebimento
    resultado.interpretado = interpretado
    _pos_processamento(resultado, empresa)
    return resultado


def _pos_processamento(resultado, empresa):
    from . import alertas as modulo_alertas

    documento = resultado.documento
    for tipo in resultado.alertas:
        modulo_alertas.alerta_documento(tipo, empresa, documento or (resultado.evento and resultado.evento.documento))
    if documento is None or resultado.status == 'duplicado':
        return
    if (
        documento.tipo_documento == c.TIPO_NFE
        and documento.situacao_xml == 'resumo'
        and documento.situacao_manifestacao == 'nao_manifestada'
        and documento.situacao_fiscal == 'autorizado'
    ):
        config = ConfiguracaoMonitorFiscal.objects.filter(empresa=empresa).first()
        if config and config.ciencia_automatica and config.ciencia_autorizada_em:
            existe = Manifestacao.objects.filter(
                documento=documento, tipo_evento=c.EVENTO_CIENCIA,
                situacao__in=['pendente', 'transmitindo', 'registrada'],
            ).exists()
            if not existe:
                Manifestacao.objects.create(
                    documento=documento, tipo_evento=c.EVENTO_CIENCIA, automatica=True, situacao='pendente',
                )
