from collections import defaultdict

from django.db import migrations


PLAIN_FOLDER_KEYS = {
    'constitutivos_societario',
    'constitutivos_inscricoes',
    'constitutivos_outros',
    'outros',
}

ANNUAL_FOLDER_KEYS = {
    'fiscal_declaracoes',
    'contabil_balanco_anual',
}


def _normalized_period(document):
    year = str(document.ano or '').strip() or None
    month = str(document.mes or '').strip()

    if document.folder_key in PLAIN_FOLDER_KEYS:
        return None, None
    if document.folder_key in ANNUAL_FOLDER_KEYS:
        return year, None

    if month.isdigit() and 1 <= int(month) <= 12:
        month = f'{int(month):02d}'
    else:
        month = None
    return year, month


def normalize_periods_and_remove_duplicates(apps, schema_editor):
    DocumentoEmpresa = apps.get_model('empresas', 'DocumentoEmpresa')
    groups = defaultdict(list)

    for document in DocumentoEmpresa.objects.all().order_by('id').iterator():
        year, month = _normalized_period(document)
        key = (
            document.empresa_id,
            document.folder_key,
            document.nome_arquivo,
            year,
            month,
        )
        groups[key].append((document, year, month))

    for entries in groups.values():
        exact_entries = [
            entry for entry in entries
            if entry[0].ano == entry[1] and entry[0].mes == entry[2]
        ]
        canonical, year, month = (exact_entries or entries)[0]
        duplicates = [entry[0] for entry in entries if entry[0].pk != canonical.pk]

        if any(document.entregue for document in duplicates) and not canonical.entregue:
            canonical.entregue = True

        if duplicates:
            DocumentoEmpresa.objects.filter(
                pk__in=[document.pk for document in duplicates]
            ).delete()

        update_fields = []
        if canonical.ano != year:
            canonical.ano = year
            update_fields.append('ano')
        if canonical.mes != month:
            canonical.mes = month
            update_fields.append('mes')
        if canonical.entregue and 'entregue' not in update_fields:
            update_fields.append('entregue')
        if update_fields:
            canonical.save(update_fields=update_fields)


class Migration(migrations.Migration):

    dependencies = [
        ('empresas', '0023_documento_empresa_nova_estrutura'),
    ]

    operations = [
        migrations.RunPython(
            normalize_periods_and_remove_duplicates,
            migrations.RunPython.noop,
        ),
    ]
