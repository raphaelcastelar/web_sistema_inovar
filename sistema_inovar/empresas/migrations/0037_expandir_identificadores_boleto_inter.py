from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('empresas', '0036_simplesinstallmentsnapshot'),
    ]

    operations = [
        migrations.AlterField(
            model_name='boletobb',
            name='numero_titulo_cliente',
            field=models.CharField(max_length=64, unique=True),
        ),
        migrations.AlterField(
            model_name='boletobb',
            name='nosso_numero',
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True),
        ),
    ]
