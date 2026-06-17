from django.db import migrations, models
import empresas.models


class Migration(migrations.Migration):

    dependencies = [
        ('empresas', '0016_tag_cargo'),
    ]

    operations = [
        migrations.AddField(
            model_name='outros',
            name='ano',
            field=models.CharField(blank=True, max_length=4, null=True),
        ),
        migrations.AddField(
            model_name='outros',
            name='cnpj_empresa',
            field=models.CharField(blank=True, max_length=18, null=True),
        ),
        migrations.AddField(
            model_name='outros',
            name='mes',
            field=models.CharField(blank=True, max_length=2, null=True),
        ),
        migrations.AlterField(
            model_name='outros',
            name='caminho_arquivo',
            field=models.FileField(max_length=500, upload_to=empresas.models.outros_upload_path),
        ),
    ]
