from io import BytesIO
from pathlib import Path

from PyPDF2 import PdfReader, PdfWriter
from PyPDF2.generic import ArrayObject, NameObject


ASSETS_DIR = Path(__file__).resolve().parent / 'assets'
TEMPLATE_COM_DESCONTO = ASSETS_DIR / 'proposta_comercial_com_desconto.pdf'
TEMPLATE_SEM_DESCONTO = ASSETS_DIR / 'proposta_comercial_sem_desconto.pdf'


def build_proposta_comercial_pdf(field_values, com_desconto=False):
    """Preenche o modelo sem achatar os campos, mantendo o PDF editavel."""
    template_path = TEMPLATE_COM_DESCONTO if com_desconto else TEMPLATE_SEM_DESCONTO
    reader = PdfReader(str(template_path))
    writer = PdfWriter()
    writer.append(reader)
    writer.set_need_appearances_writer()

    form_fields = ArrayObject()
    for page in writer.pages:
        form_fields.extend(page.get('/Annots', []))
    writer._root_object['/AcroForm'][NameObject('/Fields')] = form_fields

    for page in writer.pages:
        writer.update_page_form_field_values(page, field_values)

    writer.add_metadata({
        '/Title': 'Proposta Comercial de Honorarios',
        '/Author': 'Inovar Contabilidade',
    })
    output = BytesIO()
    writer.write(output)
    return output.getvalue()
