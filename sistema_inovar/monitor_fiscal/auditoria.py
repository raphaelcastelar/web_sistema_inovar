"""Auditoria fiscal inicial: verificações objetivas sobre os documentos capturados.

As ocorrências indicam pontos para análise do contador. Nenhuma regra afirma
fraude ou irregularidade.
"""
import re
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from . import constantes as c
from .models import ControleSincronizacao, DocumentoFiscal, EventoFiscal, OcorrenciaAuditoria

RE_NCM = re.compile(r'^\d{8}$')
# Estrutura do CFOP (Convênio s/nº de 1970, Ajuste SINIEF 07/01): 1º dígito 1,2,3 (entradas) ou 5,6,7 (saídas).
RE_CFOP = re.compile(r'^[123567]\d{3}$')


def _ocorrencia(empresa, regra, severidade, descricao, chave, documento=None):
    obj, criado = OcorrenciaAuditoria.objects.get_or_create(
        chave_deduplicacao=f'{regra}:{chave}'[:200],
        defaults=dict(empresa=empresa, documento=documento, regra=regra, severidade=severidade, descricao=descricao),
    )
    return criado


def auditar_empresa(empresa, ambiente=c.PRODUCAO):
    agora = timezone.now()
    criadas = 0
    docs = DocumentoFiscal.objects.filter(empresa=empresa, ambiente=ambiente)

    for doc in docs.filter(tipo_documento=c.TIPO_NFE, situacao_xml='resumo', capturado_em__lt=agora - timedelta(days=7)):
        criadas += _ocorrencia(empresa, 'xml_indisponivel', 'atencao',
                               f'NF-e {doc.numero} de {doc.emitente_nome}: XML completo indisponível há mais de 7 dias '
                               '(normalmente liberado após a manifestação do destinatário).', doc.pk, doc)

    for doc in docs.filter(situacao_manifestacao__in=['nao_manifestada', 'ciencia']).exclude(situacao_fiscal='cancelado'):
        referencia = doc.data_autorizacao or doc.data_emissao
        if not referencia:
            continue
        dias = (agora - referencia).days
        if dias >= 150:
            criadas += _ocorrencia(empresa, 'manifestacao_prazo', 'critica',
                                   f'NF-e {doc.numero}: manifestação conclusiva pendente há {dias} dias '
                                   f'(prazo de recepção do evento: {c.PRAZO_MANIFESTACAO_DIAS} dias).', doc.pk, doc)
        elif dias >= 30:
            criadas += _ocorrencia(empresa, 'manifestacao_pendente', 'atencao',
                                   f'NF-e {doc.numero}: manifestação conclusiva pendente há {dias} dias.', doc.pk, doc)

    for doc in docs.filter(situacao_fiscal='cancelado'):
        criadas += _ocorrencia(empresa, 'documento_cancelado', 'informativa',
                               f'{doc.get_tipo_documento_display()} {doc.numero} cancelado: desconsiderado nos totais.',
                               doc.pk, doc)

    for evento in EventoFiscal.objects.filter(empresa=empresa, ambiente=ambiente, documento__isnull=True,
                                              capturado_em__lt=agora - timedelta(days=1)):
        criadas += _ocorrencia(empresa, 'evento_sem_documento', 'informativa',
                               f'Evento {evento.tipo_evento} recebido para a chave {evento.chave_documento} '
                               'sem documento correspondente na plataforma.', f'ev{evento.pk}')

    for doc in docs.filter(tipo_documento=c.TIPO_NFE, situacao_xml='completo').prefetch_related('itens'):
        itens = list(doc.itens.all())
        for item in itens:
            if not item.ncm:
                criadas += _ocorrencia(empresa, 'ncm_ausente', 'atencao',
                                       f'NF-e {doc.numero}, item {item.numero_item}: NCM ausente.',
                                       f'{doc.pk}:{item.numero_item}', doc)
            elif not RE_NCM.match(item.ncm) and item.ncm != '00':
                criadas += _ocorrencia(empresa, 'ncm_invalido', 'atencao',
                                       f'NF-e {doc.numero}, item {item.numero_item}: NCM "{item.ncm}" com formato inválido.',
                                       f'{doc.pk}:{item.numero_item}', doc)
            if item.cfop and not RE_CFOP.match(item.cfop):
                criadas += _ocorrencia(empresa, 'cfop_invalido', 'atencao',
                                       f'NF-e {doc.numero}, item {item.numero_item}: CFOP "{item.cfop}" fora da estrutura vigente.',
                                       f'{doc.pk}:{item.numero_item}', doc)
        total_produtos = (doc.valores_tributarios or {}).get('vProd')
        if itens and total_produtos:
            soma = sum((i.valor_total or Decimal('0')) for i in itens)
            if abs(soma - Decimal(total_produtos)) > Decimal('0.05'):
                criadas += _ocorrencia(empresa, 'divergencia_valores', 'atencao',
                                       f'NF-e {doc.numero}: soma dos itens ({soma}) difere do total de produtos '
                                       f'({total_produtos}).', doc.pk, doc)

    for doc in docs.filter(classificacao='outros').exclude(tipo_documento=c.TIPO_MDFE):
        criadas += _ocorrencia(empresa, 'participante_divergente', 'atencao',
                               f'{doc.get_tipo_documento_display()} {doc.numero}: a empresa não foi identificada '
                               'entre os participantes do documento.', doc.pk, doc)

    for doc in docs.filter(situacao_conferencia='pendente', capturado_em__lt=agora - timedelta(days=30)):
        criadas += _ocorrencia(empresa, 'conferencia_pendente', 'informativa',
                               f'{doc.get_tipo_documento_display()} {doc.numero}: pendente de conferência há mais de 30 dias.',
                               doc.pk, doc)

    duplicados = (docs.exclude(numero='').values('tipo_documento', 'emitente_documento', 'serie', 'numero')
                  .annotate(qtd=Count('id')).filter(qtd__gt=1))
    for grupo in duplicados:
        criadas += _ocorrencia(
            empresa, 'possivel_duplicidade', 'atencao',
            f'{grupo["qtd"]} documentos {grupo["tipo_documento"]} com mesmo emitente, série e número '
            f'({grupo["serie"]}/{grupo["numero"]}) e chaves diferentes.',
            f'{empresa.pk}:{grupo["tipo_documento"]}:{grupo["emitente_documento"]}:{grupo["serie"]}:{grupo["numero"]}',
        )

    entrada = docs.filter(classificacao__in=['entrada', 'servico_tomado', 'transporte_contratado'])
    primeiros = entrada.values('emitente_documento').annotate(qtd=Count('id')).filter(qtd=1)
    for fornecedor in primeiros[:200]:
        doc = entrada.filter(emitente_documento=fornecedor['emitente_documento']).first()
        if doc and doc.capturado_em > agora - timedelta(days=30):
            criadas += _ocorrencia(empresa, 'fornecedor_novo', 'informativa',
                                   f'Primeiro documento do fornecedor {doc.emitente_nome} ({doc.emitente_documento}).',
                                   f'{empresa.pk}:{doc.emitente_documento}', doc)

    for controle in ControleSincronizacao.objects.filter(empresa=empresa, ambiente=ambiente).exclude(lacunas_nsu=[]):
        criadas += _ocorrencia(empresa, 'lacuna_nsu', 'atencao',
                               f'{controle.get_fonte_display()}: {len(controle.lacunas_nsu)} NSU(s) faltante(s) '
                               'identificado(s) na sequência de distribuição.', f'{controle.pk}:{len(controle.lacunas_nsu)}')

    config = getattr(empresa, 'monitor_fiscal', None)
    if config and config.certificado and (config.certificado.valido_ate - agora).days <= 30:
        criadas += _ocorrencia(empresa, 'certificado_vencimento', 'atencao' if config.certificado.valido_ate > agora else 'critica',
                               f'Certificado digital válido até {config.certificado.valido_ate:%d/%m/%Y}.',
                               f'{empresa.pk}:{config.certificado.pk}')
    return criadas


def resumo_valores(queryset):
    """Totais que desconsideram cancelados e substituídos."""
    validos = queryset.filter(situacao_fiscal__in=['autorizado', 'encerrado', 'desconhecida'], substituido_por__isnull=True)
    return validos.aggregate(total=Sum('valor_total'))['total'] or Decimal('0')
