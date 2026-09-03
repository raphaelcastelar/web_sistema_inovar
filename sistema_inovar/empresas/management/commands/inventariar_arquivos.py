import json
import os
import shutil
from collections import Counter
from datetime import datetime, timezone

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


DOCUMENT_MODELS = (
    'DocumentoEmpresa',
    'DocumentosConstitutivos',
    'DepartamentoPessoal',
    'SimplesNacional',
    'XML',
    'Outros',
)
SAMPLE_LIMIT = 100


def _relative_path(media_root, value):
    """Normaliza o nome armazenado no FileField sem aceitar saída do MEDIA_ROOT."""
    raw_value = str(value or '').replace('\\', '/')
    if not raw_value:
        return None

    if os.path.isabs(raw_value):
        real_value = os.path.realpath(raw_value)
        try:
            if os.path.commonpath((media_root, real_value)) != media_root:
                return None
        except ValueError:
            return None
        raw_value = os.path.relpath(real_value, media_root)

    normalized = os.path.normpath(raw_value).replace('\\', '/')
    if normalized in ('', '.') or normalized == '..' or normalized.startswith('../'):
        return None
    return normalized


def scan_media_root(media_root):
    """Percorre o armazenamento sem seguir links e sem modificar seu conteúdo."""
    files = {}
    extensions = Counter()
    errors = []
    symlinks = []
    directories = 0

    def onerror(exc):
        errors.append(f'{getattr(exc, "filename", media_root)}: {exc}')

    for current_root, directory_names, filenames in os.walk(
        media_root, topdown=True, followlinks=False, onerror=onerror,
    ):
        safe_directories = []
        for directory_name in directory_names:
            full_path = os.path.join(current_root, directory_name)
            if os.path.islink(full_path):
                if len(symlinks) < SAMPLE_LIMIT:
                    symlinks.append(os.path.relpath(full_path, media_root).replace(os.sep, '/'))
                continue
            safe_directories.append(directory_name)
        directory_names[:] = safe_directories
        directories += len(safe_directories)

        for filename in filenames:
            full_path = os.path.join(current_root, filename)
            relative = os.path.relpath(full_path, media_root).replace(os.sep, '/')
            if os.path.islink(full_path):
                if len(symlinks) < SAMPLE_LIMIT:
                    symlinks.append(relative)
                continue
            try:
                stat = os.stat(full_path, follow_symlinks=False)
            except OSError as exc:
                if len(errors) < SAMPLE_LIMIT:
                    errors.append(f'{relative}: {exc}')
                continue
            files[relative] = {'size': stat.st_size, 'mtime': stat.st_mtime}
            extension = os.path.splitext(filename)[1].lower() or '[sem extensão]'
            extensions[extension] += 1

    return {
        'directories': directories,
        'files': files,
        'extensions': dict(extensions.most_common()),
        'errors': errors,
        'symlinks': symlinks,
    }


class Command(BaseCommand):
    help = (
        'Inventaria arquivos e registros documentais sem alterar banco ou filesystem. '
        'Pode ser executado com o sistema em funcionamento.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--media-root',
            help='Origem a analisar. O padrão é o MEDIA_ROOT atualmente ativo.',
        )
        parser.add_argument(
            '--output',
            help='Grava opcionalmente o relatório JSON neste arquivo local.',
        )
        parser.add_argument(
            '--skip-database',
            action='store_true',
            help='Não compara o inventário com os registros de documentos do banco.',
        )

    def handle(self, *args, **options):
        media_root = os.path.realpath(options.get('media_root') or settings.MEDIA_ROOT)
        if not media_root or media_root == os.path.sep or not os.path.isdir(media_root):
            raise CommandError(f'MEDIA_ROOT inválido, inseguro ou não montado: {media_root!r}')

        self.stdout.write(f'Inventário somente leitura iniciado em: {media_root}')
        scan = scan_media_root(media_root)
        filesystem_paths = set(scan['files'])
        total_bytes = sum(item['size'] for item in scan['files'].values())
        disk = shutil.disk_usage(media_root)

        report = {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'read_only': True,
            'media_root': media_root,
            'disk': {
                'total_bytes': disk.total,
                'used_bytes': disk.used,
                'free_bytes': disk.free,
                'used_percent': round((disk.used / disk.total) * 100, 2) if disk.total else 0,
            },
            'filesystem': {
                'directories': scan['directories'],
                'file_count': len(filesystem_paths),
                'total_bytes': total_bytes,
                'extensions': scan['extensions'],
                'symlink_samples': scan['symlinks'],
                'error_samples': scan['errors'],
            },
        }

        if not options['skip_database']:
            report['database'] = self._database_report(media_root, filesystem_paths)

        output_path = options.get('output')
        if output_path:
            output_path = os.path.abspath(output_path)
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as output_file:
                json.dump(report, output_file, ensure_ascii=False, indent=2, sort_keys=True)
                output_file.write('\n')
            self.stdout.write(self.style.SUCCESS(f'Relatório JSON gravado em: {output_path}'))

        self._print_summary(report)

    @staticmethod
    def _database_report(media_root, filesystem_paths):
        from empresas import models

        registered_paths = set()
        invalid_records = []
        records_by_model = {}

        for model_name in DOCUMENT_MODELS:
            model = getattr(models, model_name)
            records = model.objects.exclude(caminho_arquivo='').values_list('pk', 'caminho_arquivo')
            count = 0
            for primary_key, stored_path in records.iterator(chunk_size=1000):
                count += 1
                relative = _relative_path(media_root, stored_path)
                if relative:
                    registered_paths.add(relative)
                elif len(invalid_records) < SAMPLE_LIMIT:
                    invalid_records.append({
                        'model': model_name,
                        'id': primary_key,
                        'stored_path': str(stored_path),
                    })
            records_by_model[model_name] = count

        missing = sorted(registered_paths - filesystem_paths)
        unregistered = sorted(filesystem_paths - registered_paths)
        return {
            'records_by_model': records_by_model,
            'unique_registered_paths': len(registered_paths),
            'missing_file_count': len(missing),
            'missing_file_samples': missing[:SAMPLE_LIMIT],
            'unregistered_file_count': len(unregistered),
            'unregistered_file_samples': unregistered[:SAMPLE_LIMIT],
            'invalid_record_count': len(invalid_records),
            'invalid_record_samples': invalid_records,
        }

    def _print_summary(self, report):
        filesystem = report['filesystem']
        disk = report['disk']
        self.stdout.write(self.style.SUCCESS('Inventário concluído; nenhum arquivo foi alterado.'))
        self.stdout.write(
            f"Filesystem: {filesystem['file_count']} arquivo(s), "
            f"{filesystem['total_bytes']} bytes, {filesystem['directories']} pasta(s)."
        )
        self.stdout.write(
            f"Disco: {disk['free_bytes']} bytes livres; {disk['used_percent']}% utilizado."
        )
        if 'database' in report:
            database = report['database']
            self.stdout.write(
                f"Banco: {database['unique_registered_paths']} caminho(s) único(s), "
                f"{database['missing_file_count']} sem arquivo e "
                f"{database['unregistered_file_count']} arquivo(s) sem registro."
            )
        if filesystem['error_samples']:
            self.stdout.write(self.style.WARNING(
                f"Foram encontrados {len(filesystem['error_samples'])} erro(s) de leitura; consulte o JSON."
            ))

