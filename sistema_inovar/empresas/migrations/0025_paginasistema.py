from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('empresas', '0024_normalizar_periodos_documento_empresa'),
    ]

    operations = [
        migrations.CreateModel(
            name='PaginaSistema',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('chave', models.SlugField(max_length=60, unique=True)),
                ('nome', models.CharField(max_length=100)),
                ('rota', models.CharField(max_length=160)),
                ('secao', models.CharField(max_length=60)),
                ('descricao', models.CharField(blank=True, default='', max_length=255)),
                ('ativa', models.BooleanField(default=True)),
                ('permite_admin', models.BooleanField(default=True)),
                ('permite_fiscal', models.BooleanField(default=True)),
                ('permite_pessoal', models.BooleanField(default=True)),
                ('gerenciavel', models.BooleanField(default=True)),
                ('ordem', models.PositiveSmallIntegerField(default=0)),
                ('atualizado_em', models.DateTimeField(auto_now=True)),
                ('atualizado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='paginas_atualizadas', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Página do sistema',
                'verbose_name_plural': 'Páginas do sistema',
                'ordering': ['ordem', 'nome'],
            },
        ),
    ]
