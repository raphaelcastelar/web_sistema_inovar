from django.db import migrations


def add_type_and_normalize(apps, schema_editor):
    TipoDocumento = apps.get_model('empresas', 'TipoDocumento')
    DocumentoEmpresa = apps.get_model('empresas', 'DocumentoEmpresa')
    balance_type, _ = TipoDocumento.objects.update_or_create(
        codigo='balanco_anual',
        defaults={
            'nome': 'Balanço anual',
            'categoria': 'contabil',
            'folder_key': 'contabil_balanco_anual',
            'periodicidade': 'anual',
            'visivel_app_padrao': True,
            'ativo': True,
        },
    )
    DocumentoEmpresa.objects.filter(folder_key='contabil_balanco_anual').update(
        tipo_documento=balance_type,
    )
    for document in DocumentoEmpresa.objects.filter(
        tipo_documento__periodicidade='anual', competencia='', ano__isnull=False,
    ).iterator(chunk_size=500):
        document.competencia = str(document.ano)
        document.save(update_fields=['competencia'])


class Migration(migrations.Migration):
    dependencies = [('empresas', '0034_document_metadata')]
    operations = [migrations.RunPython(add_type_and_normalize, migrations.RunPython.noop)]
