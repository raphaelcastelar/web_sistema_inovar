from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('empresas', '0010_alter_funcionario_cargo'),  # Substitua pelo nome da última migração
        ('auth', '0001_initial'),  # Dependência de auth_permission
    ]

    operations = [
        migrations.RunSQL(
            """
            CREATE TABLE IF NOT EXISTS empresas_funcionario_user_permissions (
                id SERIAL PRIMARY KEY,
                funcionario_id INTEGER NOT NULL REFERENCES empresas_funcionario(id) ON DELETE CASCADE,
                permission_id INTEGER NOT NULL REFERENCES auth_permission(id) ON DELETE CASCADE,
                UNIQUE (funcionario_id, permission_id)
            );
            """,
            reverse_sql="DROP TABLE IF EXISTS empresas_funcionario_user_permissions;"
        ),
    ]