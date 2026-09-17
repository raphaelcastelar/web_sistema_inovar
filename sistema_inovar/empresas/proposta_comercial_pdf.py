from io import BytesIO
from pathlib import Path

from PyPDF2 import PdfReader, PdfWriter
from PyPDF2.generic import NameObject
import reportlab
from reportlab.lib.colors import HexColor, black, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ASSETS_DIR = Path(__file__).resolve().parent / 'assets'
TEMPLATE_COM_DESCONTO = ASSETS_DIR / 'proposta_comercial_com_desconto.pdf'
TEMPLATE_SEM_DESCONTO = ASSETS_DIR / 'proposta_comercial_sem_desconto.pdf'

REPORTLAB_FONTS_DIR = Path(reportlab.__file__).resolve().parent / 'fonts'
pdfmetrics.registerFont(TTFont('ProposalSans', str(REPORTLAB_FONTS_DIR / 'Vera.ttf')))
pdfmetrics.registerFont(TTFont('ProposalSans-Bold', str(REPORTLAB_FONTS_DIR / 'VeraBd.ttf')))

AMOUNT_FIELDS = {'hon_contabil_fiscal', 'hon_pessoal', 'hon_desconto', 'hon_total'}
FONT_SIZES = {
    'cf_faixa': 8,
    'cf_grupo': 8,
    'dp_funcionarios': 8,
    'dp_faixa': 8,
    'desconto_descricao': 8,
    'hon_contabil_fiscal': 11,
    'hon_pessoal': 11,
    'hon_desconto': 11,
    'hon_total': 13,
}


def _fit_font_size(text, font_name, preferred_size, available_width):
    size = preferred_size
    while size > 5.5 and stringWidth(text, font_name, size) > available_width:
        size -= 0.25
    return size


def _draw_field(overlay, name, rect, value):
    x1, y1, x2, y2 = [float(item) for item in rect]
    width = x2 - x1
    height = y2 - y1
    sidebar = x2 <= 150
    total = name == 'hon_total'

    if sidebar:
        fill_color = HexColor('#1d1d1d')
        stroke_color = HexColor('#494949')
        text_color = white
    else:
        fill_color = white if total else HexColor('#f3f3f3')
        stroke_color = black if total else HexColor('#c4c4c4')
        text_color = black if total else HexColor('#262626')

    overlay.setFillColor(fill_color)
    overlay.setStrokeColor(stroke_color)
    overlay.setLineWidth(0.65)
    overlay.rect(x1, y1, width, height, fill=1, stroke=1)

    text = str(value or '').strip()
    if not text:
        return

    font_name = 'ProposalSans-Bold' if total else 'ProposalSans'
    preferred_size = FONT_SIZES.get(name, 9)
    horizontal_padding = 3
    font_size = _fit_font_size(text, font_name, preferred_size, width - (horizontal_padding * 2))
    text_y = y1 + ((height - font_size) / 2) + 1.5

    overlay.setFillColor(text_color)
    overlay.setFont(font_name, font_size)
    if name in AMOUNT_FIELDS:
        overlay.drawRightString(x2 - horizontal_padding, text_y, text)
    else:
        overlay.drawString(x1 + horizontal_padding, text_y, text)


def build_proposta_comercial_pdf(field_values, com_desconto=False):
    template_path = TEMPLATE_COM_DESCONTO if com_desconto else TEMPLATE_SEM_DESCONTO
    reader = PdfReader(str(template_path))
    page = reader.pages[0]
    page_width = float(page.mediabox.width)
    page_height = float(page.mediabox.height)

    overlay_buffer = BytesIO()
    overlay = canvas.Canvas(overlay_buffer, pagesize=(page_width, page_height))

    for annotation_ref in page.get('/Annots', []):
        annotation = annotation_ref.get_object()
        field_name = str(annotation.get('/T') or '')
        if field_name in field_values:
            _draw_field(overlay, field_name, annotation.get('/Rect'), field_values[field_name])

    overlay.save()
    overlay_buffer.seek(0)
    overlay_page = PdfReader(overlay_buffer).pages[0]
    page.merge_page(overlay_page)

    if '/Annots' in page:
        del page[NameObject('/Annots')]

    output = BytesIO()
    writer = PdfWriter()
    writer.add_page(page)
    writer.add_metadata({
        '/Title': 'Proposta Comercial de Honorarios',
        '/Author': 'Inovar Contabilidade',
    })
    writer.write(output)
    return output.getvalue()
