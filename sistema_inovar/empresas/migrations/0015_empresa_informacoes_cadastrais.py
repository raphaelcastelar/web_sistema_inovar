from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('empresas', '0014_empresaavulsafaturamento'),
    ]

    operations = [
        migrations.AddField(
            model_name='empresa',
            name='regime_tributario',
            field=models.CharField(blank=True, choices=[('SIMPLES NACIONAL', 'Simples Nacional'), ('LUCRO REAL', 'Lucro Real'), ('LUCRO PRESUMIDO', 'Lucro Presumido'), ('OUTROS', 'Outros')], max_length=30, null=True),
        ),
        migrations.AddField(
            model_name='empresa',
            name='porte_empresa',
            field=models.CharField(blank=True, choices=[('MEI', 'MEI'), ('ME', 'ME'), ('EPP', 'EPP'), ('MEDIO PORTE', 'Medio Porte'), ('GRANDE PORTE', 'Grande Porte')], max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='empresa',
            name='carteira_clientes',
            field=models.CharField(blank=True, choices=[('INOVAR ES', 'Inovar ES'), ('INOVAR MG', 'Inovar MG'), ('NOVVA', 'Novva')], max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='empresa',
            name='grupo_atividade',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='empresa',
            name='anexo_simples',
            field=models.CharField(blank=True, choices=[('I', 'I'), ('II', 'II'), ('III', 'III'), ('IV', 'IV'), ('V', 'V')], max_length=3, null=True),
        ),
    ]
