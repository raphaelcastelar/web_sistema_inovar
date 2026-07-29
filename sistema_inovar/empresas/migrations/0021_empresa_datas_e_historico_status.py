import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


def preencher_datas_e_historico(apps, schema_editor):
    Empresa = apps.get_model('empresas', 'Empresa')
    HistoricoStatusEmpresa = apps.get_model('empresas', 'HistoricoStatusEmpresa')
    data_implantacao = django.utils.timezone.now()

    Empresa.objects.filter(criado_em__isnull=True).update(criado_em=data_implantacao)
    empresas_inativas = Empresa.objects.filter(ativo=False)
    empresas_inativas.filter(desativado_em__isnull=True).update(desativado_em=data_implantacao)

    HistoricoStatusEmpresa.objects.bulk_create([
        HistoricoStatusEmpresa(
            empresa_id=empresa_id,
            status_anterior=True,
            novo_status=False,
            alterado_em=data_implantacao,
        )
        for empresa_id in empresas_inativas.values_list('id', flat=True)
    ])


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('empresas', '0020_alter_empresa_email'),
    ]

    operations = [
        migrations.AddField(
            model_name='empresa',
            name='criado_em',
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='empresa',
            name='desativado_em',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='HistoricoStatusEmpresa',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status_anterior', models.BooleanField()),
                ('novo_status', models.BooleanField()),
                ('alterado_em', models.DateTimeField(default=django.utils.timezone.now)),
                ('alterado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='alteracoes_status_empresa', to=settings.AUTH_USER_MODEL)),
                ('empresa', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='historico_status', to='empresas.empresa')),
            ],
            options={
                'ordering': ['-alterado_em', '-id'],
            },
        ),
        migrations.RunPython(preencher_datas_e_historico, migrations.RunPython.noop),
        migrations.AddIndex(
            model_name='historicostatusempresa',
            index=models.Index(fields=['empresa', '-alterado_em'], name='hist_status_empresa_data_idx'),
        ),
    ]
