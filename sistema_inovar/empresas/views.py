import os
import smtplib
import tempfile
import urllib.parse
import re
import uuid
import datetime
import mimetypes
import unidecode
import logging
import requests
import base64
import logging
import json
import zipfile
from xml.sax.saxutils import escape


from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from email.utils import formatdate
from dateutil.relativedelta import relativedelta

from django.conf import settings
from django.http import FileResponse, HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.core.files.base import ContentFile
from datetime import timedelta
from django.db.models import OuterRef, Subquery, CharField
from django.db import models
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt

from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend 
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework import viewsets, permissions
from rest_framework.test import APIRequestFactory, force_authenticate
from decimal import Decimal
from PyPDF2 import PdfMerger

from empresas.serpro_service import gerar_e_enviar_das
from .permissions import IsPessoalOrFiscalOrAdmin


from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import black
from io import BytesIO
import qrcode
from reportlab.graphics.barcode import code39
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.graphics.barcode import code128
from barcode.codex import Code128
from barcode.writer import ImageWriter, SVGWriter
import base64
from qrcode.image.svg import SvgImage


import pdfkit
from django.template.loader import render_to_string

from .utils import get_bb_access_token

from .models import (
    Empresa, EmpresaAvulsaFaturamento, Socio, DocumentosConstitutivos, XML, DepartamentoPessoal, 
    SimplesNacional, Outros, HistoricoEnvios, Funcionario, ObrigacaoMensal, UserCompanyAccess, Pendencia, Notificacao,
    Tag,
    UltimoResultadoSessao, BoletoBB
)
from .serializers import (
    TagSerializer,
    EmpresaSerializer, EmpresaAvulsaFaturamentoSerializer, DocumentosConstitutivosSerializer, XMLSerializer, 
    DepartamentoPessoalSerializer, SimplesNacionalSerializer, OutrosSerializer, 
    HistoricoEnviosSerializer, FuncionarioSerializer, PendenciaSerializer, NotificacaoSerializer,
    UltimoResultadoSessaoSerializer, BoletoBBSerializer, visible_tags_for_request, unique_tags_by_name
)
from .utils import gerar_nome_pasta_empresa_padronizado, sanitize_filename_for_upload
from .serpro_service import (
    gerar_das_serpro, 
    obter_extrato_pdf_serpro,
    orquestrar_consulta_extrato,
)
from .filters import HistoricoEnviosFilter
from .whatsapp_utils import upload_media_to_whatsapp, send_whatsapp_document_template_message
from .pro_labore_docx import build_pro_labore_pdf

WKHTMLTOPDF_PATH = settings.WKHTMLTOPDF_PATH


logger = logging.getLogger(__name__)

MONTH_NAME_TO_NUMBER = {
    'janeiro': '01',
    'fevereiro': '02',
    'marco': '03',
    'abril': '04',
    'maio': '05',
    'junho': '06',
    'julho': '07',
    'agosto': '08',
    'setembro': '09',
    'outubro': '10',
    'novembro': '11',
    'dezembro': '12',
}


def _normalize_whatsapp_number(raw_number):
    digits = re.sub(r'\D', '', str(raw_number or ''))
    if digits and not digits.startswith('55') and len(digits) in (10, 11):
        digits = f'55{digits}'
    return digits


def _relative_media_path(*path_parts):
    return os.path.join(*path_parts).replace(os.sep, '/')


def _has_surrogate_escape(value):
    return any(0xDC80 <= ord(char) <= 0xDCFF for char in str(value or ''))


def _repair_surrogate_escapes(value):
    repaired = []
    byte_buffer = bytearray()

    def flush_buffer():
        if byte_buffer:
            repaired.append(byte_buffer.decode('cp1252', errors='replace'))
            byte_buffer.clear()

    for char in str(value or ''):
        codepoint = ord(char)
        if 0xDC80 <= codepoint <= 0xDCFF:
            byte_buffer.append(codepoint - 0xDC00)
        else:
            flush_buffer()
            repaired.append(char)

    flush_buffer()
    return ''.join(repaired)


def _ensure_sync_safe_filename(directory_path, filename):
    if not _has_surrogate_escape(filename):
        return filename

    repaired_filename = _repair_surrogate_escapes(filename)
    safe_filename = sanitize_filename_for_upload(repaired_filename)
    source_path = os.path.join(directory_path, filename)
    destination_path = os.path.join(directory_path, safe_filename)

    if source_path == destination_path:
        return safe_filename

    name, extension = os.path.splitext(safe_filename)
    counter = 1
    while os.path.exists(destination_path):
        safe_filename = f"{name}_{counter}{extension}"
        destination_path = os.path.join(directory_path, safe_filename)
        counter += 1

    os.replace(source_path, destination_path)
    logger.info("SYNC: Arquivo com nome invalido renomeado de %s para %s", filename, safe_filename)
    return safe_filename


def _normalize_fs_name(value):
    value = unidecode.unidecode(_repair_surrogate_escapes(value)).lower().strip()
    return re.sub(r'\s+', ' ', value)


def _resolve_existing_child_folder(parent_path, expected_name):
    exact_path = os.path.join(parent_path, expected_name)
    if os.path.isdir(exact_path):
        return exact_path, expected_name, False

    expected_normalized = _normalize_fs_name(expected_name)
    if not os.path.isdir(parent_path):
        return exact_path, expected_name, False

    try:
        child_names = os.listdir(parent_path)
    except OSError as exc:
        logger.warning(f"SYNC: Nao foi possivel listar {parent_path} para localizar {expected_name}: {exc}")
        return exact_path, expected_name, False

    for child_name in child_names:
        child_path = os.path.join(parent_path, child_name)
        if os.path.isdir(child_path) and _normalize_fs_name(child_name) == expected_normalized:
            return child_path, child_name, True

    return exact_path, expected_name, False


def _rename_legacy_child_folder(parent_path, legacy_name, new_name):
    legacy_path = os.path.join(parent_path, legacy_name)
    new_path = os.path.join(parent_path, new_name)
    if os.path.isdir(new_path) or not os.path.isdir(legacy_path):
        return

    try:
        os.replace(legacy_path, new_path)
        logger.info(f"SYNC: Pasta legado renomeada de {legacy_path} para {new_path}")
    except OSError as exc:
        logger.warning(f"SYNC: Nao foi possivel renomear {legacy_path} para {new_path}: {exc}")


def _extract_year_month_from_relative_parts(relative_parts):
    year = None
    month = None

    for part in relative_parts:
        normalized_part = unidecode.unidecode(str(part or '')).lower()
        compact_part = re.sub(r'\D+', '', normalized_part)

        if not year:
            year_match = re.search(r'(20\d{2}|19\d{2})', normalized_part)
            if year_match:
                year = year_match.group(1)

        if not month:
            if len(compact_part) == 6 and compact_part[:2].isdigit() and compact_part[2:].isdigit():
                possible_month = int(compact_part[:2])
                if 1 <= possible_month <= 12:
                    month = f"{possible_month:02d}"
                    if not year:
                        year = compact_part[2:]
                    continue

            if len(compact_part) == 6 and compact_part[:4].isdigit() and compact_part[4:].isdigit():
                possible_month = int(compact_part[4:])
                if 1 <= possible_month <= 12:
                    month = f"{possible_month:02d}"
                    if not year:
                        year = compact_part[:4]
                    continue

            month_match = re.search(r'(?<!\d)(0?[1-9]|1[0-2])(?!\d)', normalized_part)
            if month_match:
                month = f"{int(month_match.group(1)):02d}"
                continue

            for month_name, month_number in MONTH_NAME_TO_NUMBER.items():
                if month_name in normalized_part:
                    month = month_number
                    break

    return year, month


def _format_sync_month_summary(month_counts):
    if not month_counts:
        return "nenhum arquivo com mês/ano identificado"

    summary_parts = []
    for year, month in sorted(month_counts.keys()):
        summary_parts.append(f"{month}/{year}: {month_counts[(year, month)]}")
    return ", ".join(summary_parts)


IGNORED_SYNC_FILENAMES = {
    'thumbs.db',
    'desktop.ini',
    '.ds_store',
}


def _is_ignored_sync_file(filename):
    return str(filename or '').strip().lower() in IGNORED_SYNC_FILENAMES


def _exclude_ignored_sync_files(queryset):
    for ignored_filename in IGNORED_SYNC_FILENAMES:
        queryset = queryset.exclude(nome_arquivo__iexact=ignored_filename)
    return queryset


