from django.db import migrations


def adicionar_pagina_tarefas(apps, schema_editor):
    PaginaSistema = apps.get_model('empresas', 'PaginaSistema')
    PaginaSistema.objects.update_or_create(
        chave='tarefas',
        defaults={
            'nome': 'Tarefas',
            'rota': '/tarefas',
            'secao': 'Principal',
            'descricao': 'Organização das atividades por estado, prazo e responsável.',
            'ordem': 2,
            'gerenciavel': True,
            'ativa': True,
        },
    )


def remover_pagina_tarefas(apps, schema_editor):
    apps.get_model('empresas', 'PaginaSistema').objects.filter(chave='tarefas').delete()


class Migration(migrations.Migration):
    dependencies = [('empresas', '0027_mover_inicio_calendario_para_principal')]
    operations = [migrations.RunPython(adicionar_pagina_tarefas, remover_pagina_tarefas)]
