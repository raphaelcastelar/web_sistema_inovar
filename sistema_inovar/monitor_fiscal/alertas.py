"""Alertas fiscais com deduplicação e integração às notificações existentes."""
import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import AlertaFiscal, PreferenciaAlerta

logger = logging.getLogger(__name__)

PRIORIDADE_ORDEM = {'baixa': 0, 'normal': 1, 'alta': 2, 'critica': 3}

_DEFINICOES_DOCUMENTO = {
    'nova_nfe': ('baixa', 'Nova NF-e recebida'),
    'nova_nfse': ('baixa', 'Nova NFS-e capturada'),
    'novo_cte': ('baixa', 'Novo CT-e capturado'),
    'novo_mdfe': ('baixa', 'Novo MDF-e capturado'),
    'documento_cancelado': ('alta', 'Documento cancelado'),
    'documento_substituido': ('normal', 'Documento substituído'),
    'xml_disponivel': ('baixa', 'XML completo disponibilizado'),
    'manifestacao_pendente': ('normal', 'Manifestação pendente'),
}


def _notificar(alerta):
    """Reutiliza o modelo Notificacao da INOVAR para alertas relevantes."""
    from empresas.models import Funcionario, Notificacao

    destinatarios = set()
    empresa = alerta.empresa
    if empresa is not None and empresa.responsavel_fiscal_id:
        destinatarios.add(empresa.responsavel_fiscal_id)
    if not destinatarios:
        destinatarios.update(
            Funcionario.objects.filter(is_active=True, cargo='admin').values_list('id', flat=True)
        )
    prioridade = PRIORIDADE_ORDEM.get(alerta.prioridade, 1)
    for usuario_id in destinatarios:
        preferencia = PreferenciaAlerta.objects.filter(usuario_id=usuario_id).first()
        if preferencia:
            if preferencia.frequencia != 'imediata':
                continue
            if preferencia.tipos_ativos and alerta.tipo not in preferencia.tipos_ativos:
                continue
            if prioridade < PRIORIDADE_ORDEM.get(preferencia.prioridade_minima, 1):
                continue
            if empresa is not None and preferencia.empresas.exists() and not preferencia.empresas.filter(pk=empresa.pk).exists():
                continue
        Notificacao.objects.create(destinatario_id=usuario_id, mensagem=f'[Monitor Fiscal] {alerta.titulo}'[:255])


def registrar_alerta(*, tipo, chave, titulo, mensagem='', prioridade='normal', empresa=None, documento=None):
    """Cria o alerta se ainda não existir (deduplicação por chave)."""
    if empresa is not None:
        config = getattr(empresa, 'monitor_fiscal', None)
        if config is not None:
            if tipo.startswith('certificado') and not config.alertas_certificado:
                return None
            if not tipo.startswith('certificado') and not config.alertas_fiscais:
                return None
    try:
        with transaction.atomic():
            alerta = AlertaFiscal.objects.create(
                tipo=tipo, chave_deduplicacao=chave[:200], titulo=titulo[:200], mensagem=mensagem,
                prioridade=prioridade, empresa=empresa, documento=documento,
            )
    except IntegrityError:
        return None
    if PRIORIDADE_ORDEM.get(prioridade, 1) >= PRIORIDADE_ORDEM['normal'] and tipo not in ('nova_nfe', 'nova_nfse', 'novo_cte', 'novo_mdfe', 'xml_disponivel'):
        try:
            _notificar(alerta)
        except Exception:  # noqa: BLE001
            logger.exception('Falha ao gerar notificação do alerta %s', alerta.pk)
    return alerta


def alerta_documento(tipo, empresa, documento):
    if documento is None or tipo not in _DEFINICOES_DOCUMENTO:
        return None
    prioridade, titulo = _DEFINICOES_DOCUMENTO[tipo]
    descricao = f'{documento.get_tipo_documento_display()} nº {documento.numero or "-"} - {documento.emitente_nome or documento.emitente_documento}'
    return registrar_alerta(
        tipo=tipo, chave=f'{tipo}:{documento.pk}', titulo=f'{titulo}: {descricao}'[:200],
        mensagem=f'Chave {documento.chave}', prioridade=prioridade, empresa=empresa, documento=documento,
    )


def alerta_sincronizacao(controle, tipo, mensagem, prioridade='alta'):
    titulos = {
        'falha_sincronizacao': 'Falha de sincronização',
        'consumo_indevido': 'Bloqueio por consumo indevido',
        'indisponibilidade': 'Serviço governamental indisponível',
    }
    dia = timezone.now().strftime('%Y%m%d')
    return registrar_alerta(
        tipo=tipo, chave=f'{tipo}:{controle.pk}:{dia}',
        titulo=f'{titulos.get(tipo, tipo)} - {controle.get_fonte_display()} - {controle.empresa}'[:200],
        mensagem=mensagem, prioridade=prioridade, empresa=controle.empresa,
    )


def verificar_certificados():
    """Gera alertas de vencimento conforme os dias configurados por empresa."""
    from .models import ConfiguracaoMonitorFiscal

    agora = timezone.now()
    gerados = 0
    for config in ConfiguracaoMonitorFiscal.objects.select_related('certificado', 'empresa').filter(certificado__isnull=False):
        cert = config.certificado
        dias = (cert.valido_ate - agora).days
        if cert.valido_ate < agora:
            if registrar_alerta(
                tipo='certificado_vencido', chave=f'certificado_vencido:{cert.pk}:{config.empresa_id}',
                titulo=f'Certificado vencido - {config.empresa}', prioridade='critica', empresa=config.empresa,
                mensagem=f'Certificado {cert.titular} venceu em {cert.valido_ate:%d/%m/%Y}.',
            ):
                gerados += 1
            continue
        limites = sorted(int(d) for d in (config.dias_alerta_certificado or []) if str(d).isdigit())
        for limite in limites:
            if dias <= limite:
                if registrar_alerta(
                    tipo='certificado_vencendo', chave=f'certificado_vencendo:{cert.pk}:{config.empresa_id}:{limite}',
                    titulo=f'Certificado vence em {dias} dia(s) - {config.empresa}',
                    prioridade='alta' if limite <= 7 else 'normal', empresa=config.empresa,
                    mensagem=f'Certificado {cert.titular} válido até {cert.valido_ate:%d/%m/%Y}.',
                ):
                    gerados += 1
                break
    return gerados