def _parse_bb_decimal(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _parse_bb_date(value):
    if not value:
        return None

    value_str = str(value).strip()
    for fmt in ('%d.%m.%Y', '%d/%m/%Y', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.datetime.strptime(value_str, fmt).date()
        except ValueError:
            continue

    parsed = parse_date(value_str)
    if parsed:
        return parsed
    return None


def _map_bb_webhook_status(evento, payload_obj):
    evento_norm = str(evento or '').strip().lower()
    codigo_baixa = str(payload_obj.get('codigoEstadoBaixaOperacional') or '').strip()

    if (
        'liquid' in evento_norm
        or payload_obj.get('dataLiquidacao')
        or payload_obj.get('valorPagoSacado') is not None
        or codigo_baixa in {'1', '2'}
    ):
        return 'pago'
    if 'cancel' in evento_norm:
        return 'cancelado'
    if 'baixa' in evento_norm:
        return 'baixado'
    return None


def _xlsx_column_name(index):
    name = ''
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def _xlsx_cell(reference, value, style=None):
    style_attr = f' s="{style}"' if style is not None else ''
    if value in (None, ''):
        return f'<c r="{reference}"{style_attr}/>'
    if isinstance(value, (int, float, Decimal)):
        return f'<c r="{reference}"{style_attr}><v>{value}</v></c>'
    return (
        f'<c r="{reference}" t="inlineStr"{style_attr}>'
        f'<is><t>{escape(str(value))}</t></is>'
        '</c>'
    )


def _build_xlsx_file(sheet_title, headers, rows, column_widths=None):
    sheet_title = str(sheet_title or 'Relatorio')[:31]
    column_widths = column_widths or {}

    sheet_rows = []
    for row_index, row_values in enumerate([headers, *rows], start=1):
        cells = []
        for column_index, value in enumerate(row_values, start=1):
            reference = f'{_xlsx_column_name(column_index)}{row_index}'
            style = 1 if row_index == 1 else None
            cells.append(_xlsx_cell(reference, value, style=style))
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    cols = ''.join(
        f'<col min="{index}" max="{index}" width="{width}" customWidth="1"/>'
        for index, width in sorted(column_widths.items())
    )

    worksheet = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <cols>{cols}</cols>
  <sheetData>{"".join(sheet_rows)}</sheetData>
</worksheet>'''

    workbook = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="{escape(sheet_title)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>'''

    styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>'''

    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>'''

    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''

    workbook_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', content_types)
        archive.writestr('_rels/.rels', root_rels)
        archive.writestr('xl/workbook.xml', workbook)
        archive.writestr('xl/_rels/workbook.xml.rels', workbook_rels)
        archive.writestr('xl/styles.xml', styles)
        archive.writestr('xl/worksheets/sheet1.xml', worksheet)

    buffer.seek(0)
    return buffer


def _format_report_date(value):
    if not value:
        return ''
    if hasattr(value, 'strftime'):
        return value.strftime('%d/%m/%Y')
    return str(value)


def _format_report_datetime(value):
    if not value:
        return ''
    if hasattr(value, 'strftime'):
        return timezone.localtime(value).strftime('%d/%m/%Y %H:%M')
    return str(value)


def _yes_no(value):
    return 'Sim' if value else 'Nao'


def _format_cpf(value):
    digits = re.sub(r'\D', '', str(value or ''))
    if len(digits) != 11:
        return value or ''
    return f'{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}'


def _parse_report_date(value):
    if not value:
        return None
    return parse_date(str(value))


def _visible_empresas_for_report(request):
    queryset = Empresa.objects.prefetch_related('usuarios', 'tags', 'socios').all()
    if not request.user.is_staff and not request.user.is_superuser:
        queryset = queryset.filter(gerenciada_por=request.user)
    return queryset.distinct()


def _apply_empresa_report_filters(queryset, filters):
    search = str(filters.get('search') or '').strip()
    carteira = str(filters.get('carteira') or '').strip()
    status_empresa = str(filters.get('status_empresa') or 'ativas').strip()
    regime = str(filters.get('regime_tributario') or '').strip()

    if status_empresa == 'ativas':
        queryset = queryset.filter(ativo=True)
    elif status_empresa == 'inativas':
        queryset = queryset.filter(ativo=False)

    if carteira:
        queryset = queryset.filter(carteira_clientes=carteira)
    if regime:
        queryset = queryset.filter(regime_tributario=regime)
    if search:
        digits = re.sub(r'\D', '', search)
        queryset = queryset.filter(
            models.Q(nome__icontains=search)
            | models.Q(cnpj__icontains=search)
            | models.Q(email__icontains=search)
            | models.Q(telefone__icontains=digits or search)
        )

    return queryset.distinct()


def _workbook_response(sheet_title, filename, headers, rows, column_widths=None):
    workbook = _build_xlsx_file(sheet_title, headers, rows, column_widths=column_widths)
    response = HttpResponse(
        workbook.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def _build_empresas_cadastro_report(request, filters):
    empresas = _apply_empresa_report_filters(_visible_empresas_for_report(request), filters).order_by('nome')
    rows = []
    for empresa in empresas:
        rows.append([
            empresa.nome,
            empresa.cnpj,
            empresa.email,
            empresa.telefone or '',
            empresa.cidade or '',
            empresa.uf or '',
            empresa.regime_tributario or '',
            empresa.porte_empresa or '',
            empresa.carteira_clientes or '',
            _yes_no(empresa.simples_nacional),
            _yes_no(empresa.ativo),
            empresa.valor_honorario or Decimal('0.00'),
            empresa.dia_vencimento_honorario or '',
            ', '.join(tag.nome for tag in empresa.tags.all()),
        ])

    return _workbook_response(
        'Cadastro de empresas',
        'relatorio_cadastro_empresas.xlsx',
        [
            'Empresa', 'CNPJ', 'Email', 'Telefone', 'Cidade', 'UF', 'Regime tributario',
            'Porte', 'Carteira', 'Simples Nacional', 'Ativa', 'Valor honorario',
            'Dia vencimento honorario', 'Tags',
        ],
        rows,
        {1: 36, 2: 20, 3: 32, 4: 18, 5: 18, 7: 20, 9: 18, 14: 34},
    )


def _build_carteira_responsaveis_report(request, filters):
    empresas = _apply_empresa_report_filters(_visible_empresas_for_report(request), filters).order_by('nome')
    rows = []
    for empresa in empresas:
        responsaveis = [
            (usuario.get_full_name() or usuario.username)
            for usuario in empresa.usuarios.all()
        ]
        gerentes = [
            (usuario.get_full_name() or usuario.username)
            for usuario in empresa.gerenciada_por.all()
        ]
        rows.append([
            empresa.nome,
            empresa.cnpj,
            empresa.carteira_clientes or '',
            ', '.join(responsaveis),
            ', '.join(gerentes),
            empresa.regime_tributario or '',
            _yes_no(empresa.monitorar_simples),
            _yes_no(empresa.ativo),
        ])

    return _workbook_response(
        'Carteira',
        'relatorio_carteira_responsaveis.xlsx',
        ['Empresa', 'CNPJ', 'Carteira', 'Usuarios vinculados', 'Gerenciada por', 'Regime', 'Monitora simples', 'Ativa'],
        rows,
        {1: 36, 2: 20, 3: 18, 4: 42, 5: 42, 6: 20},
    )


def _build_obrigacoes_report(request, filters):
    empresas = _apply_empresa_report_filters(_visible_empresas_for_report(request), filters).order_by('nome')
    rows = []
    for empresa in empresas:
        checks = [empresa.inss, empresa.fgts, empresa.folha, empresa.honorario, empresa.simples_nacional]
        pendentes = sum(1 for item in checks if not item)
        rows.append([
            empresa.nome,
            empresa.cnpj,
            _yes_no(empresa.inss),
            _yes_no(empresa.fgts),
            _yes_no(empresa.folha),
            _yes_no(empresa.honorario),
            _yes_no(empresa.simples_nacional),
            pendentes,
            empresa.carteira_clientes or '',
            _yes_no(empresa.ativo),
        ])

    return _workbook_response(
        'Obrigacoes',
        'relatorio_obrigacoes_mensais.xlsx',
        ['Empresa', 'CNPJ', 'INSS', 'FGTS', 'Folha', 'Honorario', 'Simples Nacional', 'Pendencias', 'Carteira', 'Ativa'],
        rows,
        {1: 36, 2: 20, 8: 14, 9: 18},
    )


def _build_boletos_report(request, filters):
    empresas = _apply_empresa_report_filters(_visible_empresas_for_report(request), filters)
    empresa_ids = empresas.values_list('id', flat=True)
    queryset = BoletoBB.objects.select_related('empresa').filter(empresa_id__in=empresa_ids)

    start_date = _parse_report_date(filters.get('data_inicio'))
    end_date = _parse_report_date(filters.get('data_fim'))
    status_filter = str(filters.get('status_boleto') or '').strip()
    report_type = filters.get('report_type')

    if start_date:
        queryset = queryset.filter(data_vencimento__gte=start_date)
    if end_date:
        queryset = queryset.filter(data_vencimento__lte=end_date)
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if report_type == 'inadimplencia':
        queryset = queryset.filter(status='registrado', data_vencimento__lt=timezone.localdate())

    rows = []
    total_original = Decimal('0.00')
    total_pago = Decimal('0.00')
    hoje = timezone.localdate()
    for boleto in queryset.order_by('empresa__nome', 'data_vencimento', 'numero_titulo_cliente'):
        total_original += boleto.valor_original or Decimal('0.00')
        total_pago += boleto.valor_pago or Decimal('0.00')
        dias_atraso = ''
        if boleto.data_vencimento and boleto.status == 'registrado' and boleto.data_vencimento < hoje:
            dias_atraso = (hoje - boleto.data_vencimento).days
        rows.append([
            boleto.empresa.nome,
            boleto.empresa.cnpj,
            boleto.numero_titulo_cliente,
            boleto.nosso_numero or '',
            boleto.status,
            _format_report_date(boleto.data_vencimento),
            _format_report_date(boleto.data_pagamento),
            boleto.valor_original or Decimal('0.00'),
            boleto.valor_pago or '',
            dias_atraso,
            boleto.empresa.telefone or '',
        ])

    rows.append(['TOTAL', '', '', '', '', '', '', total_original, total_pago, '', f'{queryset.count()} boleto(s)'])
    filename = 'relatorio_inadimplencia_boletos.xlsx' if report_type == 'inadimplencia' else 'relatorio_boletos.xlsx'
    sheet_title = 'Inadimplencia' if report_type == 'inadimplencia' else 'Boletos'
    return _workbook_response(
        sheet_title,
        filename,
        ['Empresa', 'CNPJ', 'Numero titulo', 'Nosso numero', 'Status', 'Vencimento', 'Pagamento', 'Valor original', 'Valor pago', 'Dias atraso', 'Telefone'],
        rows,
        {1: 36, 2: 20, 3: 22, 4: 20, 6: 16, 8: 16, 9: 16, 11: 18},
    )


def _document_rows_for_model(queryset, pasta_label, date_filtered=False):
    rows = []
    for item in queryset:
        rows.append([
            pasta_label,
            getattr(item, 'nome_empresa', '') or '',
            getattr(item, 'cnpj_empresa', '') or '',
            item.nome_arquivo,
            item.tipo_documento,
            getattr(item, 'mes', '') or '',
            getattr(item, 'ano', '') or '',
            _yes_no(getattr(item, 'entregue', False)) if hasattr(item, 'entregue') else '',
        ])
    return rows


def _build_documentos_report(request, filters):
    empresas = _apply_empresa_report_filters(_visible_empresas_for_report(request), filters)
    nomes = list(empresas.values_list('nome', flat=True))
    cnpjs = list(empresas.values_list('cnpj', flat=True))
    pasta = str(filters.get('pasta_documento') or '').strip()
    ano = str(filters.get('ano') or '').strip()
    mes = str(filters.get('mes') or '').strip().zfill(2)

    sources = [
        ('documentos_constitutivos', 'Documentos constitutivos', DocumentosConstitutivos.objects.filter(nome_empresa__in=nomes)),
        ('departamento_pessoal', 'Departamento pessoal', DepartamentoPessoal.objects.filter(cnpj_empresa__in=cnpjs)),
        ('simples_nacional', 'Simples Nacional', SimplesNacional.objects.filter(cnpj_empresa__in=cnpjs)),
        ('xml', 'XML', XML.objects.filter(cnpj_empresa__in=cnpjs)),
        ('outros', 'Outros', Outros.objects.filter(models.Q(cnpj_empresa__in=cnpjs) | models.Q(nome_empresa__in=nomes))),
    ]

    rows = []
    for source_key, label, queryset in sources:
        if pasta and pasta != source_key:
            continue
        queryset = _exclude_ignored_sync_files(queryset)
        if ano and hasattr(queryset.model, 'ano'):
            queryset = queryset.filter(ano=ano)
        if mes and mes != '00' and hasattr(queryset.model, 'mes'):
            queryset = queryset.filter(mes=mes)
        rows.extend(_document_rows_for_model(queryset.order_by('nome_empresa', 'nome_arquivo'), label))

    return _workbook_response(
        'Documentos',
        'relatorio_documentos.xlsx',
        ['Pasta', 'Empresa', 'CNPJ', 'Arquivo', 'Tipo documento', 'Mes', 'Ano', 'Entregue'],
        rows,
        {1: 24, 2: 36, 3: 20, 4: 42, 5: 22},
    )


def _build_historico_envios_report(request, filters):
    empresas = _apply_empresa_report_filters(_visible_empresas_for_report(request), filters)
    queryset = HistoricoEnvios.objects.select_related('empresa', 'usuario').filter(empresa_id__in=empresas.values_list('id', flat=True))
    start_date = _parse_report_date(filters.get('data_inicio'))
    end_date = _parse_report_date(filters.get('data_fim'))
    status_filter = str(filters.get('status_envio') or '').strip()

    if start_date:
        queryset = queryset.filter(data_hora__date__gte=start_date)
    if end_date:
        queryset = queryset.filter(data_hora__date__lte=end_date)
    if status_filter:
        queryset = queryset.filter(status=status_filter)

    rows = []
    for envio in queryset.order_by('-data_hora'):
        rows.append([
            _format_report_datetime(envio.data_hora),
            envio.empresa.nome if envio.empresa else '',
            envio.remetente,
            envio.arquivo,
            envio.status,
            envio.usuario.get_full_name() or envio.usuario.username if envio.usuario else '',
            envio.message_id or '',
            envio.erro or '',
        ])

    return _workbook_response(
        'Historico envios',
        'relatorio_historico_envios.xlsx',
        ['Data/hora', 'Empresa', 'Destinatario', 'Arquivo', 'Status', 'Usuario', 'Message ID', 'Erro'],
        rows,
        {1: 20, 2: 36, 3: 18, 4: 36, 6: 24, 8: 44},
    )


def _build_socios_honorarios_report(request, filters):
    empresas = _apply_empresa_report_filters(_visible_empresas_for_report(request), filters).order_by('nome')
    rows = []
    for empresa in empresas:
        socios = list(empresa.socios.all())
        if not socios:
            rows.append([
                empresa.nome,
                empresa.cnpj,
                '',
                '',
                empresa.valor_honorario or Decimal('0.00'),
                empresa.dia_vencimento_honorario or '',
                empresa.carteira_clientes or '',
                _yes_no(empresa.ativo),
            ])
        for socio in socios:
            rows.append([
                empresa.nome,
                empresa.cnpj,
                socio.nome,
                socio.cpf,
                empresa.valor_honorario or Decimal('0.00'),
                empresa.dia_vencimento_honorario or '',
                empresa.carteira_clientes or '',
                _yes_no(empresa.ativo),
            ])

    return _workbook_response(
        'Socios e honorarios',
        'relatorio_socios_honorarios.xlsx',
        ['Empresa', 'CNPJ', 'Socio', 'CPF', 'Honorario', 'Dia vencimento', 'Carteira', 'Ativa'],
        rows,
        {1: 36, 2: 20, 3: 32, 4: 18, 5: 16, 7: 18},
    )


def _build_socios_por_empresa_report(request, filters):
    empresas = _apply_empresa_report_filters(_visible_empresas_for_report(request), filters).order_by('nome')
    rows = []

    for empresa in empresas:
        socios = list(empresa.socios.all())
        total_socios = len(socios)

        if not socios:
            rows.append([
                empresa.nome,
                empresa.cnpj,
                'Sem socios cadastrados',
                '',
                0,
                empresa.regime_tributario or '',
                empresa.carteira_clientes or '',
                _yes_no(empresa.ativo),
            ])
            continue

        for socio in socios:
            rows.append([
                empresa.nome,
                empresa.cnpj,
                socio.nome,
                _format_cpf(socio.cpf),
                total_socios,
                empresa.regime_tributario or '',
                empresa.carteira_clientes or '',
                _yes_no(empresa.ativo),
            ])

    return _workbook_response(
        'Socios por empresa',
        'relatorio_socios_por_empresa.xlsx',
        ['Empresa', 'CNPJ', 'Socio', 'CPF', 'Total socios', 'Regime tributario', 'Carteira', 'Ativa'],
        rows,
        {1: 36, 2: 20, 3: 34, 4: 18, 5: 14, 6: 22, 7: 18},
    )


def _build_usuarios_report(request, filters):
    if not request.user.is_staff and not request.user.is_superuser and getattr(request.user, 'cargo', None) != 'admin':
        return Response({'error': 'Apenas administradores podem exportar usuarios.'}, status=status.HTTP_403_FORBIDDEN)

    rows = []
    for usuario in Funcionario.objects.prefetch_related('empresas_gerenciadas').order_by('first_name', 'username'):
        rows.append([
            usuario.username,
            usuario.get_full_name(),
            usuario.email,
            usuario.cargo,
            _yes_no(usuario.is_active),
            _yes_no(usuario.is_staff),
            usuario.empresas_gerenciadas.count(),
            ', '.join(usuario.empresas_gerenciadas.values_list('nome', flat=True)),
        ])

    return _workbook_response(
        'Usuarios',
        'relatorio_usuarios.xlsx',
        ['Usuario', 'Nome', 'Email', 'Cargo', 'Ativo', 'Staff', 'Qtd empresas', 'Empresas gerenciadas'],
        rows,
        {1: 22, 2: 28, 3: 32, 4: 24, 8: 60},
    )


REPORT_BUILDERS = {
    'empresas_cadastro': _build_empresas_cadastro_report,
    'carteira_responsaveis': _build_carteira_responsaveis_report,
    'obrigacoes_mensais': _build_obrigacoes_report,
    'boletos_financeiro': _build_boletos_report,
    'inadimplencia': _build_boletos_report,
    'documentos': _build_documentos_report,
    'historico_envios': _build_historico_envios_report,
    'socios_honorarios': _build_socios_honorarios_report,
    'socios_por_empresa': _build_socios_por_empresa_report,
    'usuarios': _build_usuarios_report,
}


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def gerar_relatorio_excel(request):
    report_type = str(request.data.get('report_type') or '').strip()
    filters = request.data.get('filters') or {}
    if not isinstance(filters, dict):
        filters = {}
    filters['report_type'] = report_type

    builder = REPORT_BUILDERS.get(report_type)
    if not builder:
        return Response({'error': 'Tipo de relatorio invalido.'}, status=status.HTTP_400_BAD_REQUEST)

    return builder(request, filters)

MODEL_CONFIG_MAP = {
    'documentos_constitutivos': {
        'model': DocumentosConstitutivos, 
        'company_field_name': 'nome_empresa', 
        'company_attr': 'nome',
        'whatsapp_template_name': 'envio_documento_com_contato'
    },
    'departamento_pessoal': {
        'model': DepartamentoPessoal, 
        'company_field_name': 'cnpj_empresa', 
        'company_attr': 'cnpj',
        'whatsapp_template_name': 'enviar_dp' 
    },
    'simples_nacional': {
        'model': SimplesNacional, 
        'company_field_name': 'cnpj_empresa', 
        'company_attr': 'cnpj',
        'whatsapp_template_name': 'enviar_sn' 
    },
    'outros': {
        'model': Outros, 
        'company_field_name': 'nome_empresa', 
        'company_attr': 'nome',
        'whatsapp_template_name': 'envio_documento_com_contato'
    },
}

MODEL_CONFIG_MAP_SYNC = {
    'documentos_constitutivos': {
        'model': DocumentosConstitutivos, 'serializer': DocumentosConstitutivosSerializer,
        'company_field_name_in_doc_model': 'nome_empresa', # Campo no modelo do documento que guarda o nome da empresa
        'company_attr_in_empresa_model': 'nome', # Atributo no modelo Empresa para filtro (geralmente nome ou cnpj)
        'fs_folder_name': 'DOCUMENTOS CONSTITUTIVOS', 'has_year_month': False
    },
    'departamento_pessoal': {
        'model': DepartamentoPessoal, 'serializer': DepartamentoPessoalSerializer,
        'company_field_name_in_doc_model': 'cnpj_empresa',
        'company_attr_in_empresa_model': 'cnpj',
        'fs_folder_name': 'DEPARTAMENTO PESSOAL', 'has_year_month': True
    },
    'simples_nacional': {
        'model': SimplesNacional, 'serializer': SimplesNacionalSerializer,
        'company_field_name_in_doc_model': 'cnpj_empresa',
        'company_attr_in_empresa_model': 'cnpj',
        'fs_folder_name': 'SIMPLES NACIONAL', 'has_year_month': True
    },
    'xml': {
        'model': XML, 'serializer': XMLSerializer,
        'company_field_name_in_doc_model': 'cnpj_empresa',
        'company_attr_in_empresa_model': 'cnpj',
        'fs_folder_name': 'XML', 'has_year_month': True
    },
    'outros': {
        'model': Outros, 'serializer': OutrosSerializer,
        'company_field_name_in_doc_model': 'nome_empresa',
        'company_attr_in_empresa_model': 'nome',
        'fs_folder_name': 'HONORARIOS', 'has_year_month': True
    },
}


def _resolve_document_file_path(doc, empresa, tipo_pasta):
    file_path_on_server = None
    config_sync = MODEL_CONFIG_MAP_SYNC.get(tipo_pasta)

    if config_sync:
        company_folder = gerar_nome_pasta_empresa_padronizado(empresa.nome)
        fs_folder_name = config_sync['fs_folder_name']
        base_path = os.path.join(settings.MEDIA_ROOT, company_folder, fs_folder_name)

        if config_sync['has_year_month']:
            doc_ano = str(getattr(doc, 'ano', '') or '')
            doc_mes = str(getattr(doc, 'mes', '') or '').zfill(2)
            if doc_ano and doc_mes:
                folder_month_year = f"{doc_mes}{doc_ano}"
                base_path = os.path.join(base_path, doc_ano, folder_month_year)

        possible_path = os.path.join(base_path, doc.nome_arquivo)
        if os.path.exists(possible_path):
            file_path_on_server = possible_path
            logger.info(f"Arquivo encontrado compondo caminho manual: {file_path_on_server}")
        else:
            logger.warning(
                f"Arquivo não encontrado no caminho manual: {possible_path}. "
                "Tentando fallback para doc.caminho_arquivo.path"
            )
            if doc.caminho_arquivo and hasattr(doc.caminho_arquivo, 'path') and os.path.exists(doc.caminho_arquivo.path):
                file_path_on_server = doc.caminho_arquivo.path

    if not file_path_on_server and doc.caminho_arquivo and hasattr(doc.caminho_arquivo, 'path'):
        file_path_on_server = doc.caminho_arquivo.path

    return file_path_on_server


def _honorario_reference_periods(boleto):
    periods = []
    reference_dates = []

    if boleto.criado_em:
        created_at = boleto.criado_em
        if timezone.is_aware(created_at):
            created_at = timezone.localtime(created_at)
        reference_dates.append(created_at)

    if boleto.data_vencimento:
        reference_dates.append(boleto.data_vencimento)

    for reference_date in reference_dates:
        period = (str(reference_date.year), str(reference_date.month).zfill(2))
        if period not in periods:
            periods.append(period)

    return periods


def _honorario_company_queryset(document_model, empresa):
    queryset = document_model.objects.filter(tipo_documento__iexact='HONORARIO')

    if document_model is Outros:
        return queryset.filter(
            models.Q(cnpj_empresa=empresa.cnpj)
            | models.Q(nome_empresa=empresa.nome)
        )

    return queryset.filter(cnpj_empresa=empresa.cnpj)


def _find_existing_honorario_document(document_model, empresa, periods, tipo_pasta):
    queryset = _honorario_company_queryset(document_model, empresa)
    checked_ids = set()

    for year, month in periods:
        period_documents = queryset.filter(
            ano=year,
            mes=month,
        ).order_by('-id')

        for document in period_documents:
            checked_ids.add(document.id)
            file_path = _resolve_document_file_path(document, empresa, tipo_pasta)
            if file_path and os.path.isfile(file_path):
                return document, file_path

    for document in queryset.order_by('-ano', '-mes', '-id'):
        if document.id in checked_ids:
            continue

        file_path = _resolve_document_file_path(document, empresa, tipo_pasta)
        if file_path and os.path.isfile(file_path):
            return document, file_path

    return None, None


def _find_honorario_file_in_period_folder(period_folder):
    if not os.path.isdir(period_folder):
        return None

    expected_path = os.path.join(period_folder, 'HONORARIO.pdf')
    if os.path.isfile(expected_path):
        return expected_path

    try:
        filenames = os.listdir(period_folder)
    except OSError:
        return None

    for filename in filenames:
        normalized_filename = unidecode.unidecode(filename).strip().upper()
        if normalized_filename == 'HONORARIO.PDF':
            candidate = os.path.join(period_folder, filename)
            if os.path.isfile(candidate):
                return candidate

    return None


def _find_honorario_file_on_disk(empresa, periods, folder_name):
    company_folder_name = gerar_nome_pasta_empresa_padronizado(empresa.nome)
    company_folder, _, _ = _resolve_existing_child_folder(
        settings.MEDIA_ROOT,
        company_folder_name,
    )
    document_folder, _, _ = _resolve_existing_child_folder(
        company_folder,
        folder_name,
    )

    for year, month in periods:
        period_folder = os.path.join(document_folder, year, f'{month}{year}')
        file_path = _find_honorario_file_in_period_folder(period_folder)
        if file_path:
            return file_path

    if not os.path.isdir(document_folder):
        return None

    try:
        year_names = sorted(os.listdir(document_folder), reverse=True)
    except OSError:
        return None

    for year_name in year_names:
        year_folder = os.path.join(document_folder, year_name)
        if not os.path.isdir(year_folder):
            continue

        try:
            period_names = sorted(os.listdir(year_folder), reverse=True)
        except OSError:
            continue

        for period_name in period_names:
            file_path = _find_honorario_file_in_period_folder(
                os.path.join(year_folder, period_name)
            )
            if file_path:
                return file_path

    return None


def buscar_boleto_honorario_para_cobranca(empresa, boleto):
    periods = _honorario_reference_periods(boleto)
    sources = (
        ('database', Outros, 'outros', 'HONORARIOS'),
        ('filesystem', None, 'HONORARIOS', 'HONORARIOS (arquivo físico)'),
        (
            'database',
            DepartamentoPessoal,
            'departamento_pessoal',
            'DEPARTAMENTO PESSOAL (legado)',
        ),
        (
            'filesystem',
            None,
            'DEPARTAMENTO PESSOAL',
            'DEPARTAMENTO PESSOAL (arquivo físico legado)',
        ),
    )

    for source_type, document_model, source_key, source_name in sources:
        if source_type == 'database':
            document, file_path = _find_existing_honorario_document(
                document_model,
                empresa,
                periods,
                source_key,
            )
        else:
            document = None
            file_path = _find_honorario_file_on_disk(
                empresa,
                periods,
                source_key,
            )

        if file_path:
            logger.info(
                "Boleto de honorario localizado para cobranca. "
                f"Empresa={empresa.nome}, origem={source_name}, caminho={file_path}"
            )
            return document, file_path, source_name

    return None, None, None


@api_view(['GET'])
def visualizar_arquivo_empresa(request, tipo_pasta, arquivo_id):
    if tipo_pasta not in MODEL_CONFIG_MAP_SYNC:
        return JsonResponse({"error": f"Tipo de pasta '{tipo_pasta}' não suportado."}, status=status.HTTP_400_BAD_REQUEST)

    config = MODEL_CONFIG_MAP_SYNC[tipo_pasta]
    DocumentModel = config['model']

    try:
        doc = DocumentModel.objects.get(id=arquivo_id)
    except DocumentModel.DoesNotExist:
        return JsonResponse({"error": "Arquivo não encontrado."}, status=status.HTTP_404_NOT_FOUND)

    empresa_nome = getattr(doc, 'nome_empresa', None)
    empresa = Empresa.objects.filter(nome=empresa_nome).first() if empresa_nome else None

    if not empresa and hasattr(doc, 'cnpj_empresa'):
        empresa = Empresa.objects.filter(cnpj=getattr(doc, 'cnpj_empresa', None)).first()

    if not empresa:
        return JsonResponse({"error": "Empresa vinculada ao arquivo não foi encontrada."}, status=status.HTTP_404_NOT_FOUND)

    file_path_on_server = _resolve_document_file_path(doc, empresa, tipo_pasta)
    if not file_path_on_server or not os.path.exists(file_path_on_server):
        logger.error(f"Arquivo FÍSICO não encontrado para visualização. ID {doc.id}: {doc.nome_arquivo}")
        return JsonResponse({"error": "Arquivo físico não encontrado no servidor."}, status=status.HTTP_404_NOT_FOUND)

    content_type, _ = mimetypes.guess_type(file_path_on_server)
    response = FileResponse(open(file_path_on_server, 'rb'), content_type=content_type or 'application/octet-stream')
    response['Content-Disposition'] = f'inline; filename="{urllib.parse.quote(doc.nome_arquivo)}"'
    return response

class EmpresaViewSet(viewsets.ModelViewSet):
    queryset = Empresa.objects.prefetch_related('socios', 'tags').all().order_by('nome')
    serializer_class = EmpresaSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'destroy']:  # Apenas create e destroy para admins
            return [IsAdminUser()]
        elif self.action == 'partial_update':  # partial_update para todos autenticados
            return [IsAuthenticated(), IsPessoalOrFiscalOrAdmin()]
        elif self.action == 'update':  # update para todos autenticados
            return [IsAuthenticated()]
        return [IsAuthenticated()]  # Padrão para list e retrieve

    def get_queryset(self):
        queryset = super().get_queryset()
        visible_tag_ids = visible_tags_for_request(self.request).values_list('id', flat=True)
        tag_id = self.request.query_params.get('tag') or self.request.query_params.get('tag_id')
        if tag_id and str(tag_id).isdigit():
            if not visible_tags_for_request(self.request).filter(id=tag_id).exists():
                return queryset.none()
            queryset = queryset.filter(tags__id=tag_id)

        tag_ids = self.request.query_params.get('tags')
        if tag_ids:
            parsed_tag_ids = [value.strip() for value in tag_ids.split(',') if value.strip().isdigit()]
            if parsed_tag_ids:
                visible_ids = set(str(tag_id) for tag_id in visible_tag_ids)
                scoped_tag_ids = [tag_id for tag_id in parsed_tag_ids if tag_id in visible_ids]
                if not scoped_tag_ids:
                    return queryset.none()
                queryset = queryset.filter(tags__id__in=scoped_tag_ids)

        if self.request.query_params.get('all') == 'true':
            return queryset.distinct()
        if not self.request.user.is_staff and not self.request.user.is_superuser:
            queryset = queryset.filter(gerenciada_por=self.request.user)
        return queryset.distinct()

    def destroy(self, request, *args, **kwargs):
        try:
            instance = self.get_queryset().get(pk=kwargs.get('pk'))
            empresa_nome = instance.nome
            users_to_notify = Funcionario.objects.filter(usercompanyaccess__empresa=instance)
            logger.info(f"Excluindo empresa '{empresa_nome}'. Usuários a notificar: {[user.username for user in users_to_notify]}")
            self.perform_destroy(instance)
            for user in users_to_notify:
                Notificacao.objects.create(
                    destinatario=user,
                    mensagem=f'Administrador excluiu a empresa "{empresa_nome}".'
                )
            logger.info(f"Notificações criadas para exclusão da empresa '{empresa_nome}'.")
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Empresa.DoesNotExist:
            logger.warning(f"Tentativa de excluir empresa com pk={kwargs.get('pk')} que não existe.")
            return Response({"error": "Empresa não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, *args, **kwargs):
        empresa_id = kwargs.get('pk')
        try:
            instance = self.get_queryset().get(pk=empresa_id)
            self.check_object_permissions(request, instance)
            serializer = self.get_serializer(instance, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                # Notificações são criadas automaticamente pelo signal post_save em signals.py
                logger.info(f"Empresa '{instance.nome}' atualizada parcialmente.")
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Empresa.DoesNotExist:
            return Response({"error": f"Empresa com ID {empresa_id} não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_queryset().get(pk=kwargs.get('pk'))
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        # Notificações são criadas automaticamente pelo signal post_save em signals.py
        logger.info(f"Empresa '{instance.nome}' atualizada.")
        return Response(serializer.data)


class EmpresaAvulsaFaturamentoViewSet(viewsets.ModelViewSet):
    queryset = EmpresaAvulsaFaturamento.objects.all().order_by('nome')
    serializer_class = EmpresaAvulsaFaturamentoSerializer
    permission_classes = [IsAuthenticated]
        
class DocumentosConstitutivosViewSet(viewsets.ModelViewSet):
    queryset = DocumentosConstitutivos.objects.all()  # Defina o queryset base
    serializer_class = DocumentosConstitutivosSerializer

    def get_queryset(self):
        empresa_id = self.kwargs.get('empresa_id') or self.request.query_params.get('empresa_id')
        if empresa_id:
            try:
                empresa = Empresa.objects.get(id=empresa_id)
                return _exclude_ignored_sync_files(DocumentosConstitutivos.objects.filter(nome_empresa=empresa.nome))
            except Empresa.DoesNotExist:
                return DocumentosConstitutivos.objects.none()
        return _exclude_ignored_sync_files(super().get_queryset())

class DepartamentoPessoalViewSet(viewsets.ModelViewSet):
    queryset = DepartamentoPessoal.objects.all()  # Defina o queryset base
    serializer_class = DepartamentoPessoalSerializer

    def get_queryset(self):
        empresa_id = self.kwargs.get('empresa_id') or self.request.query_params.get('empresa_id')
        if empresa_id:
            try:
                empresa = Empresa.objects.get(id=empresa_id)
                return _exclude_ignored_sync_files(DepartamentoPessoal.objects.filter(cnpj_empresa=empresa.cnpj))
            except Empresa.DoesNotExist:
                return DepartamentoPessoal.objects.none()
        return _exclude_ignored_sync_files(super().get_queryset())

class XMLViewSet(viewsets.ModelViewSet):
    queryset = XML.objects.all()  # Defina o queryset base
    serializer_class = XMLSerializer

    def get_queryset(self):
        empresa_id = self.kwargs.get('empresa_id') or self.request.query_params.get('empresa_id')
        if empresa_id:
            try:
                empresa = Empresa.objects.get(id=empresa_id)
                return _exclude_ignored_sync_files(XML.objects.filter(cnpj_empresa=empresa.cnpj))
            except Empresa.DoesNotExist:
                return XML.objects.none()
        return _exclude_ignored_sync_files(super().get_queryset())

class SimplesNacionalViewSet(viewsets.ModelViewSet):
    queryset = SimplesNacional.objects.all()  # Defina o queryset base
    serializer_class = SimplesNacionalSerializer

    def get_queryset(self):
        empresa_id = self.kwargs.get('empresa_id') or self.request.query_params.get('empresa_id')
        if empresa_id:
            try:
                empresa = Empresa.objects.get(id=empresa_id)
                return _exclude_ignored_sync_files(SimplesNacional.objects.filter(cnpj_empresa=empresa.cnpj))
            except Empresa.DoesNotExist:
                return SimplesNacional.objects.none()
        return _exclude_ignored_sync_files(super().get_queryset())

class OutrosViewSet(viewsets.ModelViewSet):
    queryset = Outros.objects.all()
    serializer_class = OutrosSerializer

    def get_queryset(self):
        empresa_id = self.kwargs.get('empresa_id') or self.request.query_params.get('empresa_id')
        if empresa_id:
            try:
                empresa = Empresa.objects.get(id=empresa_id)
                return _exclude_ignored_sync_files(Outros.objects.filter(nome_empresa=empresa.nome))
            except Empresa.DoesNotExist:
                return Outros.objects.none()
        return _exclude_ignored_sync_files(super().get_queryset())

class HistoricoEnviosViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = HistoricoEnvios.objects.all()
    serializer_class = HistoricoEnviosSerializer
    filter_backends = [DjangoFilterBackend] # Adicione esta linha
    filterset_class = HistoricoEnviosFilter   # Adicione esta linha


class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all().order_by('nome')
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return visible_tags_for_request(self.request).order_by('nome', 'cargo', 'id')

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        if getattr(request.user, 'cargo', None) == 'admin':
            serializer = self.get_serializer(unique_tags_by_name(queryset), many=True)
            return Response(serializer.data)
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(cargo=getattr(self.request.user, 'cargo', 'pessoal') or 'pessoal')

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if getattr(request.user, 'cargo', None) == 'admin':
            Tag.objects.filter(nome=instance.nome).delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        if getattr(request.user, 'cargo', None) != 'admin' and instance.cargo != getattr(request.user, 'cargo', None):
            return Response(
                {'error': 'Você só pode excluir tags da sua própria função.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

class FuncionarioViewSet(viewsets.ModelViewSet):
    queryset = Funcionario.objects.prefetch_related('empresas_gerenciadas').all().order_by('first_name')
    serializer_class = FuncionarioSerializer
    permission_classes = [IsAdminUser]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            instance.groups.clear()
            instance.user_permissions.clear()
            instance.empresas_gerenciadas.clear()
            instance.usercompanyaccess.all().delete()
            self.perform_destroy(instance)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            logger.error(f"Erro ao excluir funcionário: {str(e)}")
            return Response({'error': f'Erro ao excluir usuário: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        
class PendenciaAPIView(APIView):
    def get(self, request):
        pendencias = Pendencia.objects.all()
        serializer = PendenciaSerializer(pendencias, many=True)
        return Response(serializer.data)

    def post(self, request):
        pendencias_data = request.data.get('pendencias', [])
        created_pendencias = []
        
        for pendencia_data in pendencias_data:
            empresa_id = pendencia_data.get('empresa', {}).get('id')
            tipo = pendencia_data.get('tipo')
            
            try:
                empresa = Empresa.objects.get(id=empresa_id)
                pendencia = Pendencia.objects.create(
                    empresa=empresa,
                    tipo=tipo
                )
                created_pendencias.append(PendenciaSerializer(pendencia).data)
            except Empresa.DoesNotExist:
                return Response(
                    {"error": f"Empresa com ID {empresa_id} não encontrada."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return Response(created_pendencias, status=status.HTTP_201_CREATED)


class BoletoBBViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = BoletoBBSerializer
    queryset = BoletoBB.objects.none()
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        # Importante: nao reutilizar `self.queryset` aqui.
        # Em DRF, um queryset avaliado pode ficar em cache no processo e servir
        # dados desatualizados ate o backend reiniciar.
        qs = BoletoBB.objects.select_related('empresa').order_by('-atualizado_em', '-criado_em')
        empresa_id = self.request.query_params.get('empresa_id')
        status_param = self.request.query_params.get('status')
        search = self.request.query_params.get('search')

        if empresa_id:
            qs = qs.filter(empresa_id=empresa_id)
        if status_param:
            qs = qs.filter(status=status_param)
        if search:
            digits = ''.join(ch for ch in search if ch.isdigit())
            qs = qs.filter(
                models.Q(numero_titulo_cliente__icontains=search) |
                models.Q(nosso_numero__icontains=search) |
                models.Q(linha_digitavel__icontains=digits) |
                models.Q(codigo_barra__icontains=digits) |
                models.Q(empresa__nome__icontains=search)
            )
        return qs

    @action(detail=False, methods=['post'], url_path='enviar-cobranca')
    def enviar_cobranca(self, request):
        boleto_ids = request.data.get('boleto_ids') or []
        if not isinstance(boleto_ids, list) or not boleto_ids:
            return Response(
                {'error': 'Envie uma lista de boleto_ids para cobrar.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        hoje = timezone.localdate()
        periodo_vencimento = str(request.data.get('periodo_vencimento') or '').strip()

        if periodo_vencimento:
            try:
                inicio_mes = datetime.datetime.strptime(periodo_vencimento, '%Y-%m').date().replace(day=1)
            except ValueError:
                return Response(
                    {'error': 'Envie periodo_vencimento no formato YYYY-MM.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            inicio_mes = hoje.replace(day=1)

        fim_periodo = min(inicio_mes + relativedelta(months=1), hoje)
        boletos = (
            self.get_queryset()
            .filter(
                id__in=boleto_ids,
                status='registrado',
                data_vencimento__gte=inicio_mes,
                data_vencimento__lt=fim_periodo,
            )
            .select_related('empresa')
        )
        boletos_by_id = {boleto.id: boleto for boleto in boletos}
        ordered_boletos = [boletos_by_id.get(int(boleto_id)) for boleto_id in boleto_ids if str(boleto_id).isdigit()]
        ordered_boletos = [boleto for boleto in ordered_boletos if boleto]

        if not ordered_boletos:
            return Response(
                {'error': 'Nenhum boleto vencido em aberto foi encontrado para cobrança.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []
        success_count = 0
        failed_count = 0

        for boleto in ordered_boletos:
            empresa = boleto.empresa
            recipient_number = _normalize_whatsapp_number(empresa.telefone)

            if not recipient_number:
                erro = 'Empresa sem telefone configurado para envio de cobrança pelo WhatsApp.'
                HistoricoEnvios.objects.create(
                    remetente='',
                    arquivo='honorario_cobranca',
                    status='falha',
                    usuario=request.user,
                    erro=erro,
                    empresa=empresa,
                )
                failed_count += 1
                results.append({
                    'boleto_id': boleto.id,
                    'empresa_id': empresa.id,
                    'empresa_nome': empresa.nome,
                    'status': 'falha',
                    'error': erro,
                })
                continue

            _, caminho_honorario, origem_honorario = (
                buscar_boleto_honorario_para_cobranca(empresa, boleto)
            )

            if not caminho_honorario:
                erro = (
                    'Boleto HONORARIO não encontrado nas pastas HONORARIOS '
                    'ou DEPARTAMENTO PESSOAL da empresa para envio da cobrança.'
                )
                HistoricoEnvios.objects.create(
                    remetente=recipient_number,
                    arquivo='honorario_cobranca',
                    status='falha',
                    usuario=request.user,
                    erro=erro,
                    empresa=empresa,
                )
                failed_count += 1
                results.append({
                    'boleto_id': boleto.id,
                    'empresa_id': empresa.id,
                    'empresa_nome': empresa.nome,
                    'status': 'falha',
                    'error': erro,
                    'recipient_number': recipient_number,
                })
                continue

            nome_arquivo = sanitize_filename_for_upload(
                f"honorario_cobranca_{empresa.nome}.pdf"
            ).lower()
            try:
                media_id, _ = upload_media_to_whatsapp(
                    caminho_honorario,
                    nome_arquivo,
                )
            except Exception as exc:
                logger.exception(
                    "Erro ao abrir ou enviar boleto de honorario para o WhatsApp. "
                    f"Empresa={empresa.nome}, caminho={caminho_honorario}"
                )
                media_id = None
                upload_exception = str(exc)
            else:
                upload_exception = None

            if not media_id:
                erro = 'Falha ao fazer upload do boleto para cobrança no WhatsApp.'
                if upload_exception:
                    erro = f'{erro} Detalhe: {upload_exception}'
                HistoricoEnvios.objects.create(
                    remetente=recipient_number,
                    arquivo=nome_arquivo,
                    status='falha',
                    usuario=request.user,
                    erro=erro,
                    empresa=empresa,
                )
                failed_count += 1
                results.append({
                    'boleto_id': boleto.id,
                    'empresa_id': empresa.id,
                    'empresa_nome': empresa.nome,
                    'status': 'falha',
                    'error': erro,
                })
                continue

            message_id, error_sending = send_whatsapp_document_template_message(
                recipient_number=recipient_number,
                document_media_id=media_id,
                document_filename=nome_arquivo,
                template_name='honorario_cobranca',
                template_params={},
                company_name=empresa.nome,
            )

            if message_id:
                HistoricoEnvios.objects.create(
                    remetente=recipient_number,
                    arquivo=nome_arquivo,
                    status='sucesso',
                    message_id=message_id,
                    usuario=request.user,
                    empresa=empresa,
                )
                success_count += 1
                results.append({
                    'boleto_id': boleto.id,
                    'empresa_id': empresa.id,
                    'empresa_nome': empresa.nome,
                    'status': 'sucesso',
                    'message_id': message_id,
                    'recipient_number': recipient_number,
                    'origem_arquivo': origem_honorario,
                })
            else:
                HistoricoEnvios.objects.create(
                    remetente=recipient_number,
                    arquivo=nome_arquivo,
                    status='falha',
                    usuario=request.user,
                    erro=error_sending,
                    empresa=empresa,
                )
                failed_count += 1
                results.append({
                    'boleto_id': boleto.id,
                    'empresa_id': empresa.id,
                    'empresa_nome': empresa.nome,
                    'status': 'falha',
                    'error': error_sending,
                    'recipient_number': recipient_number,
                })

        response_status = status.HTTP_200_OK if success_count else status.HTTP_400_BAD_REQUEST
        return Response({
            'success_count': success_count,
            'failed_count': failed_count,
            'results': results,
        }, status=response_status)

    @action(detail=False, methods=['get'], url_path='relatorio-em-aberto')
    def relatorio_em_aberto(self, request):
        hoje = timezone.localdate()
        periodo_vencimento = str(request.query_params.get('periodo_vencimento') or '').strip()
        ano_param = str(request.query_params.get('ano') or '').strip()
        mes_param = str(request.query_params.get('mes') or '').strip().zfill(2)

        if not periodo_vencimento and ano_param and mes_param:
            periodo_vencimento = f'{ano_param}-{mes_param}'

        if periodo_vencimento:
            try:
                inicio_mes = datetime.datetime.strptime(periodo_vencimento, '%Y-%m').date().replace(day=1)
            except ValueError:
                return Response(
                    {'error': 'Envie periodo_vencimento no formato YYYY-MM.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            inicio_mes = hoje.replace(day=1)

        fim_periodo = min(inicio_mes + relativedelta(months=1), hoje)

        boletos = (
            self.get_queryset()
            .filter(
                status='registrado',
                data_vencimento__gte=inicio_mes,
                data_vencimento__lt=fim_periodo,
            )
            .select_related('empresa')
            .order_by('empresa__nome', 'data_vencimento', 'numero_titulo_cliente')
        )

        headers = [
            'Empresa',
            'CNPJ',
            'Data de vencimento',
            'Dias em atraso',
            'Valor original',
            'Valor pago',
            'Telefone',
        ]

        rows = []
        total = Decimal('0.00')
        for boleto in boletos:
            empresa = boleto.empresa
            dias_atraso = (hoje - boleto.data_vencimento).days if boleto.data_vencimento else ''
            total += boleto.valor_original or Decimal('0.00')
            rows.append([
                empresa.nome,
                empresa.cnpj,
                boleto.data_vencimento.strftime('%d/%m/%Y') if boleto.data_vencimento else '',
                dias_atraso,
                boleto.valor_original or Decimal('0.00'),
                boleto.valor_pago or '',
                empresa.telefone or '',
            ])

        rows.append([
            'TOTAL',
            '',
            '',
            '',
            total,
            '',
            f'{boletos.count()} boleto(s)',
        ])

        workbook = _build_xlsx_file(
            'Boletos em aberto',
            headers,
            rows,
            column_widths={
                1: 36,
                2: 20,
                3: 18,
                4: 16,
                5: 16,
                6: 16,
                7: 18,
            },
        )
        filename = f"relatorio_boletos_em_aberto_{inicio_mes.strftime('%Y_%m')}.xlsx"
        response = HttpResponse(
            workbook.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def partial_update(self, request, *args, **kwargs):
        boleto = self.get_object()
        allowed_fields = {'status', 'data_pagamento', 'valor_pago'}
        payload = {key: value for key, value in request.data.items() if key in allowed_fields}

        if not payload:
            return Response(
                {'error': 'Envie ao menos um destes campos: status, data_pagamento ou valor_pago.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        next_status = payload.get('status', boleto.status)
        valid_statuses = {choice[0] for choice in BoletoBB.STATUS_CHOICES}
        if next_status not in valid_statuses:
            return Response({'error': 'Status de boleto inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        if payload.get('status') == 'pago':
            payload.setdefault('data_pagamento', boleto.data_pagamento or timezone.localdate())
            payload.setdefault('valor_pago', boleto.valor_pago or boleto.valor_original)
        elif payload.get('status') and payload.get('status') != 'pago':
            payload.setdefault('data_pagamento', None)
            payload.setdefault('valor_pago', None)

        serializer = self.get_serializer(boleto, data=payload, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

class NotificacaoViewSet(viewsets.ModelViewSet):
    serializer_class = NotificacaoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        Esta é a correção principal: Esta função garante que o usuário logado
        veja APENAS as suas próprias notificações.
        """
        return self.request.user.notificacoes.all()

    @action(detail=False, methods=['post'])
    def marcar_todas_como_lidas(self, request):
        """Ação customizada para excluir todas as notificações do usuário."""
        request.user.notificacoes.all().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['POST'])
def enviar_email(request):
    try:
        empresa_id = int(request.data.get('empresa_id'))
        tipo_pasta = request.data.get('tipo_pasta')
        file_ids = request.data.get('file_ids', [])

        logger.info(f"Requisição recebida: empresa_id={empresa_id}, tipo_pasta={tipo_pasta}, file_ids={file_ids}")

        if not empresa_id or not tipo_pasta or not file_ids:
            return Response({'error': 'Faltam parâmetros: empresa_id, tipo_pasta ou file_ids.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            empresa = Empresa.objects.get(id=empresa_id)
            nome_empresa = empresa.nome
            email_destinatario = empresa.email
            if not email_destinatario:
                return Response({'error': f'Email não cadastrado para a empresa ID {empresa_id}.'}, status=status.HTTP_400_BAD_REQUEST)
        except Empresa.DoesNotExist:
            return Response({'error': f'Empresa com ID {empresa_id} não encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        modelos = {
            'documentos_constitutivos': (DocumentosConstitutivos, 'nome_empresa'),
            'departamento_pessoal': (DepartamentoPessoal, 'cnpj_empresa'),
            'xml': (XML, 'cnpj_empresa'),
            'simples_nacional': (SimplesNacional, 'cnpj_empresa'),
            'outros': (Outros, 'nome_empresa'), 
        }

        if tipo_pasta not in modelos:
            return Response({'error': f'Tipo de pasta inválido: {tipo_pasta}.'}, status=status.HTTP_400_BAD_REQUEST)

        modelo, campo_empresa = modelos[tipo_pasta]
        if campo_empresa == 'nome_empresa':
            arquivos = modelo.objects.filter(id__in=file_ids, nome_empresa=nome_empresa)
        else:
            arquivos = modelo.objects.filter(id__in=file_ids, cnpj_empresa=empresa.cnpj)

        logger.info(f"Arquivos encontrados: {list(arquivos.values('id', 'nome_arquivo', 'nome_empresa'))}")

        if not arquivos.exists():
            return Response({'error': 'Nenhum arquivo encontrado para os IDs fornecidos.'}, status=status.HTTP_404_NOT_FOUND)

        # Verificar tamanho total dos arquivos
        total_size = 0
        caminhos_arquivos = []
        nomes_arquivos = []
        for arquivo in arquivos:
            caminho_arquivo = arquivo.caminho_arquivo.path  # Caminho absoluto no servidor
            if os.path.exists(caminho_arquivo):
                total_size += os.path.getsize(caminho_arquivo)
                caminhos_arquivos.append(caminho_arquivo)
                nomes_arquivos.append(arquivo.nome_arquivo)
            else:
                logger.warning(f"Arquivo não encontrado no servidor: {caminho_arquivo}")

        if total_size > 20 * 1024 * 1024:  # 20 MB
            return Response({'error': 'O tamanho total dos arquivos excede 20 MB.'}, status=status.HTTP_400_BAD_REQUEST)

        # Preparar o email
        msg = MIMEMultipart()
        msg['From'] = settings.EMAIL_REMETENTE
        msg['To'] = email_destinatario
        msg['Subject'] = f"Envio de Documentos - {empresa.nome}"
        msg['Date'] = formatdate(localtime=True)

        body = f"Prezado(a),\n\nSegue(m) em anexo o(s) arquivo(s) da empresa {empresa.nome}:\n"
        for nome_arquivo in nomes_arquivos:
            body += f"- {nome_arquivo}\n"
        body += "\nAtenciosamente, Inovar Contabilidade"
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        # Anexar os arquivos
        for caminho_arquivo, nome_arquivo in zip(caminhos_arquivos, nomes_arquivos):
            extensao = os.path.splitext(nome_arquivo)[1].lower()
            content_types = {
                '.pdf': 'application/pdf',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.xls': 'application/vnd.ms-excel',
                '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
            }
            content_type = content_types.get(extensao, 'application/octet-stream')

            nome_arquivo_simples = unidecode.unidecode(nome_arquivo).replace(' ', '_').replace('"', '')
            nome_arquivo_codificado = urllib.parse.quote(nome_arquivo)

            part = MIMEBase(*content_type.split('/', 1))
            with open(caminho_arquivo, 'rb') as attachment:
                part.set_payload(attachment.read())
            encoders.encode_base64(part)
            part.add_header('Content-Disposition', f'attachment; filename="{nome_arquivo_simples}"')
            part.add_header('Content-Disposition', f'attachment; filename*=UTF-8\'\'{nome_arquivo_codificado}')
            part.add_header('Content-Transfer-Encoding', 'base64')
            msg.attach(part)

        # Enviar o email
        dominio = settings.EMAIL_REMETENTE.split('@')[1].lower()
        if dominio == 'gmail.com':
            smtp_server = 'smtp.gmail.com'
            smtp_port = 587
        elif dominio in ['hotmail.com', 'outlook.com']:
            smtp_server = 'smtp-mail.outlook.com'
            smtp_port = 587
        elif dominio == 'yahoo.com':
            smtp_server = 'smtp.mail.yahoo.com'
            smtp_port = 587
        else:
            return Response({'error': f'Provedor de email {dominio} não suportado.'}, status=status.HTTP_400_BAD_REQUEST)

        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(settings.EMAIL_REMETENTE, settings.EMAIL_SENHA_APP)
        server.sendmail(settings.EMAIL_REMETENTE, email_destinatario, msg.as_string())
        server.quit()

        return Response({'message': f'Email enviado com sucesso para {email_destinatario}.'}, status=status.HTTP_200_OK)

    except smtplib.SMTPAuthenticationError:
        logger.error("Erro de autenticação no envio de email: Credenciais inválidas.")
        return Response({'error': 'Erro de autenticação: Credenciais de email inválidas.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        logger.error(f"Erro ao enviar email: {str(e)}")
        return Response({'error': f'Erro ao enviar email: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
@api_view(['POST'])
def sincronizar_pasta_empresa_api(request):
    empresa_id = request.data.get('empresa_id')
    tipo_pasta_sync = request.data.get('tipo_pasta')

    if not empresa_id or not tipo_pasta_sync:
        return Response({"error": "empresa_id e tipo_pasta são obrigatórios."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        empresa = Empresa.objects.get(id=empresa_id)
    except Empresa.DoesNotExist:
        return Response({"error": "Empresa não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    if tipo_pasta_sync not in MODEL_CONFIG_MAP_SYNC:
        return Response({"error": f"Tipo de pasta '{tipo_pasta_sync}' não suportado para sincronização."}, status=status.HTTP_400_BAD_REQUEST)

    config = MODEL_CONFIG_MAP_SYNC[tipo_pasta_sync]
    DocumentModel = config['model']
    DocumentSerializer = config['serializer']
    
    # USA A SUA FUNÇÃO DO UTILS.PY PARA O NOME DA PASTA DA EMPRESA
    company_folder_name_on_fs = gerar_nome_pasta_empresa_padronizado(empresa.nome)
    fs_doc_type_folder_name = config['fs_folder_name']
    company_folder_path_on_fs, company_folder_name_on_fs, company_folder_matched_by_normalization = _resolve_existing_child_folder(
        settings.MEDIA_ROOT,
        company_folder_name_on_fs,
    )
    if tipo_pasta_sync == 'outros':
        _rename_legacy_child_folder(company_folder_path_on_fs, 'OUTROS', fs_doc_type_folder_name)

    base_doc_type_path_on_fs, fs_doc_type_folder_name, doc_folder_matched_by_normalization = _resolve_existing_child_folder(
        company_folder_path_on_fs,
        fs_doc_type_folder_name,
    )

    if not os.path.isdir(base_doc_type_path_on_fs):
        try: # Tenta criar a estrutura base se não existir (o sinal deveria ter feito, mas como garantia)
            os.makedirs(base_doc_type_path_on_fs, exist_ok=True)
            logger.info(f"SYNC: Criado diretório base do tipo de documento que faltava: {base_doc_type_path_on_fs}")
            if config['has_year_month']:
                ano_atual_str = str(datetime.date.today().year)
                caminho_pasta_ano = os.path.join(base_doc_type_path_on_fs, ano_atual_str)
                os.makedirs(caminho_pasta_ano, exist_ok=True)
                for numero_mes in range(1, 13):
                    mes_formatado_str = f"{numero_mes:02d}"
                    nome_pasta_mes_ano = f"{mes_formatado_str}{ano_atual_str}"
                    caminho_pasta_mes_ano = os.path.join(caminho_pasta_ano, nome_pasta_mes_ano)
                    os.makedirs(caminho_pasta_mes_ano, exist_ok=True)
        except Exception as e_mkdir:
            logger.error(f"SYNC: Erro crítico ao tentar criar estrutura de pasta para {base_doc_type_path_on_fs}: {e_mkdir}")
            return Response({"error": f"Não foi possível acessar ou criar a pasta de destino no servidor: {base_doc_type_path_on_fs}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # 1. Obter todos os arquivos do banco de dados
    db_files_map = {} 
    # Usa o nome da empresa para filtrar, pois os modelos de documento devem ter `nome_empresa`
    # Se alguns usam cnpj_empresa para filtro, o MODEL_CONFIG_MAP_SYNC precisaria ser ajustado.
    # Assumindo que todos os documentos podem ser filtrados por empresa.nome se 'nome_empresa' está neles.
    # Ou, se você adicionou um FK empresa aos modelos de doc: DocumentModel.objects.filter(empresa=empresa)
    company_filter_key_for_doc = config['company_field_name_in_doc_model']
    company_value_for_doc_filter = getattr(empresa, config['company_attr_in_empresa_model'])
    db_queryset = DocumentModel.objects.filter(**{company_filter_key_for_doc: company_value_for_doc_filter})
    # Se alguns usam cnpj_empresa, a lógica de filtro precisa ser mais dinâmica baseada no config:
    # company_filter_key_for_doc = config['company_field_name_in_doc_model']
    # company_value_for_doc_filter = getattr(empresa, config['company_attr_in_empresa_model']) # ex: empresa.nome ou empresa.cnpj
    # db_queryset = DocumentModel.objects.filter(**{company_filter_key_for_doc: company_value_for_doc_filter})

    for doc_instance in db_queryset:
        if _is_ignored_sync_file(doc_instance.nome_arquivo):
            try:
                doc_instance.delete()
                logger.info(f"SYNC: Removido arquivo de sistema cadastrado por engano: {doc_instance.nome_arquivo}")
            except Exception as e_delete_ignored:
                logger.error(f"SYNC: Erro ao remover arquivo de sistema {doc_instance.nome_arquivo}: {e_delete_ignored}")
            continue

        if doc_instance.caminho_arquivo and doc_instance.caminho_arquivo.name:
            db_path_normalized = doc_instance.caminho_arquivo.name.replace('\\', '/')
            db_files_map[db_path_normalized] = doc_instance

    # 2. Varrer o sistema de arquivos
    found_fs_files_normalized_paths = set()
    updated_existing_doc_ids = set()
    found_month_counts = {}
    files_without_period = 0
    scan_errors = []
    create_errors = []
    added_count = 0
    
    scan_paths = []
    if config['has_year_month']:
        if os.path.exists(base_doc_type_path_on_fs):
            def register_walk_error(error):
                scan_errors.append(str(error))
                logger.error(f"SYNC: Erro ao acessar pasta durante varredura: {error}")

            for current_dir, _, filenames in os.walk(base_doc_type_path_on_fs, onerror=register_walk_error):
                if not filenames:
                    continue

                relative_dir = os.path.relpath(current_dir, base_doc_type_path_on_fs)
                relative_dir_parts = [] if relative_dir == '.' else relative_dir.split(os.sep)
                detected_year, detected_month = _extract_year_month_from_relative_parts(relative_dir_parts)

                if detected_year and detected_month:
                    scan_paths.append({
                        "path": current_dir,
                        "year": detected_year,
                        "month": detected_month,
                        "relative_dir_parts": relative_dir_parts,
                        "sub_path_parts": [company_folder_name_on_fs, fs_doc_type_folder_name] + relative_dir_parts
                    })
                else:
                    scan_paths.append({
                        "path": current_dir,
                        "year": None,
                        "month": None,
                        "relative_dir_parts": relative_dir_parts,
                        "sub_path_parts": [company_folder_name_on_fs, fs_doc_type_folder_name] + relative_dir_parts
                    })
    else: # Pastas sem estrutura de ano/mês
        if os.path.exists(base_doc_type_path_on_fs):
            scan_paths.append({
                "path": base_doc_type_path_on_fs, 
                "year": None, 
                "month": None,
                "sub_path_parts": [company_folder_name_on_fs, fs_doc_type_folder_name]
            })

    for item_to_scan in scan_paths:
        current_scan_path = item_to_scan["path"]
        try:
            filenames_to_scan = os.listdir(current_scan_path)
        except OSError as exc:
            scan_errors.append(str(exc))
            logger.error(f"SYNC: Erro ao listar arquivos em {current_scan_path}: {exc}")
            continue

        for filename_raw_from_fs in filenames_to_scan:
            if os.path.isfile(os.path.join(current_scan_path, filename_raw_from_fs)):
                if _is_ignored_sync_file(filename_raw_from_fs):
                    logger.info(f"SYNC: Ignorando arquivo de sistema: {os.path.join(current_scan_path, filename_raw_from_fs)}")
                    continue

                try:
                    filename_from_fs = _ensure_sync_safe_filename(current_scan_path, filename_raw_from_fs)
                except OSError as exc:
                    scan_errors.append(str(exc))
                    logger.error(f"SYNC: Erro ao normalizar nome de arquivo {os.path.join(current_scan_path, filename_raw_from_fs)}: {exc}")
                    continue

                if config['has_year_month'] and (not item_to_scan["year"] or not item_to_scan["month"]):
                    detected_year, detected_month = _extract_year_month_from_relative_parts(item_to_scan.get("relative_dir_parts", []) + [filename_from_fs])
                    if not detected_year or not detected_month:
                        files_without_period += 1
                        logger.warning(f"SYNC: Arquivo ignorado sem mes/ano identificavel: {os.path.join(current_scan_path, filename_from_fs)}")
                        continue
                    item_year = detected_year
                    item_month = detected_month
                else:
                    item_year = item_to_scan["year"]
                    item_month = item_to_scan["month"]

                path_parts = item_to_scan["sub_path_parts"] + [filename_from_fs]
                normalized_fs_path = _relative_media_path(*path_parts)
                found_fs_files_normalized_paths.add(normalized_fs_path)
                if item_year and item_month:
                    found_month_counts[(item_year, item_month)] = found_month_counts.get((item_year, item_month), 0) + 1

                if normalized_fs_path not in db_files_map:
                    try:
                        doc_data = {
                            'nome_empresa': empresa.nome, # Todos os modelos de documento agora devem ter nome_empresa
                            'nome_arquivo': filename_from_fs,
                            'tipo_documento': tipo_pasta_sync.replace("_", "-"), 
                            'caminho_arquivo': normalized_fs_path
                        }
                        if config['has_year_month']:
                            doc_data['ano'] = item_year
                            doc_data['mes'] = item_month
                        if 'entregue' in [f.name for f in DocumentModel._meta.get_fields()]: # Checa se o campo existe
                            doc_data['entregue'] = False 
                        if 'cnpj_empresa' in [f.name for f in DocumentModel._meta.get_fields()]:
                            doc_data['cnpj_empresa'] = empresa.cnpj

                        existing_lookup = {
                            company_filter_key_for_doc: company_value_for_doc_filter,
                            'nome_arquivo': filename_from_fs,
                            'tipo_documento': tipo_pasta_sync.replace("_", "-"),
                        }
                        if config['has_year_month']:
                            existing_lookup['ano'] = item_year
                            existing_lookup['mes'] = item_month

                        existing_doc = DocumentModel.objects.filter(**existing_lookup).first()
                        if existing_doc:
                            existing_doc.caminho_arquivo = normalized_fs_path
                            if hasattr(existing_doc, 'nome_empresa'):
                                existing_doc.nome_empresa = empresa.nome
                            if hasattr(existing_doc, 'cnpj_empresa'):
                                existing_doc.cnpj_empresa = empresa.cnpj
                            existing_doc.save()
                            db_files_map[normalized_fs_path] = existing_doc
                            updated_existing_doc_ids.add(existing_doc.id)
                            logger.info(f"SYNC: Caminho atualizado no DB: {normalized_fs_path}")
                        else:
                            DocumentModel.objects.create(**doc_data)
                            added_count += 1
                            logger.info(f"SYNC: Adicionado ao DB: {normalized_fs_path}")
                    except Exception as e_create:
                        logger.error(f"SYNC: Erro ao criar registro no DB para {normalized_fs_path}: {e_create} com dados {doc_data}")
                        create_errors.append({
                            "arquivo": filename_from_fs,
                            "caminho": normalized_fs_path,
                            "erro": str(e_create),
                        })


    # 3. Remover do DB arquivos que não estão mais no FS
    removed_count = 0
    for db_path_normalized, db_instance in db_files_map.items():
        if db_instance.id in updated_existing_doc_ids:
            continue
        if db_path_normalized not in found_fs_files_normalized_paths:
            # Dupla checagem no sistema de arquivos antes de deletar do DB
            full_physical_path_check = os.path.join(settings.MEDIA_ROOT, db_path_normalized.replace('/', os.sep))
            if not os.path.exists(full_physical_path_check):
                try:
                    db_instance.delete()
                    removed_count += 1
                    logger.info(f"SYNC: Removido do DB (arquivo físico também não encontrado): {db_path_normalized}")
                except Exception as e_delete:
                    logger.error(f"SYNC: Erro ao remover registro do DB para {db_path_normalized}: {e_delete}")
            else:
                logger.warning(f"SYNC: Arquivo {db_path_normalized} está no DB e no FS, mas não foi listado pela varredura. Não removido.")

    # 4. Retornar a lista atualizada
    # Recarrega o queryset após as modificações
    db_queryset_updated = DocumentModel.objects.filter(**{company_filter_key_for_doc: company_value_for_doc_filter})
    # ... (lógica de filtro de company_filter_key_for_doc como acima, se necessário) ...

    serializer = DocumentSerializer(db_queryset_updated, many=True)
    
    month_summary = _format_sync_month_summary(found_month_counts)
    return Response({
        "message": f"Sincronização da pasta '{config['fs_folder_name']}' concluída. "
                   f"{added_count} arquivo(s) adicionado(s), {removed_count} registro(s) removido(s) do banco. "
                   f"Arquivos encontrados por competencia: {month_summary}. "
                   f"Sem competencia identificada: {files_without_period}. "
                   f"Erros ao cadastrar: {len(create_errors)}. Erros ao ler pastas: {len(scan_errors)}.",
        "data": serializer.data,
        "base_path": base_doc_type_path_on_fs,
        "company_folder_matched_by_normalization": company_folder_matched_by_normalization,
        "doc_folder_matched_by_normalization": doc_folder_matched_by_normalization,
        "month_counts": [
            {"ano": year, "mes": month, "quantidade": count}
            for (year, month), count in sorted(found_month_counts.items())
        ],
        "files_without_period": files_without_period,
        "create_errors": create_errors[:20],
        "scan_errors": scan_errors[:20],
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
def enviar_documentos_whatsapp_api(request):
    empresa_id = request.data.get('empresa_id')
    file_ids = request.data.get('file_ids')
    tipo_pasta = request.data.get('tipo_pasta')

    if not all([empresa_id, file_ids, tipo_pasta]):
        return JsonResponse(
            {"error": "Parâmetros faltando: empresa_id, file_ids e tipo_pasta são obrigatórios."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if tipo_pasta == 'xml':
        return JsonResponse({"error": "Envio de arquivos XML por WhatsApp não é suportado."}, status=status.HTTP_400_BAD_REQUEST)

    if tipo_pasta not in MODEL_CONFIG_MAP:
        return JsonResponse({"error": f"Tipo de pasta '{tipo_pasta}' não suportado para envio por WhatsApp."}, status=status.HTTP_400_BAD_REQUEST)

    config = MODEL_CONFIG_MAP[tipo_pasta]
    DocumentModel = config['model']
    whatsapp_template_to_use = config['whatsapp_template_name']  # Pega o nome do template do config

    try:
        empresa = Empresa.objects.get(id=empresa_id)
    except Empresa.DoesNotExist:
        return JsonResponse({"error": "Empresa não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    raw_phone_number = empresa.telefone
    if not raw_phone_number:
        logger.warning(f"Empresa {empresa.nome} (ID: {empresa_id}) não possui telefone cadastrado.")
        return JsonResponse({"error": "Telefone não cadastrado para esta empresa."}, status=status.HTTP_400_BAD_REQUEST)

    recipient_whatsapp_number = re.sub(r'\D', '', raw_phone_number)
    if not (len(recipient_whatsapp_number) >= 10 and len(recipient_whatsapp_number) <= 13 and recipient_whatsapp_number.isdigit()):
        return JsonResponse({"error": f"O número de telefone '{raw_phone_number}' cadastrado para a empresa não é válido para WhatsApp."}, status=status.HTTP_400_BAD_REQUEST)
    if not recipient_whatsapp_number.startswith('55') and len(recipient_whatsapp_number) in [10, 11]:
        recipient_whatsapp_number = '55' + recipient_whatsapp_number
    elif not recipient_whatsapp_number.startswith('55'):
        return JsonResponse({"error": f"O DDI (ex: 55 para Brasil) parece estar faltando no número de telefone '{raw_phone_number}'."}, status=status.HTTP_400_BAD_REQUEST)

    logger.info(f"Número de WhatsApp a ser utilizado para {empresa.nome}: {recipient_whatsapp_number}")

    filter_kwargs = {'id__in': file_ids}
    filter_kwargs[config['company_field_name']] = getattr(empresa, config['company_attr'])
    documentos_qs = DocumentModel.objects.filter(**filter_kwargs)

    if not documentos_qs.exists():
        return JsonResponse(
            {"error": f"Nenhum documento válido do tipo '{tipo_pasta}' encontrado para os IDs e empresa fornecidos."},
            status=status.HTTP_404_NOT_FOUND
        )

    files_sent_count = 0
    successful_sends = []
    failed_sends = []

    for doc in documentos_qs:
        if not doc.caminho_arquivo or not hasattr(doc.caminho_arquivo, 'path'):
            logger.warning(f"Documento ID {doc.id} ({doc.nome_arquivo}) não tem um caminho de arquivo válido.")
            failed_sends.append({"filename": doc.nome_arquivo, "reason": "Caminho do arquivo inválido."})
            continue
        
        file_path_on_server = _resolve_document_file_path(doc, empresa, tipo_pasta)

        if not file_path_on_server or not os.path.exists(file_path_on_server):
            logger.error(f"Arquivo FÍSICO não encontrado para ID {doc.id}: {doc.nome_arquivo}")
            failed_sends.append({"filename": doc.nome_arquivo, "reason": "Arquivo físico não encontrado no servidor."})
            continue
        original_filename = doc.nome_arquivo
        logger.info(f"Processando envio para WhatsApp: {original_filename} para {recipient_whatsapp_number} (Empresa: {empresa.nome}) usando template: {whatsapp_template_to_use}")

        media_id, _ = upload_media_to_whatsapp(file_path_on_server, original_filename)

        if not media_id:
            logger.error(f"Falha ao fazer upload da mídia para {original_filename}.")
            failed_sends.append({"filename": original_filename, "reason": "Falha no upload da mídia."})
            continue

        # Construir template_params dinamicamente com base no template
        template_params = {}
        if whatsapp_template_to_use == "enviar_documento_com_contato":
            # Forçar os valores diretamente no payload via mapeamento, sem depender de template_params
            pass
        elif whatsapp_template_to_use in ["enviar_sn", "enviar_dp"]:
            data_mes_atual = timezone.now().replace(day=1)
            data_mes_anterior = data_mes_atual - relativedelta(months=1)
            mes_passado = data_mes_anterior.strftime('%B/%Y')  # Ex.: "Agosto/2025"
            template_params = {"period_month": mes_passado}

        # Chama a função com os parâmetros ajustados
        message_id, error_sending = send_whatsapp_document_template_message(
            recipient_number=recipient_whatsapp_number,
            document_media_id=media_id,
            document_filename=original_filename,
            template_name=whatsapp_template_to_use,
            template_params=template_params,
            company_name=empresa.nome,
        )

        if message_id:
            status_envio = 'sucesso'
            successful_sends.append({"filename": original_filename, "message_id": message_id})
            files_sent_count += 1
            if tipo_pasta == 'simples_nacional':
                try:
                    ano_do_arquivo = doc.ano or timezone.now().year
                    mes_do_arquivo = doc.mes or timezone.now().month
                    periodo_date = timezone.datetime(int(ano_do_arquivo), int(mes_do_arquivo), 1).date()

                    ObrigacaoMensal.objects.filter(
                        empresa=empresa,
                        tipo='simples_nacional',
                        periodo_apuracao=periodo_date
                    ).update(status='enviado', data_envio=timezone.now(), responsavel_envio=request.user)
                    
                    logger.info(f"Status da Obrigação 'Simples Nacional' para {empresa.nome} ({periodo_date.strftime('%m/%Y')}) atualizado para 'Enviado'.")

                except Exception as e:
                    logger.error(f"Falha ao atualizar status da obrigação para {empresa.nome}: {e}")
        else:
            status_envio = 'falha'
            failed_sends.append({"filename": original_filename, "reason": f"Falha ao enviar template: {error_sending}"})

        # Criar o registro no HistoricoEnvios com a empresa associada
        HistoricoEnvios.objects.create(
            remetente=recipient_whatsapp_number,
            arquivo=original_filename,
            status=status_envio,
            message_id=message_id,  # Será None se houver falha
            empresa=empresa  # Adicionar o campo empresa
        )

    final_status = status.HTTP_200_OK
    if files_sent_count == 0 and documentos_qs.exists(): 
        if failed_sends:  # Se houve tentativas mas todas falharam
            final_status = status.HTTP_400_BAD_REQUEST
        elif not failed_sends:  # Se nenhum foi enviado e não há falhas (caso estranho)
            final_status = status.HTTP_400_BAD_REQUEST

    return JsonResponse({
        "message": f"{files_sent_count} de {documentos_qs.count()} documento(s) processado(s).",
        "successful_sends": successful_sends,
        "failed_sends": failed_sends
    }, status=final_status)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def gerar_das_api(request):
    """View para a página 'Gerar DAS'."""
    cnpj = request.data.get('cnpj')
    periodo = request.data.get('periodo')

    if not cnpj or not periodo:
        return Response({"error": "CNPJ e Período (YYYYMM) são obrigatórios."}, status=status.HTTP_400_BAD_REQUEST)
    
    # A lógica foi movida para o service.py
    resultado = gerar_das_serpro(cnpj_empresa=cnpj, periodo_apuracao=periodo)
    
    if resultado.get("sucesso"):
        pdf_content = resultado.get("pdf_content")
        filename = resultado.get("filename", "DAS.pdf")
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    else:
        return Response(
            {"error": resultado.get("erro"), "detalhes": resultado.get("detalhes")},
            status=status.HTTP_400_BAD_REQUEST
        )
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def download_extrato_pdf_api(request):
    cnpj = request.data.get('cnpj')
    numero_das = request.data.get('numero_das')

    if not cnpj or not numero_das:
        return Response({"error": "CNPJ e numero_das são obrigatórios."}, status=status.HTTP_400_BAD_REQUEST)

    # A view agora só precisa chamar a função de serviço, sem se preocupar com tokens.
    resultado = obter_extrato_pdf_serpro(cnpj_empresa=cnpj, numero_das=numero_das)

    if resultado.get("sucesso"):
        pdf_content = resultado.get("pdf_content")
        filename = resultado.get("filename", "Extrato.pdf")
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    else:
        return Response(
            {"error": resultado.get("erro"), "detalhes": resultado.get("detalhes")},
            status=status.HTTP_400_BAD_REQUEST
        )
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def consultar_extrato_api(request):
    cnpj = request.data.get('cnpj')
    periodo = request.data.get('periodo') # Esperado no formato "YYYYMM"

    if not cnpj or not periodo:
        return Response({"error": "CNPJ e Período (YYYYMM) são obrigatórios."}, status=status.HTTP_400_BAD_REQUEST)

    resultado = orquestrar_consulta_extrato(cnpj_empresa=cnpj, periodo_apuracao=periodo)

    if resultado.get("sucesso"):
        # Se funcionou, retorna o PDF para download
        pdf_content = resultado.get("pdf_content")
        filename = resultado.get("filename", "Extrato.pdf")
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    else:
        # Se falhou, retorna a mensagem de erro em JSON
        return Response(
            {"error": resultado.get("erro"), "detalhes": resultado.get("detalhes")},
            status=status.HTTP_400_BAD_REQUEST
        )
    
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_summary_api(request):
    """
    Agrega e retorna os dados para o dashboard. Versão final com lógica simplificada e segura.
    """
    try:
        hoje = timezone.now().date()
        
        # --- KPIs ---
        total_clientes = Empresa.objects.filter(ativo=True).exclude(nome__exact='').count()
        
        # Filtramos tarefas pendentes com data de vencimento futura
        tarefas_pendentes_total = ObrigacaoMensal.objects.filter(
            status='pendente',
            data_vencimento__gte=hoje,
            empresa__ativo=True
        ).count()

        vencendo_em_7_dias = ObrigacaoMensal.objects.filter(
            status='pendente',
            data_vencimento__gte=hoje,
            data_vencimento__lte=hoje + timedelta(days=7),
            empresa__ativo=True
        ).count()

        # --- Próximas Tarefas ---
        proximas_tarefas_qs = ObrigacaoMensal.objects.filter(
            status='pendente',
            data_vencimento__gte=hoje,
            empresa__ativo=True
        ).select_related('empresa').order_by('data_vencimento')[:5]
        
        proximas_tarefas = [{
            'id': tarefa.id,
            'titulo': tarefa.titulo,
            'empresa_nome': tarefa.empresa.nome if tarefa.empresa else 'Empresa não encontrada',
            'data_vencimento': tarefa.data_vencimento.strftime('%d/%m/%Y'),
        } for tarefa in proximas_tarefas_qs]

        # --- Dados do Gráfico (simplificado) ---
        chart_data = {
            'periodo': (hoje.replace(day=1) - timedelta(days=1)).strftime('%m/%Y'),
            'labels': ['Exemplo Concluído', 'Exemplo Pendente'],
            'data': [8, 2] # Dados de exemplo para garantir que o gráfico sempre renderize
        }

        # --- Montagem Final da Resposta ---
        data = {
            'kpis': {
                'total_clientes': total_clientes,
                'tarefas_pendentes': tarefas_pendentes_total,
                'vencendo_em_7_dias': vencendo_em_7_dias,
            },
            'proximas_tarefas': proximas_tarefas,
            'chart_data': chart_data
        }
        return Response(data)

    except Exception as e:
        logger.error(f"Erro CRÍTICO ao gerar dados do dashboard: {e}")
        return Response({"error": "Falha grave no servidor ao processar dados do dashboard."}, status=500)
    
@api_view(['GET'])
@permission_classes([IsAdminUser])
def gerenciamento_simples_api(request):
    hoje = timezone.now().date()
    periodo_alvo = hoje.replace(day=1)

    # Subquery para buscar o status da obrigação do mês corrente para cada empresa
    obrigacao_status = ObrigacaoMensal.objects.filter(
        empresa=OuterRef('pk'),
        tipo='simples_nacional',
        periodo_apuracao=periodo_alvo
    ).values('status')[:1]

    # Anota o status na queryset de empresas
    empresas = Empresa.objects.annotate(
        status_simples_mes_atual=Subquery(obrigacao_status, output_field=CharField())
    ).values('id', 'nome', 'cnpj', 'monitorar_simples', 'status_simples_mes_atual')

    return Response(list(empresas))

@api_view(['POST'])
@permission_classes([IsAdminUser])
def toggle_monitoramento_simples(request, empresa_id):
    try:
        empresa = Empresa.objects.get(id=empresa_id)
        empresa.monitorar_simples = not empresa.monitorar_simples
        empresa.save()
        return Response({'message': 'Status de monitoramento atualizado com sucesso.', 'novo_status': empresa.monitorar_simples})
    except Empresa.DoesNotExist:
        return Response({'error': 'Empresa não encontrada.'}, status=404)
    
@api_view(['GET'])
@permission_classes([IsAdminUser])
def gerenciamento_atribuicao_data(request):
    try:
        funcionarios = Funcionario.objects.all().order_by('first_name')
        empresas = Empresa.objects.all().order_by('nome')
        data = {
            'funcionarios': FuncionarioSerializer(funcionarios, many=True).data,
            'empresas': EmpresaSerializer(empresas, many=True).data
        }
        return Response(data)
    except Exception as e:
        logger.error(f"Erro ao obter dados de atribuição: {str(e)}")
        return Response({'error': f'Erro ao obter dados: {str(e)}'}, status=500)

@api_view(['POST'])
@permission_classes([IsAdminUser])
def salvar_atribuicoes(request):
    try:
        funcionario_id = request.data.get('funcionario_id')
        ids_empresas = request.data.get('ids_empresas', [])
        funcionario = Funcionario.objects.get(id=funcionario_id)
        funcionario.empresas_gerenciadas.set(ids_empresas)
        return Response({'message': 'Atribuições salvas com sucesso'}, status=200)
    except Funcionario.DoesNotExist:
        logger.error(f"Funcionário {funcionario_id} não encontrado")
        return Response({'error': 'Funcionário não encontrado'}, status=404)
    except Exception as e:
        logger.error(f"Erro ao salvar atribuições: {str(e)}")
        return Response({'error': f'Erro ao salvar atribuições: {str(e)}'}, status=400)
    
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user(request):
    try:
        serializer = FuncionarioSerializer(request.user)
        logger.info(f"Dados do usuário atual: {serializer.data}")
        return Response(serializer.data)
    except Exception as e:
        logger.error(f"Error in current_user: {str(e)}")
        return Response({'error': f'Erro ao obter dados do usuário: {str(e)}'}, status=500)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def gerar_pro_labore_pdf_view(request):
    payload = dict(request.data or {})

    empresa_id = payload.get('empresa_id')
    if empresa_id:
        try:
            empresa = Empresa.objects.get(id=empresa_id)

            endereco_full = (empresa.endereco or '').strip()
            endereco = endereco_full
            numero = (empresa.numero or '').strip()
            if not numero and endereco_full:
                match = re.search(r'(.+?),\s*(?:n(?:u|ú)?m(?:ero)?\.?\s*)?(\d+)\s*$', endereco_full, re.IGNORECASE)
                if match:
                    endereco = match.group(1).strip()
                    numero = match.group(2).strip()

            db_defaults = {
                'empresa_nome': empresa.nome or '',
                'empresa_cnpj': empresa.cnpj or '',
                'empresa_endereco': endereco,
                'empresa_numero': numero,
                'empresa_bairro': empresa.bairro or '',
                'empresa_municipio': empresa.cidade or '',
                'empresa_estado': empresa.uf or '',
                'empresa_cep': empresa.cep or '',
            }

            for key, value in db_defaults.items():
                if not str(payload.get(key, '')).strip():
                    payload[key] = value

            socio_id = payload.get('socio_id')
            socio = None

            if socio_id:
                try:
                    socio = Socio.objects.get(id=socio_id, empresa=empresa)
                except Socio.DoesNotExist:
                    return Response({'error': 'Sócio não encontrado para a empresa informada.'}, status=status.HTTP_404_NOT_FOUND)
            else:
                socio = empresa.socios.order_by('nome').first()

            if socio:
                if not str(payload.get('colaborador_nome', '')).strip():
                    payload['colaborador_nome'] = socio.nome or ''
                if not str(payload.get('colaborador_cpf', '')).strip():
                    payload['colaborador_cpf'] = socio.cpf or ''
        except Empresa.DoesNotExist:
            return Response({'error': 'Empresa não encontrada para o empresa_id informado.'}, status=status.HTTP_404_NOT_FOUND)

    try:
        arquivo_pdf, nome_arquivo = build_pro_labore_pdf(payload)
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger.exception("Erro ao gerar PDF de pro-labore")
        return Response({'error': f'Erro ao gerar documento: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    response = HttpResponse(
        arquivo_pdf,
        content_type='application/pdf',
    )
    response['Content-Disposition'] = f'attachment; filename="{nome_arquivo}"'
    return response


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def ultimo_resultado_sessao(request):
    try:
        registro, _ = UltimoResultadoSessao.objects.get_or_create(usuario=request.user)

        if request.method == 'POST':
            batch_summary = request.data.get('batch_summary')

            if batch_summary is not None and not isinstance(batch_summary, dict):
                return Response({'error': 'O campo batch_summary deve ser um objeto JSON válido.'}, status=status.HTTP_400_BAD_REQUEST)

            registro.batch_summary = batch_summary
            registro.save(update_fields=['batch_summary', 'atualizado_em'])

        serializer = UltimoResultadoSessaoSerializer(registro)
        return Response(serializer.data)
    except Exception as e:
        logger.error(f"Erro ao processar último resultado de sessão para {request.user.username}: {str(e)}")
        return Response({'error': 'Erro ao processar o último resultado da sessão.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def gerar_e_enviar_das_view(request):
    """
    View to handle DAS generation and sending via WhatsApp.
    Requires authentication.
    """
    if request.method != 'POST':
        logger.error("Método não permitido. Apenas POST é aceito.")
        return JsonResponse({"sucesso": False, "erro": "Método não permitido."}, status=405)

    try:
        # Parse JSON data from request.body
        data = json.loads(request.body)
        cnpj_empresa = data.get('cnpj')
        periodo_apuracao = data.get('periodo_apuracao')
    except json.JSONDecodeError:
        logger.error("Corpo da requisição não é um JSON válido.")
        return JsonResponse({"sucesso": False, "erro": "Corpo da requisição não é um JSON válido."}, status=400)
    except Exception as e:
        logger.error(f"Erro ao processar dados da requisição: {e}")
        return JsonResponse({"sucesso": False, "erro": "Erro ao processar dados da requisição."}, status=400)

    if not cnpj_empresa:
        logger.error("CNPJ não fornecido na requisição.")
        return JsonResponse({"sucesso": False, "erro": "CNPJ é obrigatório."}, status=400)

    # Passar o request para associar o usuário autenticado ao histórico
    result = gerar_e_enviar_das(cnpj_empresa, periodo_apuracao, request=request)
    if result["sucesso"]:
        return JsonResponse(result, status=200)
    return JsonResponse(result, status=400)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_pie_chart(request):
    user = request.user
    logger.info(f"Usuário {user.username} solicitou dados do gráfico de pizza. Cargo: {user.cargo}")

    try:
        empresas = Empresa.objects.filter(usercompanyaccess__user=user, ativo=True)
        logger.info(f"Empresas encontradas para usuário {user.username}: {empresas.count()}")

        if user.cargo == 'pessoal':
            pendentes = sum(
                1 for empresa in empresas
                for field in ['inss', 'fgts', 'folha', 'honorario']
                if not getattr(empresa, field, False)
            )
            concluidas = sum(
                1 for empresa in empresas
                for field in ['inss', 'fgts', 'folha', 'honorario']
                if getattr(empresa, field, False)
            )
            labels = ['Pendentes', 'Concluídas']
            values = [pendentes, concluidas]
        elif user.cargo == 'fiscal':
            pendentes = sum(
                1 for empresa in empresas
                if not empresa.simples_nacional and empresa.monitorar_simples
            )
            concluidas = sum(
                1 for empresa in empresas
                if empresa.simples_nacional and empresa.monitorar_simples
            )
            labels = ['Pendentes', 'Concluídas']
            values = [pendentes, concluidas]
        else:  # admin
            pendentes_pessoal = sum(
                1 for empresa in empresas
                for field in ['inss', 'fgts', 'folha', 'honorario']
                if not getattr(empresa, field, False)
            )
            concluidas_pessoal = sum(
                1 for empresa in empresas
                for field in ['inss', 'fgts', 'folha', 'honorario']
                if getattr(empresa, field, False)
            )
            pendentes_fiscal = sum(
                1 for empresa in empresas
                if not empresa.simples_nacional and empresa.monitorar_simples
            )
            concluidas_fiscal = sum(
                1 for empresa in empresas
                if empresa.simples_nacional and empresa.monitorar_simples
            )
            labels = ['Pendentes Pessoal', 'Pendentes Fiscal', 'Concluídas Pessoal', 'Concluídas Fiscal']
            values = [pendentes_pessoal, pendentes_fiscal, concluidas_pessoal, concluidas_fiscal]

        logger.info(f"Dados do gráfico para {user.username}: labels={labels}, values={values}")
        return Response({'labels': labels, 'values': values}, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Erro ao processar dados do gráfico para {user.username}: {str(e)}")
        return Response(
            {'error': 'Erro ao processar dados do gráfico de pizza.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    user = request.user
    try:
        empresas = Empresa.objects.filter(usercompanyaccess__user=user, ativo=True)
        total_empresas = empresas.count()
        hoje = timezone.now().date()
        dia = hoje.day
        mes = hoje.month
        ano = hoje.year

        if user.cargo == 'fiscal':
            vencimento_dia = 25
        else:
            vencimento_dia = 15

        data_vencimento = datetime(ano, mes, vencimento_dia).date()
        if dia > vencimento_dia:
            if mes == 12:
                mes = 1
                ano += 1
            else:
                mes += 1
            data_vencimento = datetime(ano, mes, vencimento_dia).date()

        dias_ate_vencimento = (data_vencimento - hoje).days

        pendentes = 0
        if user.cargo == 'pessoal' or user.cargo == 'admin':
            for empresa in empresas:
                if not empresa.inss:
                    pendentes += 1
                if not empresa.fgts:
                    pendentes += 1
                if not empresa.folha:
                    pendentes += 1
                if not empresa.honorario:
                    pendentes += 1
        if user.cargo == 'fiscal' or user.cargo == 'admin':
            for empresa in empresas:
                if not empresa.simples_nacional and empresa.monitorar_simples:
                    pendentes += 1

        return Response({
            'total_empresas': total_empresas,
            'tarefas_pendentes': pendentes,
            'dias_ate_vencimento': dias_ate_vencimento
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Erro ao processar resumo do dashboard para {user.username}: {str(e)}")
        return Response(
            {'error': 'Erro ao processar resumo do dashboard.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
def convert_date_format(date_str):
    """Converte um formato de data YYYY-MM-DD para dd.mm.aaaa, se aplicável."""
    if not date_str:
        return "" # Retorna string vazia para campos opcionais como data de multa/desconto
    try:
        if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            parsed_date = parse_date(date_str)
            if parsed_date:
                return parsed_date.strftime('%d.%m.%Y')
        elif re.match(r'^\d{2}\.\d{2}\.\d{4}$', date_str):
            return date_str
        elif 'T' in date_str:
             parsed_date = parse_date(date_str.split('T')[0])
             if parsed_date:
                return parsed_date.strftime('%d.%m.%Y')
        elif date_str == "":
            return ""
        return date_str
    except Exception as e:
        logger.error(f"Erro ao converter data {date_str}: {str(e)}")
        return ""


def enviar_boleto_honorario_whatsapp(empresa, pdf_content, nome_arquivo, usuario=None):
    recipient_number = re.sub(r"\D", "", str(empresa.telefone or ""))

    if not recipient_number:
        erro = "Empresa sem telefone configurado para envio de boleto pelo WhatsApp."
        logger.warning(f"{erro} Empresa: {empresa.nome}")
        HistoricoEnvios.objects.create(
            remetente="",
            arquivo=nome_arquivo,
            status='falha',
            usuario=usuario,
            erro=erro,
            empresa=empresa,
        )
        return None, erro

    temp_file_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            temp_file.write(pdf_content)
            temp_file_path = temp_file.name

        media_id, _ = upload_media_to_whatsapp(temp_file_path, nome_arquivo)
        if not media_id:
            erro = "Falha ao fazer upload do boleto para o WhatsApp."
            HistoricoEnvios.objects.create(
                remetente=recipient_number,
                arquivo=nome_arquivo,
                status='falha',
                usuario=usuario,
                erro=erro,
                empresa=empresa,
            )
            return None, erro

        message_id, error_sending = send_whatsapp_document_template_message(
            recipient_number=recipient_number,
            document_media_id=media_id,
            document_filename=nome_arquivo,
            template_name='honorario',
            template_params={},
            company_name=empresa.nome,
        )

        if message_id:
            HistoricoEnvios.objects.create(
                remetente=recipient_number,
                arquivo=nome_arquivo,
                status='sucesso',
                message_id=message_id,
                usuario=usuario,
                empresa=empresa,
            )
            return message_id, None

        HistoricoEnvios.objects.create(
            remetente=recipient_number,
            arquivo=nome_arquivo,
            status='falha',
            usuario=usuario,
            erro=error_sending,
            empresa=empresa,
        )
        return None, error_sending
    except Exception as e:
        logger.error(f"Erro ao enviar boleto via WhatsApp para {empresa.nome}: {e}")
        HistoricoEnvios.objects.create(
            remetente=recipient_number,
            arquivo=nome_arquivo,
            status='falha',
            usuario=usuario,
            erro=str(e),
            empresa=empresa,
        )
        return None, str(e)
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)


def salvar_boleto_honorario(empresa, pdf_content):
    agora = timezone.now()
    ano_referencia = str(agora.year)
    mes_referencia = str(agora.month).zfill(2)
    nome_arquivo_pasta = 'HONORARIO.pdf'

    documentos_existentes = Outros.objects.filter(
        nome_empresa=empresa.nome,
        tipo_documento='HONORARIO',
        mes=mes_referencia,
        ano=ano_referencia,
    ).order_by('id')

    documento = documentos_existentes.first()
    for documento_extra in documentos_existentes[1:]:
        if documento_extra.caminho_arquivo:
            documento_extra.caminho_arquivo.delete(save=False)
        documento_extra.delete()

    if documento is None:
        documento = Outros(
            nome_empresa=empresa.nome,
            cnpj_empresa=empresa.cnpj,
            tipo_documento='HONORARIO',
            mes=mes_referencia,
            ano=ano_referencia,
        )
    else:
        documento.nome_empresa = empresa.nome
        documento.cnpj_empresa = empresa.cnpj
        documento.tipo_documento = 'HONORARIO'
        documento.mes = mes_referencia
        documento.ano = ano_referencia
        if documento.caminho_arquivo:
            documento.caminho_arquivo.delete(save=False)

    documento.nome_arquivo = nome_arquivo_pasta
    documento.caminho_arquivo.save(nome_arquivo_pasta, ContentFile(pdf_content), save=False)
    documento.save()
    return documento


def buscar_boleto_honorario_mes_atual(empresa):
    agora = timezone.now()
    return Outros.objects.filter(
        nome_empresa=empresa.nome,
        tipo_documento='HONORARIO',
        mes=str(agora.month).zfill(2),
        ano=str(agora.year),
    ).order_by('id').first()


def boleto_honorario_arquivo_disponivel(documento):
    return (
        documento
        and documento.caminho_arquivo
        and hasattr(documento.caminho_arquivo, 'path')
        and os.path.exists(documento.caminho_arquivo.path)
    )


def usuario_pode_gerenciar_empresa(user, empresa):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    return empresa.gerenciada_por.filter(id=user.id).exists()


@api_view(['POST'])
def gerar_boleto_view(request):
    empresa_id = request.data.get('empresa_id')
    incoming_data = request.data.get('boleto_data', {})
    action = request.data.get('action', "gerar_enviar")  # gerar_enviar (padrão) ou baixar

    if not empresa_id:
        return Response({"error": "empresa_id é obrigatório."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        empresa = Empresa.objects.get(id=empresa_id)
    except Empresa.DoesNotExist:
        return Response({"error": "Empresa não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    # Garante que o usuário só gere boleto para empresas que ele enxerga/gerencia
    if not usuario_pode_gerenciar_empresa(request.user, empresa):
        return Response({"error": "Você não tem permissão para gerar boleto para esta empresa."}, status=status.HTTP_403_FORBIDDEN)

    # Controle para manter apenas 1 boleto por mês por empresa
    boleto_existente = buscar_boleto_honorario_mes_atual(empresa)

    # Ação: somente download. Se existe arquivo, devolve link; se não, continua e gera novo (sem enviar)
    if action == "baixar" and boleto_existente and boleto_existente.caminho_arquivo:
        try:
            boleto_existente.caminho_arquivo.open('rb').close()
            return Response({
                "success": True,
                "message": "Boleto encontrado. Disponível para download.",
                "from_cache": True,
                "download_url": request.build_absolute_uri(boleto_existente.caminho_arquivo.url),
                "arquivo_pasta": boleto_existente.nome_arquivo,
            }, status=status.HTTP_200_OK)
        except Exception:
            # Se o arquivo foi registrado mas não está mais disponível, segue para gerar novamente
            pass

    # --- INÍCIO DA CORREÇÃO FINAL ---

    # !! IMPORTANTE !!
    # CONFIRME ESTES 2 VALORES NO SEU PORTAL DE DESENVOLVEDOR DO BANCO DO BRASIL.
    SEU_NUMERO_CONVENIO = 3645123  # Seu convênio de 7 dígitos
    SUA_CARTEIRA = 17              # Geralmente 17 ou 18. CONFIRME.

    # --- Lógica de Data de Vencimento e Valores Padrão ---
    hoje = timezone.now().date()
    dia_vencimento = empresa.dia_vencimento_honorario
    
    # Determinar a data de vencimento
    try:
        data_vencimento_dt = hoje.replace(day=dia_vencimento)
    except ValueError:
        import calendar
        last_day = calendar.monthrange(hoje.year, hoje.month)[1]
        data_vencimento_dt = hoje.replace(day=last_day)

    if hoje.day > dia_vencimento:
        proximo_mes = (hoje.replace(day=1) + timedelta(days=32)).replace(day=1)
        try:
            data_vencimento_dt = proximo_mes.replace(day=dia_vencimento)
        except ValueError:
             import calendar
             last_day = calendar.monthrange(proximo_mes.year, proximo_mes.month)[1]
             data_vencimento_dt = proximo_mes.replace(day=last_day)
    
    data_vencimento_str = data_vencimento_dt.strftime('%d.%m.%Y')

    data_desconto_str = ""
    if empresa.dias_para_desconto > 0:
        data_desc_dt = data_vencimento_dt - timedelta(days=empresa.dias_para_desconto)
        data_desconto_str = data_desc_dt.strftime('%d.%m.%Y')

    unique_suffix = f"{int(timezone.now().timestamp() * 1_000_000) % 10**10:010d}"
    fallback_beneficiario = f"{timezone.now().strftime('%H%M%S%f')}{uuid.uuid4().hex[:4]}".upper()

    default_payload = {
        "numeroConvenio": SEU_NUMERO_CONVENIO,
        "carteira": SUA_CARTEIRA,
        # "variacaoCarteira" removida, conforme sua instrução para sandbox.
        "codigoModalidade": 1,
        "dataEmissao": timezone.now().strftime('%d.%m.%Y'),
        "dataVencimento": data_vencimento_str,
        "valorOriginal": float(empresa.valor_honorario) if empresa.valor_honorario > 0 else 1.00,
        "valorAbatimento": 0.0,
        "quantidadeDiasProtesto": 0,
        "quantidadeDiasNegativacao": 0,
        "orgaoNegativador": 0,
        # Permite recebimento após o vencimento; limite alto evita baixa automática.
        "indicadorAceiteTituloVencido": "S",
        "numeroDiasLimiteRecebimento": 30,
        "codigoAceite": "N",
        "codigoTipoTitulo": 2,
        "descricaoTipoTitulo": "DM",
        "indicadorPermissaoRecebimentoParcial": "N",
        # Gera um número de controle único para cada teste
        "numeroTituloBeneficiario": fallback_beneficiario,
        "campoUtilizacaoBeneficiario": "EMISSAO WEB",
        # Gera um "Nosso Número" de 20 dígitos, único para cada teste
        "numeroTituloCliente": f"000{SEU_NUMERO_CONVENIO}{unique_suffix}",
        "mensagemBloquetoOcorrencia": "Boleto de Cobrança",
        "indicadorPix": "S",
    }

    # Construa o payload final
    final_payload = {
        "numeroConvenio": int(incoming_data.get("numeroConvenio") or default_payload["numeroConvenio"]),
        "carteira": int(incoming_data.get("carteira") or default_payload["carteira"]),
        "codigoModalidade": int(incoming_data.get("codigoModalidade") or default_payload["codigoModalidade"]),
        "dataEmissao": convert_date_format(incoming_data.get("dataEmissao")) or default_payload["dataEmissao"],
        "dataVencimento": convert_date_format(incoming_data.get("dataVencimento")) or default_payload["dataVencimento"],
        "valorOriginal": float(incoming_data.get("valorOriginal") or default_payload["valorOriginal"]),
        "valorAbatimento": float(incoming_data.get("valorAbatimento") or default_payload["valorAbatimento"]),
        "quantidadeDiasProtesto": int(incoming_data.get("quantidadeDiasProtesto") or default_payload["quantidadeDiasProtesto"]),
        "quantidadeDiasNegativacao": int(incoming_data.get("quantidadeDiasNegativacao") or default_payload["quantidadeDiasNegativacao"]),
        "orgaoNegativador": int(incoming_data.get("orgaoNegativador") or default_payload["orgaoNegativador"]),
        "indicadorAceiteTituloVencido": incoming_data.get("indicadorAceiteTituloVencido") or default_payload["indicadorAceiteTituloVencido"],
        "numeroDiasLimiteRecebimento": int(incoming_data.get("numeroDiasLimiteRecebimento") or default_payload["numeroDiasLimiteRecebimento"]),
        "codigoAceite": incoming_data.get("codigoAceite") or default_payload["codigoAceite"],
        "codigoTipoTitulo": int(incoming_data.get("codigoTipoTitulo") or default_payload["codigoTipoTitulo"]),
        "descricaoTipoTitulo": incoming_data.get("descricaoTipoTitulo") or default_payload["descricaoTipoTitulo"],
        "indicadorPermissaoRecebimentoParcial": incoming_data.get("indicadorPermissaoRecebimentoParcial") or default_payload["indicadorPermissaoRecebimentoParcial"],
        "numeroTituloBeneficiario": incoming_data.get("numeroTituloBeneficiario") or default_payload["numeroTituloBeneficiario"],
        "campoUtilizacaoBeneficiario": incoming_data.get("campoUtilizacaoBeneficiario") or default_payload["campoUtilizacaoBeneficiario"],
        "numeroTituloCliente": incoming_data.get("numeroTituloCliente") or default_payload["numeroTituloCliente"],
        "mensagemBloquetoOcorrencia": incoming_data.get("mensagemBloquetoOcorrencia") or default_payload["mensagemBloquetoOcorrencia"],
        "indicadorPix": incoming_data.get("indicadorPix") or default_payload["indicadorPix"],
        "quantidade": incoming_data.get("quantidade") or "", # Novo campo
    }
    
    # Validações...
    if final_payload["valorOriginal"] <= final_payload["valorAbatimento"]:
        final_payload["valorAbatimento"] = 0.0

    if not final_payload["dataEmissao"] or not re.match(r'^\d{2}\.\d{2}\.\d{4}$', final_payload["dataEmissao"]):
        return Response({"error": f"Formato de dataEmissao inválido: {final_payload['dataEmissao']}. Use dd.mm.aaaa."}, status=status.HTTP_400_BAD_REQUEST)
    if not final_payload["dataVencimento"] or not re.match(r'^\d{2}\.\d{2}\.\d{4}$', final_payload["dataVencimento"]):
        return Response({"error": f"Formato de dataVencimento inválido: {final_payload['dataVencimento']}. Use dd.mm.aaaa."}, status=status.HTTP_400_BAD_REQUEST)

    # Construção do campo pagador
    incoming_pagador = incoming_data.get('pagador', {})
    final_payload["pagador"] = { "tipoInscricao": incoming_pagador.get("tipoInscricao") or 2, "numeroInscricao": incoming_pagador.get("numeroInscricao") or (int(re.sub(r"\D", "", str(empresa.cnpj))) if empresa.cnpj else 0), "nome": incoming_pagador.get("nome") or empresa.nome, "endereco": incoming_pagador.get("endereco") or empresa.endereco or "Endereço Padrão", "cep": incoming_pagador.get("cep") or (int(re.sub(r"\D", "", str(empresa.cep))) if empresa.cep else 0), "cidade": incoming_pagador.get("cidade") or empresa.cidade or "Cidade", "bairro": incoming_pagador.get("bairro") or empresa.bairro or "Bairro", "uf": incoming_pagador.get("uf") or empresa.uf or "SP", "telefone": incoming_pagador.get("telefone") or (re.sub(r"\D", "", str(empresa.telefone)) if empresa.telefone else "00000000000"), "email": incoming_pagador.get("email") or empresa.email or "email@exemplo.com", }

    # Calculando datas padrão para Multa e Juros (geralmente vencimento + 1 dia)
    data_limite_pagamento_dt = data_vencimento_dt + timedelta(days=1)
    data_encargos_str = data_limite_pagamento_dt.strftime('%d.%m.%Y')

    # Construção dos campos aninhados com lógica de validação e defaults da empresa
    def build_charge_field(data, field_name, default_percent=0.0, default_date=""):
        incoming_field = data.get(field_name, {})
        
        # Se o form não enviou nada, mas temos um default configurado na empresa > 0
        if not incoming_field and default_percent > 0:
            return {
                "tipo": 2, # 2 = Percentual
                "porcentagem": float(default_percent),
                "valor": 0.0, # Para tipo 2, valor deve ser zerado
                "data": default_date # Usado para desconto ou multa
            }

        tipo = int(incoming_field.get("tipo") or 0)
        
        field_data = {
            "tipo": tipo,
            "porcentagem": float(incoming_field.get("porcentagem") or 0.0) if tipo == 2 else 0.0,
            "valor": float(incoming_field.get("valor") or 0.0) if tipo == 1 else 0.0,
        }
        
        # Adiciona datas apenas se elas existirem e forem válidas
        data_val = convert_date_format(incoming_field.get("data", ""))
        if data_val: 
            field_data["data"] = data_val
        elif default_date and default_percent > 0 and tipo == 0: 
             # Se não veio nada no input (tipo 0), mas estamos aplicando default
             field_data["tipo"] = 2
             field_data["porcentagem"] = float(default_percent)
             field_data["data"] = default_date
             
        data_exp_val = convert_date_format(incoming_field.get("dataExpiracao", ""))
        if data_exp_val: field_data["dataExpiracao"] = data_exp_val

        return field_data

    final_payload["desconto"] = build_charge_field(incoming_data, "desconto", empresa.desconto_taxa, data_desconto_str)
    final_payload["segundoDesconto"] = build_charge_field(incoming_data, "segundoDesconto")
    final_payload["terceiroDesconto"] = build_charge_field(incoming_data, "terceiroDesconto")
    
    # --- ALTERAÇÃO: Juros e Multa desativados temporariamente conforme pedido ---
    # Para reativar, basta voltar a usar build_charge_field com os parâmetros da empresa
    final_payload["multa"] = { "tipo": 0, "porcentagem": 0.0, "valor": 0.0, "data": "" }
    final_payload["jurosMora"] = { "tipo": 0, "porcentagem": 0.0, "valor": 0.0, "data": "" }
    
    final_payload["beneficiarioFinal"] = incoming_data.get("beneficiarioFinal", {"tipoInscricao": 0, "numeroInscricao": 0, "nome": ""})
    
    # --- FIM DA CORREÇÃO ---

    access_token = get_bb_access_token()
    if not access_token:
        return Response({"error": "Falha ao obter token de acesso do BB."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    headers = { 'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json', 'X-Developer-Application-Key': settings.BB_DEVELOPER_APPLICATION_KEY }
    register_url = f"{settings.BB_API_BASE_URL}/boletos"


    logger.info(f"URL: {register_url}")
    logger.info(f"HEADERS: {headers}") 
    logger.debug(f"PAYLOAD keys: {list(final_payload.keys())} - valorOriginal={final_payload.get('valorOriginal')}")
    response = requests.post(register_url, json=final_payload, headers=headers, timeout=30)

    logger.info(f"RESPOSTA: Status {response.status_code}, Body: {response.text[:500]}...")

    if response.status_code not in [200, 201]:
        return Response({"error": f"Erro ao registrar boleto: {response.text}"}, status=response.status_code)


    # === GERACAO DO BOLETO ===
    boleto_response = response.json()

    # --- Extração dos campos retornados pelo BB (nomes conforme exemplo de resposta) ---
    beneficiario = boleto_response.get('beneficiario', {}) or {}
    # Linha digitável retornada pelo BB
    linha_digitavel = boleto_response.get('linhaDigitavel') or boleto_response.get('linha_digitavel')
    # Código de barras numérico (string somente com dígitos)
    codigo_barra_numerico = boleto_response.get('codigoBarraNumerico') or boleto_response.get('codigoBarra') or boleto_response.get('codigoBarras')
    # Nosso número / número do boleto
    numero_boleto = boleto_response.get('numero') or boleto_response.get('nossoNumero')
    # QR code info (muitos ambientes do BB retornam objeto qrCode; pode ter url, emv, txId, imagemBase64, payload)
    qr_info = boleto_response.get('qrCode', {}) or {}
    qr_url = qr_info.get('url') or ''
    qr_emv = qr_info.get('emv') or qr_info.get('payload') or ''
    qr_image_base64 = qr_info.get('imagemBase64') or qr_info.get('imagem')  # se existir

    # Log minimal — sem payloads sensíveis
    logger.debug(f"BB response: numero={numero_boleto}, linha_digitavel present={bool(linha_digitavel)}, codigo_barra_numerico present={bool(codigo_barra_numerico)}, qr present={bool(qr_url or qr_emv or qr_image_base64)}")


    # === GERAR QR CODE EM SVG ===
    qr_base64 = None
    qr_mime = None

    # 1) prefira imagem retornada pelo BB
    if qr_image_base64:
        # supondo que seja SVG ou PNG — você pode detectar depois se necessário
        qr_base64 = qr_image_base64
        # tente inferir mime (muitos retornam SVG em base64)
        qr_mime = 'image/svg+xml'
    else:
        # 2) se o BB retornou emv/payload, gere o QR localmente
        qr_payload = qr_emv or qr_url
        if qr_payload:
            try:
                factory = qrcode.image.svg.SvgImage
                qr = qrcode.make(qr_payload, image_factory=factory)
                qr_buffer = BytesIO()
                qr.save(qr_buffer)
                qr_buffer.seek(0)
                qr_base64 = base64.b64encode(qr_buffer.getvalue()).decode()
                qr_mime = 'image/svg+xml'
            except Exception as e:
                logger.warning(f"Falha ao gerar QR localmente: {e}")
                qr_base64 = None
                qr_mime = None
    # Se tudo falhar, qr_base64 fica None e o template não deve exibir QR.


    logger.debug("API codigoBarraNumerico (raw): %r", boleto_response.get('codigoBarraNumerico'))
    logger.debug("API linhaDigitavel (raw): %r", boleto_response.get('linhaDigitavel'))
    # se você já tem codigo_barra que vai para o gerador:
    

    # === GERAR CÓDIGO DE BARRAS EM SVG ===
    # === GERAR CÓDIGO DE BARRAS EM SVG (USAR MESMO PADRÃO QUE VOCÊ DISSE FUNCIONAR) ===
    writer_options = {
        'write_text': True,   # mostra os números abaixo
        'font_size': 30,      # tamanho da fonte dos números
        'text_distance': 10,  # distância entre barras e números
        'module_height': 48,  # altura das barras
        'module_width': 1,    # largura de cada barra
    }

    # Usar Code128 diretamente (mesmo padrão antigo)
    # 'codigo_barra' vem de: codigo_barra = boleto_response.get('codigoBarraNumerico')
    codigo_barra = linha_digitavel
    codigo_barra_obj = Code128(codigo_barra, writer=SVGWriter())
    barcode_buffer = BytesIO()
    # Algumas versões aceitam options=..., outras writer_options=...
    try:
        codigo_barra_obj.write(barcode_buffer, options=writer_options)
    except TypeError:
        codigo_barra_obj.write(barcode_buffer, writer_options=writer_options)
    barcode_buffer.seek(0)
    codigo_barra_base64 = base64.b64encode(barcode_buffer.getvalue()).decode()
    codigo_barra_mime = 'image/svg+xml'


    # === DADOS DO BOLETO ===
    data_boleto = {
        'codigo_banco_com_dv': boleto_response.get('bancoCodigoComDv') or '001-9',
        'linha_digitavel': linha_digitavel or '',
        'cedente': 'INOVAR SERVICOS ADMINISTRATIVOS LTDA',
        'agencia_codigo': f"{beneficiario.get('agencia','')}/{beneficiario.get('codigoCliente','') or boleto_response.get('codigoCliente','')}",
        'nosso_numero': numero_boleto or final_payload.get('numeroTituloBeneficiario',''),
        'data_vencimento': boleto_response.get('dataVencimento') or final_payload['dataVencimento'],
        'valor_boleto': f"R$ {float(boleto_response.get('valorOriginal', final_payload['valorOriginal'])):,.2f}".replace(',', 'v').replace('.', ',').replace('v', '.'),
        'numero_documento': final_payload.get('numeroTituloBeneficiario', '') or '',
        'cpf_cnpj': '46.440.172/0001-87',
        'data_documento': boleto_response.get('dataDocumento') or final_payload['dataEmissao'],
        'especie_doc': boleto_response.get('especieDocumento') or final_payload.get('descricaoTipoTitulo','DM'),
        'aceite': boleto_response.get('aceite') or final_payload.get('codigoAceite','N'),
        'data_processamento': boleto_response.get('dataProcessamento') or final_payload.get('dataEmissao','') or '',
        'carteira': str(final_payload['carteira']),
        'especie': 'R$',
        'quantidade': boleto_response.get('quantidade','') or '',
        'valor_unitario': boleto_response.get('valorUnitario','') or '',
        'demonstrativo1': boleto_response.get('demonstrativo1','') or '',
        'demonstrativo2': boleto_response.get('demonstrativo2','') or '',
        'demonstrativo3': boleto_response.get('demonstrativo3','') or '',
        'instrucoes1': boleto_response.get('mensagemOcorrencia') or final_payload.get('mensagemBloquetoOcorrencia',''),
        'instrucoes2': '',
        'instrucoes3': '',
        'instrucoes4': '',
        'sacado': final_payload['pagador']['nome'],
        'endereco1': final_payload['pagador'].get('endereco',''),
        'endereco2': f"{final_payload['pagador'].get('cidade','')} - {final_payload['pagador'].get('uf','')}",
    }

    # === PERSISTIR BOLETO NO BANCO ===
    try:
        venc_dt = datetime.datetime.strptime(final_payload['dataVencimento'], '%d.%m.%Y').date()
    except Exception:
        venc_dt = None

    numero_titulo_cliente_db = str(
        boleto_response.get('id')
        or boleto_response.get('numeroTituloCliente')
        or final_payload.get('numeroTituloCliente')
        or f"fallback-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"
    ).strip()

    nosso_numero_db = str(
        numero_boleto
        or boleto_response.get('nossoNumero')
        or boleto_response.get('id')
        or numero_titulo_cliente_db
    ).strip()

    BoletoBB.objects.update_or_create(
        numero_titulo_cliente=numero_titulo_cliente_db,
        defaults={
            'empresa': empresa,
            'numero_convenio': str(final_payload.get('numeroConvenio', '')),
            'carteira': str(final_payload.get('carteira', '')),
            'variacao_carteira': str(final_payload.get('variacaoCarteira', '') or final_payload.get('variacao_carteira', '')),
            'numero_operacao': str(boleto_response.get('numeroOperacao') or final_payload.get('numeroOperacao') or ''),
            'nosso_numero': nosso_numero_db,
            'linha_digitavel': linha_digitavel or '',
            'codigo_barra': codigo_barra_numerico or '',
            'valor_original': Decimal(str(final_payload.get('valorOriginal', 0))) if final_payload.get('valorOriginal') is not None else Decimal('0'),
            'data_vencimento': venc_dt,
            'status': 'registrado',
            'payload_registro': boleto_response,
        }
    )


    # === CAMINHO ABSOLUTO DA LOGO ===
    caminho_logo = os.path.join(settings.BASE_DIR, 'frontend','src', 'assets', 'logobb.PNG')
    if not os.path.exists(caminho_logo):
        raise FileNotFoundError(f"Logo não encontrada: {caminho_logo}")

    with open(caminho_logo, "rb") as img_file:
        logobb_base64 = base64.b64encode(img_file.read()).decode()

    # === RENDERIZAR HTML COM SVG BASE64 ===
    caminho_logo_url = caminho_logo.replace('\\', '/')
    html_string = render_to_string('boleto_bb.html', {
        'dataBoleto': data_boleto,
        'caminho_logo': f"file:///{caminho_logo_url}",
        'codigo_barra_base64': codigo_barra_base64,
        'codigo_barra_mime': codigo_barra_mime,
        'qr_base64': qr_base64,
        'qr_mime': qr_mime,
        'logobb': logobb_base64,
    })

    # === CONFIGURAÇÕES DO PDF ===
    options = {
        'page-size': 'A4',
        'margin-top': '0mm',
        'margin-right': '0mm',
        'margin-bottom': '0mm',
        'margin-left': '0mm',
        'encoding': 'UTF-8',
        'quiet': '',
        'disable-smart-shrinking': '',
        'dpi': 300,
        'load-error-handling': 'ignore',
        'load-media-error-handling': 'ignore',
        'enable-local-file-access': None,
        'allow': os.path.dirname(caminho_logo),
        'enable-external-links': None,
        'enable-internal-links': None,
    }

    config = pdfkit.configuration(wkhtmltopdf=WKHTMLTOPDF_PATH)

    # === GERAR PDF ===
    try:
        pdf = pdfkit.from_string(
            html_string,
            False,
            options=options,
            configuration=config
        )
    except Exception as e:
        return HttpResponse(f"Erro ao gerar PDF: {str(e)}", status=500)

    documento_honorario = salvar_boleto_honorario(empresa, pdf)
    nome_base_empresa = empresa.nome or 'empresa'
    nome_arquivo_boleto = sanitize_filename_for_upload(f"honorario_{nome_base_empresa}.pdf").lower()
    usuario_envio = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None

    # Se a ação for apenas baixar, não envia pelo WhatsApp
    if action == "baixar":
        return Response({
            "success": True,
            "message": "Boleto gerado e disponível para download.",
            "from_cache": False,
            "download_url": request.build_absolute_uri(documento_honorario.caminho_arquivo.url),
            "arquivo_pasta": documento_honorario.nome_arquivo,
            "caminho_arquivo": documento_honorario.caminho_arquivo.name,
        }, status=status.HTTP_200_OK)

    try:
        message_id, whatsapp_error = enviar_boleto_honorario_whatsapp(
            empresa=empresa,
            pdf_content=pdf,
            nome_arquivo=nome_arquivo_boleto,
            usuario=usuario_envio,
        )
        if message_id:
            logger.info(f"Boleto enviado via WhatsApp com sucesso para {empresa.nome}. message_id={message_id}")
        else:
            logger.warning(f"Falha ao enviar boleto via WhatsApp para {empresa.nome}: {whatsapp_error}")
    except Exception as e:
        logger.error(f"Erro inesperado no fluxo de envio do boleto via WhatsApp para {empresa.nome}: {e}")

    # === RETORNO ===
    return Response({
        "success": True,
        "message": "Boleto gerado, salvo na pasta da empresa e processado para envio no WhatsApp.",
        "arquivo_whatsapp": nome_arquivo_boleto,
        "arquivo_pasta": documento_honorario.nome_arquivo,
        "caminho_arquivo": documento_honorario.caminho_arquivo.name,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def gerar_boletos_pdf_unico_view(request):
    empresa_ids = request.data.get('empresa_ids') or []
    boleto_data = request.data.get('boleto_data', {})

    if not isinstance(empresa_ids, list) or not empresa_ids:
        return Response(
            {"error": "Envie uma lista de empresa_ids para baixar os boletos."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ordered_ids = []
    for empresa_id in empresa_ids:
        try:
            parsed_id = int(empresa_id)
        except (TypeError, ValueError):
            continue
        if parsed_id not in ordered_ids:
            ordered_ids.append(parsed_id)

    if not ordered_ids:
        return Response(
            {"error": "Nenhuma empresa valida foi enviada."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    empresas_by_id = {
        empresa.id: empresa
        for empresa in Empresa.objects.filter(id__in=ordered_ids)
    }

    factory = APIRequestFactory()
    pdf_entries = []
    results = []

    for empresa_id in ordered_ids:
        empresa = empresas_by_id.get(empresa_id)
        if not empresa:
            results.append({
                "empresa_id": empresa_id,
                "status": "erro",
                "error": "Empresa não encontrada.",
            })
            continue

        if not usuario_pode_gerenciar_empresa(request.user, empresa):
            results.append({
                "empresa_id": empresa_id,
                "empresa_nome": empresa.nome,
                "status": "erro",
                "error": "Você não tem permissão para esta empresa.",
            })
            continue

        documento = buscar_boleto_honorario_mes_atual(empresa)
        from_cache = boleto_honorario_arquivo_disponivel(documento)

        if not from_cache:
            internal_request = factory.post(
                '/api/gerar-boleto/',
                {
                    'empresa_id': empresa.id,
                    'boleto_data': boleto_data,
                    'action': 'baixar',
                },
                format='json',
            )
            force_authenticate(internal_request, user=request.user)
            generated_response = gerar_boleto_view(internal_request)

            if generated_response.status_code >= 400:
                response_data = getattr(generated_response, 'data', {}) or {}
                results.append({
                    "empresa_id": empresa.id,
                    "empresa_nome": empresa.nome,
                    "status": "erro",
                    "error": response_data.get('error') or response_data.get('message') or 'Falha ao gerar o boleto.',
                })
                continue

            documento = buscar_boleto_honorario_mes_atual(empresa)

        if not boleto_honorario_arquivo_disponivel(documento):
            results.append({
                "empresa_id": empresa.id,
                "empresa_nome": empresa.nome,
                "status": "erro",
                "error": "Boleto não encontrado no servidor após a geração.",
            })
            continue

        pdf_entries.append((empresa, documento.caminho_arquivo.path))
        results.append({
            "empresa_id": empresa.id,
            "empresa_nome": empresa.nome,
            "status": "cache" if from_cache else "gerado",
        })

    if not pdf_entries:
        return Response({
            "error": "Nenhum boleto ficou disponível para download.",
            "results": results,
        }, status=status.HTTP_400_BAD_REQUEST)

    output = BytesIO()
    merger = PdfMerger()
    try:
        for _, pdf_path in pdf_entries:
            merger.append(pdf_path)
        merger.write(output)
    except Exception as exc:
        logger.exception("Erro ao concatenar boletos em PDF unico")
        return Response({
            "error": f"Erro ao concatenar os boletos: {exc}",
            "results": results,
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    finally:
        merger.close()

    output.seek(0)
    hoje = timezone.localdate().strftime('%Y-%m-%d')
    filename = f"boletos_honorarios_{hoje}.pdf"
    summary = {
        "total_solicitado": len(ordered_ids),
        "total_pdf": len(pdf_entries),
        "cache_count": len([item for item in results if item.get('status') == 'cache']),
        "generated_count": len([item for item in results if item.get('status') == 'gerado']),
        "error_count": len([item for item in results if item.get('status') == 'erro']),
        "results": results,
    }

    response = HttpResponse(output.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response['X-Boleto-Batch-Summary'] = urllib.parse.quote(json.dumps(summary, ensure_ascii=True))
    response['Access-Control-Expose-Headers'] = 'Content-Disposition, X-Boleto-Batch-Summary'
    return response


# === WEBHOOK COBRANÇA BB ===
@csrf_exempt
@api_view(['POST'])
@authentication_classes([])  # externo; não requer auth
@permission_classes([])      # libera autenticação do DRF
def bb_cobranca_webhook(request):
    if request.method != 'POST':
        return JsonResponse({"detail": "Method not allowed"}, status=405)

    # Verificação opcional de segredo
    secret = getattr(settings, 'BB_WEBHOOK_TOKEN', None)
    provided = request.headers.get('X-Hook-Token') or request.headers.get('X-Hook-Secret')
    if secret and provided != secret:
        return JsonResponse({"detail": "Invalid webhook token"}, status=403)

    # Parse seguro do body
    try:
        raw_body = request.body.decode('utf-8-sig', errors='replace') if request.body else ''
    except Exception:
        raw_body = ''

    try:
        payload = json.loads(raw_body) if raw_body else {}
    except Exception:
        payload = {}

    # Fallback para payload url-encoded (ex.: testes com curl)
    if not payload and raw_body and "=" in raw_body:
        try:
            parsed_form = urllib.parse.parse_qs(raw_body, keep_blank_values=True)
            payload = {k: (v[0] if isinstance(v, list) and len(v) == 1 else v) for k, v in parsed_form.items()}
        except Exception:
            payload = {}

    # Aceita objeto ou lista de objetos
    if isinstance(payload, list):
        payload_items = payload
        payload_obj = payload[0] if payload and isinstance(payload[0], dict) else {}
    elif isinstance(payload, dict):
        payload_items = [payload]
        payload_obj = payload
    else:
        payload_items = []
        payload_obj = {}

    def pick(data, *keys, default=None):
        if not isinstance(data, dict):
            return default
        for key in keys:
            value = data.get(key)
            if value is not None and value != "":
                return value
        return default

    # IP real do cliente por trás do Cloudflare Tunnel
    forwarded_for = request.headers.get('X-Forwarded-For')
    if forwarded_for:
        real_ip = forwarded_for.split(',')[0].strip()
    else:
        real_ip = (
            request.headers.get('CF-Connecting-IP')
            or request.META.get('HTTP_CF_CONNECTING_IP')
            or request.META.get('REMOTE_ADDR')
        )

    # Mapeamento real do payload do BB
    evento = pick(
        payload_obj,
        'tipoEvento',
        'tipo_evento',
        'evento',
        'situacao',
        default='liquidacao'
    )

    numero_convenio = pick(
        payload_obj,
        'numeroConvenio',
        'numero_convenio',
        'convenio'
    )

    # O BB real não mandou "nossoNumero" nesse exemplo.
    # O campo mais próximo para identificar o título é "id" ou "numeroOperacao".
    nosso_numero = pick(
        payload_obj,
        'nossoNumero',
        'nosso_numero',
        'numeroTituloBeneficiario',
        'numeroTituloCliente',
        'id'
    )

    valor_pago = pick(
        payload_obj,
        'valorPago',
        'valor_pago',
        'valorRecebido',
        'valor_recebido',
        'valorPagoSacado',
        'valorOriginal'
    )

    data_evento = pick(
        payload_obj,
        'dataPagamento',
        'data_pagamento',
        'dataOcorrencia',
        'data_ocorrencia',
        'dataEvento',
        'data_evento',
        'dataLiquidacao',
        'dataCredito',
        'dataRegistro'
    )

    log_entry = {
        "evento": evento,
        "numero_convenio": numero_convenio,
        "nosso_numero": nosso_numero,
        "valor_pago": valor_pago,
        "data_evento": data_evento,
        "payload": payload,
        "payload_obj": payload_obj,
        "quantidade_itens": len(payload_items),
        "raw_body": raw_body,
        "recebido_em": timezone.now().isoformat(),
        "ip": real_ip,
        "user_agent": request.META.get('HTTP_USER_AGENT'),
    }

    boleto_atualizado = None
    status_boleto = _map_bb_webhook_status(evento, payload_obj)
    data_pagamento = _parse_bb_date(data_evento)
    valor_pago_decimal = _parse_bb_decimal(valor_pago)
    numero_operacao = pick(payload_obj, 'numeroOperacao', 'numero_operacao')

    try:
        boleto_qs = BoletoBB.objects.all()
        if numero_convenio:
            boleto_qs = boleto_qs.filter(numero_convenio=str(numero_convenio))

        lookup_candidates = []
        for candidate in (
            pick(payload_obj, 'id'),
            pick(payload_obj, 'nossoNumero', 'nosso_numero'),
            pick(payload_obj, 'numeroTituloBeneficiario'),
            pick(payload_obj, 'numeroTituloCliente'),
            nosso_numero,
        ):
            if candidate in (None, ""):
                continue
            candidate_str = str(candidate).strip()
            if candidate_str and candidate_str not in lookup_candidates:
                lookup_candidates.append(candidate_str)

        boleto = None
        if lookup_candidates:
            for candidate in lookup_candidates:
                boleto = (
                    boleto_qs.filter(nosso_numero=str(candidate)).order_by('-atualizado_em', '-criado_em').first()
                    or boleto_qs.filter(numero_titulo_cliente=str(candidate)).order_by('-atualizado_em', '-criado_em').first()
                )
                if boleto:
                    log_entry["boleto_match_strategy"] = "id_or_nosso_numero"
                    log_entry["boleto_match_value"] = candidate
                    break

        if not boleto and numero_operacao:
            op_qs = boleto_qs.filter(numero_operacao=str(numero_operacao)).order_by('-criado_em')
            op_count = op_qs.count()
            if op_count == 1:
                boleto = op_qs.first()
                log_entry["boleto_match_strategy"] = "numero_operacao_single_match"
            else:
                log_entry["numero_operacao_match_count"] = op_count

        if boleto:
            changed_fields = []

            if valor_pago_decimal is not None and boleto.valor_pago != valor_pago_decimal:
                boleto.valor_pago = valor_pago_decimal
                changed_fields.append('valor_pago')

            if data_pagamento and boleto.data_pagamento != data_pagamento:
                boleto.data_pagamento = data_pagamento
                changed_fields.append('data_pagamento')

            if status_boleto and boleto.status != status_boleto:
                boleto.status = status_boleto
                changed_fields.append('status')

            if numero_operacao and boleto.numero_operacao != str(numero_operacao):
                boleto.numero_operacao = str(numero_operacao)
                changed_fields.append('numero_operacao')

            boleto.payload_baixa = payload_obj
            changed_fields.append('payload_baixa')

            if changed_fields:
                boleto.save(update_fields=list(dict.fromkeys(changed_fields + ['atualizado_em'])))
            boleto_atualizado = boleto
            log_entry["boleto_id"] = boleto.id
            log_entry["boleto_status"] = boleto.status
            log_entry["boleto_encontrado"] = True
        else:
            log_entry["boleto_encontrado"] = False
            log_entry["identificadores_consultados"] = lookup_candidates
            log_entry["numero_operacao"] = numero_operacao
    except Exception as e:
        log_entry["erro_atualizacao_boleto"] = str(e)
        logger.exception("Erro ao atualizar boleto BB via webhook")

    # Log em arquivo local
    try:
        logs_dir = os.path.join(settings.BASE_DIR, 'logs')
        os.makedirs(logs_dir, exist_ok=True)
        logfile = os.path.join(logs_dir, 'webhook_bb.log')

        with open(logfile, 'a', encoding='utf-8') as f:
            f.write(json.dumps(log_entry, ensure_ascii=False) + '\n')
    except Exception as e:
        logger.warning("Não foi possível gravar log do webhook BB: %s", e)

    logger.info(
        "Webhook BB recebido: %s",
        {
            "evento": evento,
            "numero_convenio": numero_convenio,
            "nosso_numero": nosso_numero,
            "valor_pago": valor_pago,
            "data_evento": data_evento,
            "quantidade_itens": len(payload_items),
            "recebido_em": log_entry["recebido_em"],
            "ip": real_ip,
            "user_agent": log_entry["user_agent"],
            "boleto_encontrado": log_entry.get("boleto_encontrado"),
            "boleto_id": log_entry.get("boleto_id"),
            "boleto_status": log_entry.get("boleto_status"),
        }
    )

    return JsonResponse({
        "status": "ok",
        "boleto_encontrado": bool(boleto_atualizado),
        "boleto_id": getattr(boleto_atualizado, 'id', None),
    })
