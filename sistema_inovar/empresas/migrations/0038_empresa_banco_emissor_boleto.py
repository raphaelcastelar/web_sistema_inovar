from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('empresas', '0037_expandir_identificadores_boleto_inter'),
    ]

    operations = [
        migrations.AddField(
            model_name='empresa',
            name='banco_emissor_boleto',
            field=models.CharField(
                choices=[
                    ('INTER', 'Banco Inter'),
                    ('BANCO_DO_BRASIL', 'Banco do Brasil'),
                ],
                default='INTER',
                db_default='INTER',
                help_text='Banco usado para emitir os boletos de honorários desta empresa',
                max_length=20,
            ),
        ),
    ]
