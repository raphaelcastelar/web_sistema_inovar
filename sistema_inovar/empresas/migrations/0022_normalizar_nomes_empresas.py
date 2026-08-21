import re

from django.db import migrations
from unidecode import unidecode


def normalizar(value):
    value = unidecode(str(value or ''))
    value = re.sub(r'[<>:"/\\|?*\x00-\x1F]', '', value)
    return re.sub(r'\s+', ' ', value).strip().upper()


def normalizar_nomes_existentes(apps, schema_editor):
    Empresa = apps.get_model('empresas', 'Empresa')
    modelos_documentos = [
        apps.get_model('empresas', 'DocumentosConstitutivos'),
        apps.get_model('empresas', 'XML'),
        apps.get_model('empresas', 'DepartamentoPessoal'),
        apps.get_model('empresas', 'SimplesNacional'),
        apps.get_model('empresas', 'Outros'),
    ]

    for empresa in Empresa.objects.all().iterator():
        nome_antigo = empresa.nome
        nome_novo = normalizar(nome_antigo)
        if not nome_novo or nome_novo == nome_antigo:
            continue

        for model in modelos_documentos:
            model.objects.filter(nome_empresa=nome_antigo).update(nome_empresa=nome_novo)
        Empresa.objects.filter(pk=empresa.pk).update(nome=nome_novo)


class Migration(migrations.Migration):
    dependencies = [
        ('empresas', '0021_empresa_datas_e_historico_status'),
    ]

    operations = [
        migrations.RunPython(normalizar_nomes_existentes, migrations.RunPython.noop),
    ]
