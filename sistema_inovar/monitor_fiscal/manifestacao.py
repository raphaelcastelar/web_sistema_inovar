"""Manifestação do destinatário (eventos 210200, 210210, 210220, 210240).

Leiaute: MOC NF-e, Web Service NFeRecepcaoEvento (Parte Geral e Manifestação
do Destinatário). Enviado ao Ambiente Nacional (cOrgao 91).
"""
import logging
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone
from lxml import etree

from . import constantes as c
from .assinatura import assinar
from .certificados import chave_e_certificado, compatibilidade_contribuinte, analisar_certificado
from .clientes.sefaz import ClienteRecepcaoEvento
from .clientes.transporte import ComunicacaoError, TransporteMTLS
from .models import ConfiguracaoMonitorFiscal, EventoFiscal, Manifestacao
from .parsers import validar_chave_44, data_hora
from .seguranca import descriptografar, parse_xml_seguro, sha256_hex
from .auditoria_log import registrar

logger = logging.getLogger(__name__)


class ManifestacaoNaoPermitidaError(ValueError):
    pass


def _somente_digitos(valor):
    return ''.join(ch for ch in (valor or '') if ch.isdigit())


def validar_manifestacao(documento, tipo_evento, justificativa='', certificado=None):
    """Valida legitimidade, prazo, sequência e justificativa antes de transmitir."""
    if tipo_evento not in c.EVENTOS_MANIFESTACAO:
        raise ManifestacaoNaoPermitidaError('Tipo de evento de manifestação inválido.')
    if documento.tipo_documento != c.TIPO_NFE:
        raise ManifestacaoNaoPermitidaError('Manifestação do destinatário aplica-se somente à NF-e.')
    from .ambiente import ambiente_permitido, mensagem_bloqueio
    if not ambiente_permitido(documento.ambiente):
        raise ManifestacaoNaoPermitidaError(mensagem_bloqueio(documento.ambiente))
    if not validar_chave_44(documento.chave) or documento.chave[20:22] != '55':
        raise ManifestacaoNaoPermitidaError('Chave de acesso inválida ou não corresponde a NF-e modelo 55.')
    if documento.situacao_manifestacao == 'nao_aplicavel':
        raise ManifestacaoNaoPermitidaError('A empresa não figura como destinatária desta NF-e.')
    cnpj_empresa = _somente_digitos(documento.empresa.cnpj)
    if documento.destinatario_documento and _somente_digitos(documento.destinatario_documento) != cnpj_empresa:
        raise ManifestacaoNaoPermitidaError('O destinatário da NF-e difere do CNPJ da empresa monitorada.')

    if tipo_evento == c.EVENTO_NAO_REALIZADA:
        tamanho = len((justificativa or '').strip())
        if tamanho < 15 or tamanho > 255:
            raise ManifestacaoNaoPermitidaError('Operação não Realizada exige justificativa de 15 a 255 caracteres.')
    if tipo_evento in (c.EVENTO_CIENCIA, c.EVENTO_DESCONHECIMENTO) and documento.situacao_fiscal in ('cancelado', 'denegado'):
        raise ManifestacaoNaoPermitidaError('Evento não permitido para NF-e cancelada ou denegada (rejeições 650/651).')
    if tipo_evento == c.EVENTO_CIENCIA and documento.situacao_manifestacao in ('confirmada', 'desconhecida', 'nao_realizada'):
        raise ManifestacaoNaoPermitidaError('Ciência não é permitida após manifestação conclusiva (rejeição 655).')

    referencia = documento.data_autorizacao or documento.data_emissao
    if referencia and timezone.now() - referencia > timedelta(days=c.PRAZO_MANIFESTACAO_DIAS):
        raise ManifestacaoNaoPermitidaError('Prazo de recepção do evento expirado (rejeição 596).')

    registradas = Manifestacao.objects.filter(documento=documento, tipo_evento=tipo_evento)
    if registradas.filter(situacao__in=['registrada', 'transmitindo']).exists():
        raise ManifestacaoNaoPermitidaError('Já existe manifestação deste tipo registrada ou em transmissão.')
    eventos_existentes = EventoFiscal.objects.filter(
        empresa=documento.empresa, ambiente=documento.ambiente, tipo_documento=c.TIPO_NFE,
        chave_documento=documento.chave, tipo_evento=tipo_evento,
    ).count()
    sequencia = eventos_existentes + 1
    if sequencia > 2:
        raise ManifestacaoNaoPermitidaError('Número máximo de sequência do evento atingido (rejeição 594).')

    if certificado is not None:
        pfx = descriptografar(certificado.arquivo_cifrado)
        senha = descriptografar(certificado.senha_cifrada).decode('utf-8')
        info = analisar_certificado(pfx, senha)
        if not info.vigente:
            raise ManifestacaoNaoPermitidaError('Certificado digital vencido.')
        compativel, motivo = compatibilidade_contribuinte(info, cnpj_empresa)
        if not compativel:
            raise ManifestacaoNaoPermitidaError(motivo)
    return sequencia


