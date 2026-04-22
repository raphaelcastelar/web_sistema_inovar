from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('empresas', '0013_tag_empresa_tags'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmpresaAvulsaFaturamento',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nome', models.CharField(max_length=255)),
                ('cnpj', models.CharField(blank=True, max_length=18, null=True)),
                ('inscricao_estadual', models.CharField(blank=True, max_length=50, null=True)),
                ('endereco', models.CharField(blank=True, max_length=255, null=True)),
                ('numero', models.CharField(blank=True, max_length=20, null=True)),
                ('bairro', models.CharField(blank=True, max_length=100, null=True)),
                ('cidade', models.CharField(blank=True, max_length=100, null=True)),
                ('uf', models.CharField(blank=True, max_length=2, null=True)),
                ('cep', models.CharField(blank=True, max_length=9, null=True)),
                ('regime', models.CharField(default='Simples Nacional', max_length=50)),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('atualizado_em', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'empresas_avulsas_faturamento',
                'ordering': ['nome'],
            },
        ),
    ]
