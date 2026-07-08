# Generated manually for faster Empresa search on PostgreSQL.

from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('empresas', '0018_boletobb_boleto_status_venc_idx_and_more'),
    ]

    operations = [
        TrigramExtension(),
        migrations.AddIndex(
            model_name='empresa',
            index=GinIndex(fields=['nome'], name='empresa_nome_trgm_idx', opclasses=['gin_trgm_ops']),
        ),
        migrations.AddIndex(
            model_name='empresa',
            index=GinIndex(fields=['cnpj'], name='empresa_cnpj_trgm_idx', opclasses=['gin_trgm_ops']),
        ),
        migrations.AddIndex(
            model_name='empresa',
            index=GinIndex(fields=['email'], name='empresa_email_trgm_idx', opclasses=['gin_trgm_ops']),
        ),
        migrations.AddIndex(
            model_name='empresa',
            index=GinIndex(fields=['telefone'], name='empresa_tel_trgm_idx', opclasses=['gin_trgm_ops']),
        ),
    ]
