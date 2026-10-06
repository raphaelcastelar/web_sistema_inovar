from datetime import datetime
from zoneinfo import ZoneInfo

from django.db import migrations, models


DATA_INICIAL_EMPRESAS_EXISTENTES = datetime(
    2026,
    10,
    1,
    tzinfo=ZoneInfo('America/Sao_Paulo'),
)


def iniciar_historico_das_empresas_existentes(apps, schema_editor):
    Empresa = apps.get_model('empresas', 'Empresa')
    HistoricoStatusEmpresa = apps.get_model('empresas', 'HistoricoStatusEmpresa')

    # As empresas já existentes começam em 01/10/2026. As próximas recebem
    # automaticamente a data real em que forem cadastradas.
    Empresa.objects.all().update(criado_em=DATA_INICIAL_EMPRESAS_EXISTENTES)

    HistoricoStatusEmpresa.objects.filter(novo_status=True).update(tipo='ATIVACAO')
    HistoricoStatusEmpresa.objects.filter(novo_status=False).update(tipo='DESATIVACAO')

    HistoricoStatusEmpresa.objects.bulk_create([
        HistoricoStatusEmpresa(
            empresa_id=empresa_id,
            tipo='CADASTRO',
            status_anterior=None,
            novo_status=ativo is not False,
            alterado_em=DATA_INICIAL_EMPRESAS_EXISTENTES,
        )
        for empresa_id, ativo in Empresa.objects.values_list('id', 'ativo')
    ])


class Migration(migrations.Migration):
    dependencies = [('empresas', '0028_adicionar_pagina_tarefas')]

    operations = [
        migrations.AddField(
            model_name='historicostatusempresa',
            name='tipo',
            field=models.CharField(
                choices=[
                    ('CADASTRO', 'Cadastro'),
                    ('ATIVACAO', 'Ativação'),
                    ('DESATIVACAO', 'Desativação'),
                ],
                default='CADASTRO',
                max_length=12,
            ),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name='historicostatusempresa',
            name='status_anterior',
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.RunPython(
            iniciar_historico_das_empresas_existentes,
            migrations.RunPython.noop,
        ),
    ]
