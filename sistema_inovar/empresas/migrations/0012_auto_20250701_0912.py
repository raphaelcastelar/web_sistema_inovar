from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('empresas', '0011_auto_20250701_0910'),  # Substitua pelo nome da última migração
        ('auth', '0001_initial'),  # Dependência de auth_group
    ]

    operations = [
        migrations.RunSQL(
            """
            CREATE TABLE IF NOT EXISTS empresas_funcionario_groups (
                id SERIAL PRIMARY KEY,
                funcionario_id INTEGER NOT NULL REFERENCES empresas_funcionario(id) ON DELETE CASCADE,
                group_id INTEGER NOT NULL REFERENCES auth_group(id) ON DELETE CASCADE,
                UNIQUE (funcionario_id, group_id)
            );
            """,
            reverse_sql="DROP TABLE IF EXISTS empresas_funcionario_groups;"
        ),
    ]