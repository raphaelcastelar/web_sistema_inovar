from django.db import migrations


def mover_para_principal(apps, schema_editor):
    PaginaSistema = apps.get_model('empresas', 'PaginaSistema')
    PaginaSistema.objects.filter(
        chave__in=['inicio', 'calendario'],
        secao='Controle',
    ).update(secao='Principal')


def voltar_para_controle(apps, schema_editor):
    PaginaSistema = apps.get_model('empresas', 'PaginaSistema')
    PaginaSistema.objects.filter(
        chave__in=['inicio', 'calendario'],
        secao='Principal',
    ).update(secao='Controle')


class Migration(migrations.Migration):
    dependencies = [
        ('empresas', '0026_atividade_blocoexecucao_atividade_ativ_resp_data_idx_and_more'),
    ]

    operations = [
        migrations.RunPython(mover_para_principal, voltar_para_controle),
    ]
