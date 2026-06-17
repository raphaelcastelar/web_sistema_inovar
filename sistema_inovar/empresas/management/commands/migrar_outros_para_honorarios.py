import os
import shutil
import unidecode

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, transaction
from django.utils import timezone

from empresas.models import Outros


def normalize_folder_name(value):
    return unidecode.unidecode(str(value or '')).strip().upper()


def relative_media_path(media_root, path):
    return os.path.relpath(path, media_root).replace(os.sep, '/')


def unique_destination(destination, reserved_paths):
    candidate = destination
    stem, extension = os.path.splitext(destination)
    counter = 1

    while os.path.exists(candidate) or candidate in reserved_paths:
        candidate = f'{stem}_{counter}{extension}'
        counter += 1

    reserved_paths.add(candidate)
    return candidate


class Command(BaseCommand):
    help = (
        'Transforma as pastas OUTROS em HONORARIOS, cria a estrutura anual/mensal '
        'e move todos os arquivos encontrados para o mes atual.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Mostra as alteracoes sem criar pastas, mover arquivos ou atualizar o banco.',
        )
        parser.add_argument(
            '--media-root',
            help='Sobrescreve o MEDIA_ROOT configurado. Util para testes locais.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        media_root = os.path.abspath(options.get('media_root') or settings.MEDIA_ROOT)

        if not os.path.isdir(media_root):
            raise CommandError(f'MEDIA_ROOT nao encontrado ou inacessivel: {media_root}')

        if not dry_run:
            self.validate_database_migration()

        today = timezone.localdate()
        current_year = str(today.year)
        current_month = f'{today.month:02d}'
        current_month_folder = f'{current_month}{current_year}'

        totals = {
            'companies': 0,
            'folders': 0,
            'files': 0,
            'records': 0,
            'errors': 0,
        }

        self.stdout.write(
            f'Procurando pastas OUTROS em {media_root}. '
            f'Destino dos arquivos: HONORARIOS/{current_year}/{current_month_folder}'
        )
        if dry_run:
            self.stdout.write(self.style.WARNING('Modo dry-run: nenhuma alteracao sera aplicada.'))

        try:
            company_entries = sorted(os.scandir(media_root), key=lambda entry: entry.name.lower())
        except OSError as exc:
            raise CommandError(f'Nao foi possivel listar o MEDIA_ROOT: {exc}') from exc

        for company_entry in company_entries:
            if not company_entry.is_dir(follow_symlinks=False):
                continue

            company_path = company_entry.path
            try:
                child_entries = list(os.scandir(company_path))
            except OSError as exc:
                totals['errors'] += 1
                self.stderr.write(self.style.ERROR(f'Erro ao listar {company_path}: {exc}'))
                continue

            source_folders = [
                entry.path
                for entry in child_entries
                if entry.is_dir(follow_symlinks=False)
                and normalize_folder_name(entry.name) == 'OUTROS'
            ]
            if not source_folders:
                continue

            totals['companies'] += 1
            totals['folders'] += len(source_folders)

            honorarios_entry = next(
                (
                    entry
                    for entry in child_entries
                    if entry.is_dir(follow_symlinks=False)
                    and normalize_folder_name(entry.name) == 'HONORARIOS'
                ),
                None,
            )
            honorarios_path = (
                honorarios_entry.path
                if honorarios_entry
                else os.path.join(company_path, 'HONORARIOS')
            )
            current_month_path = os.path.join(
                honorarios_path,
                current_year,
                current_month_folder,
            )

            self.stdout.write(f'\nEmpresa/pasta: {company_entry.name}')
            if not dry_run:
                self.create_year_month_structure(honorarios_path, current_year)

            reserved_paths = set()
            for source_folder in source_folders:
                self.migrate_source_folder(
                    media_root=media_root,
                    source_folder=source_folder,
                    destination_folder=current_month_path,
                    current_year=current_year,
                    current_month=current_month,
                    reserved_paths=reserved_paths,
                    totals=totals,
                    dry_run=dry_run,
                )

        summary = (
            f"Concluido: {totals['companies']} empresa(s), "
            f"{totals['folders']} pasta(s) OUTROS, "
            f"{totals['files']} arquivo(s) e "
            f"{totals['records']} registro(s) atualizado(s)."
        )
        if totals['errors']:
            summary += f" Erros: {totals['errors']}."

        style = self.style.WARNING if dry_run else self.style.SUCCESS
        self.stdout.write(style(f'\n{summary}'))

    def validate_database_migration(self):
        try:
            Outros.objects.only('id', 'ano', 'mes').first()
        except DatabaseError as exc:
            raise CommandError(
                'A migracao da estrutura de Honorarios ainda nao foi aplicada. '
                'Execute "python manage.py migrate" antes deste comando.'
            ) from exc

    def create_year_month_structure(self, honorarios_path, year):
        year_path = os.path.join(honorarios_path, year)
        for month in range(1, 13):
            month_folder = f'{month:02d}{year}'
            os.makedirs(os.path.join(year_path, month_folder), exist_ok=True)

    def migrate_source_folder(
        self,
        *,
        media_root,
        source_folder,
        destination_folder,
        current_year,
        current_month,
        reserved_paths,
        totals,
        dry_run,
    ):
        source_files = []
        for current_path, _, filenames in os.walk(source_folder):
            for filename in filenames:
                source_files.append(os.path.join(current_path, filename))

        for source_path in sorted(source_files):
            destination_path = unique_destination(
                os.path.join(destination_folder, os.path.basename(source_path)),
                reserved_paths,
            )
            old_relative_path = relative_media_path(media_root, source_path)
            new_relative_path = relative_media_path(media_root, destination_path)

            self.stdout.write(f'  {old_relative_path} -> {new_relative_path}')
            totals['files'] += 1

            if dry_run:
                continue

            try:
                os.makedirs(destination_folder, exist_ok=True)
                shutil.move(source_path, destination_path)
                with transaction.atomic():
                    updated = Outros.objects.filter(
                        caminho_arquivo=old_relative_path
                    ).update(
                        caminho_arquivo=new_relative_path,
                        ano=current_year,
                        mes=current_month,
                    )
                totals['records'] += updated
            except Exception as exc:
                totals['errors'] += 1
                self.stderr.write(
                    self.style.ERROR(f'  Erro ao mover {old_relative_path}: {exc}')
                )

        if dry_run:
            return

        self.remove_empty_directories(source_folder)

    def remove_empty_directories(self, source_folder):
        for current_path, _, _ in os.walk(source_folder, topdown=False):
            try:
                os.rmdir(current_path)
            except OSError:
                pass

        if os.path.exists(source_folder):
            remaining_files = sum(
                len(filenames)
                for _, _, filenames in os.walk(source_folder)
            )
            if remaining_files:
                self.stdout.write(
                    self.style.WARNING(
                        f'  Pasta mantida porque ainda possui {remaining_files} arquivo(s): '
                        f'{source_folder}'
                    )
                )
            return

        self.stdout.write(self.style.SUCCESS(f'  Pasta removida: {source_folder}'))
