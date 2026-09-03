import os
import subprocess

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


CONFIRMATION = 'COPIAR_ARQUIVOS_PARA_DROPLET'


def _safe_directory(value, label, must_exist=True):
    path = os.path.realpath(str(value or ''))
    if not path or path in (os.path.sep, '/mnt', '/srv'):
        raise CommandError(f'{label} inseguro: {path!r}')
    if must_exist and not os.path.isdir(path):
        raise CommandError(f'{label} não existe ou não está acessível: {path!r}')
    return path


class Command(BaseCommand):
    help = (
        'Copia o acervo do servidor físico para a Droplet usando rsync. '
        'Por padrão apenas simula; nunca apaga a origem ou o destino.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--source', help='Origem física; padrão: MEDIA_ROOT ativo.')
        parser.add_argument('--destination', help='Destino na Droplet; padrão: CLOUD_MEDIA_ROOT.')
        parser.add_argument('--execute', action='store_true', help='Executa a cópia; sem esta opção usa dry-run.')
        parser.add_argument('--confirm', default='', help=f'Confirmação obrigatória: {CONFIRMATION}')
        parser.add_argument('--checksum', action='store_true', help='Compara conteúdo integral; mais lento no SMB.')

    def handle(self, *args, **options):
        source = _safe_directory(options.get('source') or settings.MEDIA_ROOT, 'Origem')
        destination = _safe_directory(
            options.get('destination') or settings.CLOUD_MEDIA_ROOT,
            'Destino',
            must_exist=options['execute'],
        )
        if source == destination:
            raise CommandError('Origem e destino não podem ser iguais.')
        if os.path.commonpath((source, destination)) in (source, destination):
            raise CommandError('Origem e destino não podem estar contidos um no outro.')

        if options['execute'] and options['confirm'] != CONFIRMATION:
            raise CommandError(f'Para copiar, use --execute --confirm={CONFIRMATION}')

        command = [
            'rsync',
            '--archive',
            '--human-readable',
            '--itemize-changes',
            '--partial',
            '--protect-args',
            '--no-links',
        ]
        if options['checksum']:
            command.append('--checksum')
        if not options['execute']:
            command.append('--dry-run')
        command.extend((f'{source}/', f'{destination}/'))

        mode = 'CÓPIA REAL' if options['execute'] else 'SIMULAÇÃO'
        self.stdout.write(self.style.WARNING(f'{mode}: {source}/ -> {destination}/'))
        self.stdout.write('Nenhum arquivo será excluído em qualquer lado.')
        try:
            subprocess.run(command, check=True)
        except FileNotFoundError as exc:
            raise CommandError('rsync não está instalado na Droplet.') from exc
        except subprocess.CalledProcessError as exc:
            raise CommandError(f'rsync terminou com código {exc.returncode}.') from exc

        self.stdout.write(self.style.SUCCESS(f'{mode} concluída com sucesso.'))
        if not options['execute']:
            self.stdout.write(
                self.style.WARNING(f'Para executar: --execute --confirm={CONFIRMATION}')
            )

