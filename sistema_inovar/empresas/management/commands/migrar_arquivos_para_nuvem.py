import os
import subprocess
import unicodedata

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


def _sort_key(value):
    normalized = unicodedata.normalize('NFKD', str(value))
    return ''.join(character for character in normalized if not unicodedata.combining(character)).casefold()


def _source_directories(source, start_from=None):
    directories = sorted(
        (
            entry.name
            for entry in os.scandir(source)
            if entry.is_dir(follow_symlinks=False)
        ),
        key=_sort_key,
    )
    if start_from:
        start_key = _sort_key(start_from.strip())
        directories = [name for name in directories if _sort_key(name) >= start_key]
    return directories


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
        parser.add_argument(
            '--start-from',
            help=(
                'Processa uma pasta de empresa por vez, começando pelo prefixo informado '
                '(ex.: J). Reduz RAM e ignora alfabeticamente as anteriores.'
            ),
        )

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

        base_command = [
            'rsync',
            '--archive',
            '--human-readable',
            '--itemize-changes',
            '--partial',
            '--protect-args',
            '--no-links',
        ]
        if options['checksum']:
            base_command.append('--checksum')
        if not options['execute']:
            base_command.append('--dry-run')

        mode = 'CÓPIA REAL' if options['execute'] else 'SIMULAÇÃO'
        self.stdout.write(self.style.WARNING(f'{mode}: {source}/ -> {destination}/'))
        self.stdout.write('Nenhum arquivo será excluído em qualquer lado.')

        start_from = (options.get('start_from') or '').strip()
        if start_from:
            directories = _source_directories(source, start_from)
            if not directories:
                raise CommandError(f'Nenhuma pasta encontrada a partir de {start_from!r}.')
            self.stdout.write(
                f'Processamento por empresa a partir de {start_from!r}: '
                f'{len(directories)} pasta(s).'
            )
            for index, directory_name in enumerate(directories, 1):
                self.stdout.write(self.style.WARNING(
                    f'[{index}/{len(directories)}] {directory_name}'
                ))
                source_directory = os.path.join(source, directory_name)
                destination_directory = os.path.join(destination, directory_name)
                if options['execute']:
                    os.makedirs(destination_directory, exist_ok=True)
                self._run_rsync(
                    [*base_command, f'{source_directory}/', f'{destination_directory}/'],
                    directory_name,
                )
        else:
            self._run_rsync([*base_command, f'{source}/', f'{destination}/'], 'acervo completo')

        self.stdout.write(self.style.SUCCESS(f'{mode} concluída com sucesso.'))
        if not options['execute']:
            self.stdout.write(
                self.style.WARNING(f'Para executar: --execute --confirm={CONFIRMATION}')
            )

    @staticmethod
    def _run_rsync(command, description):
        try:
            subprocess.run(command, check=True)
        except FileNotFoundError as exc:
            raise CommandError('rsync não está instalado na Droplet.') from exc
        except subprocess.CalledProcessError as exc:
            raise CommandError(
                f'rsync falhou ao processar {description!r}, com código {exc.returncode}. '
                'Execute novamente começando por essa mesma pasta.'
            ) from exc
