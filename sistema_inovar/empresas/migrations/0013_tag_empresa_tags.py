from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('empresas', '0012_empresa_numero'),
    ]

    operations = [
        migrations.CreateModel(
            name='Tag',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nome', models.CharField(max_length=50, unique=True)),
                ('cor', models.CharField(default='#3B82F6', max_length=7)),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'tags',
                'ordering': ['nome'],
            },
        ),
        migrations.AddField(
            model_name='empresa',
            name='tags',
            field=models.ManyToManyField(blank=True, related_name='empresas', to='empresas.tag'),
        ),
    ]
