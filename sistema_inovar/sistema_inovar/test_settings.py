from .settings import *  # noqa: F403


DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# Chave usada somente nos testes automatizados.
MONITOR_FISCAL_CHAVE_CRIPTOGRAFIA = 'q0ZPq0YQ2x8n7pD1u3ZcV6m9Kc2bW4eT8rL5sJ0aA1E='
MONITOR_FISCAL_EXECUCOES_PARALELAS = 1
