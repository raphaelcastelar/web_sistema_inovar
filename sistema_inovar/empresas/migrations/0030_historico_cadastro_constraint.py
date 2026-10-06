from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('empresas', '0029_historico_cadastro_empresa')]

    operations = [
        migrations.AddConstraint(
            model_name='historicostatusempresa',
            constraint=models.UniqueConstraint(
                condition=models.Q(tipo='CADASTRO'),
                fields=('empresa',),
                name='uma_data_cadastro_por_empresa',
            ),
        ),
    ]
