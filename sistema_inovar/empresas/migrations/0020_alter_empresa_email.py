from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('empresas', '0019_empresa_pg_trgm_indexes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='empresa',
            name='email',
            field=models.EmailField(blank=True, default='', max_length=255),
        ),
    ]
