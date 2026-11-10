from django.core.management.base import BaseCommand, CommandError

from empresas.inter_service import (
    InterAPIError,
    InterConfigurationError,
    configure_webhook,
)


class Command(BaseCommand):
    help = 'Cadastra a URL publica do webhook da API Cobranca v3 do Banco Inter.'

    def add_arguments(self, parser):
        parser.add_argument('--url', required=True, help='URL HTTPS publica do webhook Inter.')

    def handle(self, *args, **options):
        webhook_url = options['url'].strip()
        if not webhook_url.lower().startswith('https://'):
            raise CommandError('A URL do webhook precisa usar HTTPS.')
        try:
            configure_webhook(webhook_url)
        except (InterAPIError, InterConfigurationError) as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS('Webhook do Banco Inter configurado com sucesso.'))
