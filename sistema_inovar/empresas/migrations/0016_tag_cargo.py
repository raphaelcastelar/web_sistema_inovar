from django.db import migrations, models


CARGOS = ('pessoal', 'fiscal', 'admin')


def duplicar_tags_existentes_por_cargo(apps, schema_editor):
    Tag = apps.get_model('empresas', 'Tag')
    Empresa = apps.get_model('empresas', 'Empresa')

    tags_originais = list(Tag.objects.filter(cargo__isnull=True).order_by('id'))
    if not tags_originais:
        return

    through_model = Empresa.tags.through

    for tag_original in tags_originais:
        empresas_ids = list(tag_original.empresas.values_list('id', flat=True))

        for cargo in CARGOS:
            tag_por_cargo, created = Tag.objects.get_or_create(
                nome=tag_original.nome,
                cargo=cargo,
                defaults={'cor': tag_original.cor},
            )
            if not created and tag_por_cargo.cor != tag_original.cor:
                tag_por_cargo.cor = tag_original.cor
                tag_por_cargo.save(update_fields=['cor'])

            novos_vinculos = [
                through_model(empresa_id=empresa_id, tag_id=tag_por_cargo.id)
                for empresa_id in empresas_ids
            ]
            through_model.objects.bulk_create(novos_vinculos, ignore_conflicts=True)

        tag_original.delete()


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('empresas', '0015_empresa_informacoes_cadastrais'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tag',
            name='nome',
            field=models.CharField(max_length=50),
        ),
        migrations.AddField(
            model_name='tag',
            name='cargo',
            field=models.CharField(
                blank=True,
                choices=[
                    ('pessoal', 'Departamento Pessoal'),
                    ('fiscal', 'Departamento Fiscal'),
                    ('admin', 'Administrador'),
                ],
                max_length=100,
                null=True,
            ),
        ),
        migrations.RunPython(duplicar_tags_existentes_por_cargo, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='tag',
            name='cargo',
            field=models.CharField(
                choices=[
                    ('pessoal', 'Departamento Pessoal'),
                    ('fiscal', 'Departamento Fiscal'),
                    ('admin', 'Administrador'),
                ],
                max_length=100,
            ),
        ),
        migrations.AddConstraint(
            model_name='tag',
            constraint=models.UniqueConstraint(fields=('nome', 'cargo'), name='unique_tag_nome_por_cargo'),
        ),
    ]