def montar_evento(*, chave, cnpj, tipo_evento, sequencia, ambiente, justificativa='', id_lote=None, data=None):
    ns = c.NS_NFE
    data = data or timezone.localtime(timezone.now(), ZoneInfo('America/Sao_Paulo'))
    env = etree.Element(f'{{{ns}}}envEvento', nsmap={None: ns}, versao='1.00')
    etree.SubElement(env, f'{{{ns}}}idLote').text = str(id_lote or int(timezone.now().timestamp()))
    evento = etree.SubElement(env, f'{{{ns}}}evento', versao='1.00')
    identificador = f'ID{tipo_evento}{chave}{int(sequencia):02d}'
    inf = etree.SubElement(evento, f'{{{ns}}}infEvento', Id=identificador)
    etree.SubElement(inf, f'{{{ns}}}cOrgao').text = c.C_ORGAO_AMBIENTE_NACIONAL
    etree.SubElement(inf, f'{{{ns}}}tpAmb').text = str(ambiente)
    etree.SubElement(inf, f'{{{ns}}}CNPJ').text = cnpj
    etree.SubElement(inf, f'{{{ns}}}chNFe').text = chave
    etree.SubElement(inf, f'{{{ns}}}dhEvento').text = data.replace(microsecond=0).isoformat()
    etree.SubElement(inf, f'{{{ns}}}tpEvento').text = tipo_evento
    etree.SubElement(inf, f'{{{ns}}}nSeqEvento').text = str(int(sequencia))
    etree.SubElement(inf, f'{{{ns}}}verEvento').text = '1.00'
    det = etree.SubElement(inf, f'{{{ns}}}detEvento', versao='1.00')
    etree.SubElement(det, f'{{{ns}}}descEvento').text = c.EVENTOS_MANIFESTACAO[tipo_evento]
    if tipo_evento == c.EVENTO_NAO_REALIZADA:
        etree.SubElement(det, f'{{{ns}}}xJust').text = justificativa.strip()
    return env, evento, inf


def montar_proc_evento(evento_xml: str, ret_evento_xml: str) -> str:
    return (
        f'<procEventoNFe xmlns="{c.NS_NFE}" versao="1.00">'
        f'{evento_xml}{ret_evento_xml}</procEventoNFe>'
    )


def solicitar(documento, tipo_evento, usuario=None, justificativa='', automatica=False):
    with transaction.atomic():
        validar_manifestacao(documento, tipo_evento, justificativa)
        manifestacao = Manifestacao.objects.create(
            documento=documento, tipo_evento=tipo_evento, justificativa=justificativa or '',
            solicitado_por=usuario, automatica=automatica, situacao='pendente',
        )
    return manifestacao


