from django.core.management.base import BaseCommand, CommandError

from empresas.inter_service import (
    InterAPIError,
    InterConfigurationError,
    get_access_token,
    reset_token_cache,
)


class Command(BaseCommand):
    help = 'Testa OAuth e mTLS do Banco Inter sem criar ou alterar cobrancas.'

    def handle(self, *args, **options):
        reset_token_cache()
        try:
            token = get_access_token()
        except (InterAPIError, InterConfigurationError) as exc:
            status_code = getattr(exc, 'status_code', None)
            suffix = f' (HTTP {status_code})' if status_code else ''
            raise CommandError(f'Falha na conexao com o Banco Inter{suffix}: {exc}') from exc

        if not token:
            raise CommandError('O Banco Inter retornou um token vazio.')
        self.stdout.write(self.style.SUCCESS('INTER_OAUTH_MTLS_OK'))