def transmitir(manifestacao, transporte=None):
    """Transmite uma manifestação pendente e registra o resultado fiscal."""
    documento = manifestacao.documento
    config = ConfiguracaoMonitorFiscal.objects.select_related('certificado').filter(empresa=documento.empresa).first()
    if config is None or config.certificado is None:
        manifestacao.situacao = 'erro'
        manifestacao.motivo = 'Empresa sem certificado digital vinculado.'
        manifestacao.save(update_fields=['situacao', 'motivo'])
        return manifestacao

    with transaction.atomic():
        bloqueada = Manifestacao.objects.select_for_update().get(pk=manifestacao.pk)
        if bloqueada.situacao not in ('pendente', 'erro'):
            return bloqueada
        try:
            sequencia = validar_manifestacao(documento, bloqueada.tipo_evento, bloqueada.justificativa,
                                             certificado=config.certificado)
        except ManifestacaoNaoPermitidaError as exc:
            bloqueada.situacao = 'rejeitada'
            bloqueada.motivo = f'Validação local: {exc}'
            bloqueada.save(update_fields=['situacao', 'motivo'])
            return bloqueada
        bloqueada.situacao = 'transmitindo'
        bloqueada.sequencia = sequencia
        bloqueada.save(update_fields=['situacao', 'sequencia'])
    manifestacao = bloqueada

    cnpj = _somente_digitos(documento.empresa.cnpj)
    env, evento, inf = montar_evento(
        chave=documento.chave, cnpj=cnpj, tipo_evento=manifestacao.tipo_evento,
        sequencia=manifestacao.sequencia, ambiente=documento.ambiente,
        justificativa=manifestacao.justificativa, id_lote=manifestacao.pk,
    )
    pfx = descriptografar(config.certificado.arquivo_cifrado)
    senha = descriptografar(config.certificado.senha_cifrada).decode('utf-8')
    chave_privada, certificado_x509 = chave_e_certificado(pfx, senha)
    assinar(evento, inf, chave_privada, certificado_x509)
    del chave_privada, pfx, senha
    env_bytes = etree.tostring(env, encoding='utf-8')
    manifestacao.xml_enviado = env_bytes.decode('utf-8')

    cliente = ClienteRecepcaoEvento(transporte or TransporteMTLS(config.certificado), documento.ambiente)
    try:
        retorno = cliente.enviar(env_bytes)
    except ComunicacaoError as exc:
        manifestacao.situacao = 'erro'
        manifestacao.motivo = str(exc)
        manifestacao.save(update_fields=['situacao', 'motivo', 'xml_enviado'])
        registrar(None, documento.empresa, 'manifestacao_transmitir', resultado='erro',
                  detalhes={'manifestacao': manifestacao.pk, 'erro': str(exc)})
        return manifestacao

    manifestacao.transmitido_em = timezone.now()
    manifestacao.xml_retorno = retorno.xml_resposta
    # O sucesso HTTP não basta: o evento só é aceito com cStat 135/136 no retEvento.
    if retorno.cstat_lote == c.CSTAT_LOTE_EVENTO_PROCESSADO and retorno.cstat in (
        c.CSTAT_EVENTO_VINCULADO, c.CSTAT_EVENTO_NAO_VINCULADO
    ):
        manifestacao.situacao = 'registrada'
        manifestacao.cstat = retorno.cstat
        manifestacao.motivo = retorno.motivo
        manifestacao.protocolo = retorno.protocolo
        manifestacao.data_registro = data_hora(retorno.data_registro)
        evento_xml = etree.tostring(evento, encoding='unicode')
        manifestacao.xml_processado = montar_proc_evento(evento_xml, retorno.xml_ret_evento)
        manifestacao.save()
        _registrar_evento_local(manifestacao)
    else:
        manifestacao.situacao = 'rejeitada'
        manifestacao.cstat = retorno.cstat or retorno.cstat_lote
        manifestacao.motivo = retorno.motivo or retorno.motivo_lote
        manifestacao.save()
    registrar(manifestacao.solicitado_por, documento.empresa, 'manifestacao_transmitir',
              origem='automacao' if manifestacao.automatica else 'usuario',
              resultado='sucesso' if manifestacao.situacao == 'registrada' else 'rejeitado',
              detalhes={'manifestacao': manifestacao.pk, 'chave': documento.chave,
                        'tipo_evento': manifestacao.tipo_evento, 'cstat': manifestacao.cstat})
    return manifestacao


def _registrar_evento_local(manifestacao):
    from .processador import processar_conteudo

    documento = manifestacao.documento
    conteudo = manifestacao.xml_processado.encode('utf-8')
    with transaction.atomic():
        processar_conteudo(conteudo, fonte=c.FONTE_AN_NFE, ambiente=documento.ambiente, empresa=documento.empresa,
                           usuario=manifestacao.solicitado_por, schema='procEventoNFe')
