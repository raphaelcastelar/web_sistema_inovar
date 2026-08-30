import os
import shutil
import tempfile

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from empresas.folder_structure import create_company_folder_structure
from empresas.utils import gerar_nome_pasta_empresa_padronizado


KEEP_YEAR = '2026'
KEEP_MONTH = '08'
CONFIRMATION = 'APAGAR_ARQUIVOS_E_MIGRAR'


class Command(BaseCommand):
    help = (
        'Migra as pastas das empresas para a nova estrutura. Preserva somente '
        'DOCUMENTOS CONSTITUTIVOS e DEPARTAMENTO PESSOAL/2026/082026.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--execute', action='store_true', help='Executa as alterações; sem esta opção apenas simula.')
        parser.add_argument('--confirm', default='', help=f'Confirmação obrigatória: {CONFIRMATION}')
        parser.add_argument('--empresa', help='Nome exato/canônico de uma única empresa para teste.')

    def handle(self, *args, **options):
        media_root = os.path.realpath(str(settings.MEDIA_ROOT or ''))
        if not media_root or media_root == os.path.sep or not os.path.isdir(media_root):
            raise CommandError(f'MEDIA_ROOT inválido ou não montado: {media_root!r}')

        execute = options['execute']
        if execute and options['confirm'] != CONFIRMATION:
            raise CommandError(f'Para executar, use --confirm={CONFIRMATION}')

        company_names = self._company_names(options.get('empresa'))
        mode = 'EXECUÇÃO' if execute else 'SIMULAÇÃO'
        self.stdout.write(self.style.WARNING(f'{mode}: {len(company_names)} empresa(s) em {media_root}'))

        totals = {'preserve': 0, 'delete': 0, 'companies': 0}
        for company_name in company_names:
            company_path = self._resolve_company_path(media_root, company_name)
            if os.path.commonpath((media_root, company_path)) != media_root or not os.path.isdir(company_path):
                self.stdout.write(self.style.WARNING(f'Ignorada (pasta ausente/insegura): {company_name}'))
                continue
            canonical_path = os.path.join(media_root, gerar_nome_pasta_empresa_padronizado(company_name))
            if company_path != canonical_path:
                if os.path.exists(canonical_path):
                    raise CommandError(
                        f'Não é seguro renomear {company_path}: o destino {canonical_path} já existe.'
                    )
                self.stdout.write(f'{os.path.basename(company_path)} -> {os.path.basename(canonical_path)}')
                if execute:
                    os.replace(company_path, canonical_path)
                    company_path = canonical_path
            stats = self._migrate_company(company_path, company_name, execute)
            totals['preserve'] += stats['preserve']
            totals['delete'] += stats['delete']
            totals['companies'] += 1
            self.stdout.write(
                f"{company_name}: preservar {stats['preserve']} arquivo(s); "
                f"apagar {stats['delete']} arquivo(s)"
            )

        self.stdout.write(self.style.SUCCESS(
            f"{mode} concluída: {totals['companies']} empresa(s), "
            f"{totals['preserve']} preservado(s), {totals['delete']} removido(s)."
        ))
        if not execute:
            self.stdout.write(self.style.WARNING(
                f'Nada foi alterado. Para executar: --execute --confirm={CONFIRMATION}'
            ))

    @staticmethod
    def _resolve_company_path(media_root, company_name):
        exact_path = os.path.realpath(os.path.join(media_root, company_name))
        if os.path.isdir(exact_path):
            return exact_path
        expected = gerar_nome_pasta_empresa_padronizado(company_name)
        for entry in os.scandir(media_root):
            if entry.is_dir(follow_symlinks=False) and gerar_nome_pasta_empresa_padronizado(entry.name) == expected:
                return os.path.realpath(entry.path)
        return exact_path

    def _company_names(self, requested_company):
        from empresas.models import Empresa

        if requested_company:
            return [gerar_nome_pasta_empresa_padronizado(requested_company)]
        return list(Empresa.objects.order_by('nome').values_list('nome', flat=True))

    @staticmethod
    def _files_under(path):
        if not os.path.isdir(path):
            return []
        return [
            os.path.join(root, filename)
            for root, _, filenames in os.walk(path)
            for filename in filenames
        ]

    def _legacy_sources(self, company_path):
        constitutivos = os.path.join(company_path, 'DOCUMENTOS CONSTITUTIVOS')
        pessoal = os.path.join(company_path, 'DEPARTAMENTO PESSOAL', KEEP_YEAR, f'{KEEP_MONTH}{KEEP_YEAR}')
        return (
            (constitutivos, ('CONSTITUTIVOS', 'OUTROS')),
            (pessoal, ('PESSOAL', 'GUIAS', KEEP_YEAR, KEEP_MONTH)),
        )

    def _migrate_company(self, company_path, company_name, execute):
        sources = self._legacy_sources(company_path)
        if not any(os.path.isdir(source) for source, _ in sources):
            self.stdout.write(self.style.WARNING(
                f'{company_name}: nenhuma estrutura legada encontrada; empresa ignorada para evitar uma nova exclusão.'
            ))
            return {'preserve': 0, 'delete': 0}
        preserved_files = [file_path for source, _ in sources for file_path in self._files_under(source)]
        all_files = self._files_under(company_path)
        stats = {'preserve': len(preserved_files), 'delete': len(all_files) - len(preserved_files)}
        if not execute:
            return stats

        parent_path = os.path.dirname(company_path)
        stage_path = tempfile.mkdtemp(prefix='.migracao-pastas-', dir=parent_path)
        try:
            staged_files = []
            for source, destination_parts in sources:
                if not os.path.isdir(source):
                    continue
                destination = os.path.join(stage_path, *destination_parts)
                staged_files.extend(self._copy_files_flat(source, destination))

            for entry in os.scandir(company_path):
                if entry.is_dir(follow_symlinks=False):
                    self._remove_tree_ignoring_missing(entry.path)
                else:
                    try:
                        os.unlink(entry.path)
                    except FileNotFoundError:
                        pass

            create_company_folder_structure(company_path, years=(KEEP_YEAR,))
            self._copy_tree_without_overwrite(stage_path, company_path)
            self._cleanup_database(company_name, company_path, staged_files)
        finally:
            shutil.rmtree(stage_path, ignore_errors=True)
        return stats

    def _cleanup_database(self, company_name, company_path, staged_files):
        from empresas.models import (
            DepartamentoPessoal,
            DocumentosConstitutivos,
            Outros,
            SimplesNacional,
            XML,
        )

        company_relative = os.path.basename(company_path)
        preserved_constitutivos = {
            os.path.basename(path): f'{company_relative}/CONSTITUTIVOS/OUTROS/{os.path.basename(path)}'
            for path in staged_files
            if f'{os.sep}CONSTITUTIVOS{os.sep}OUTROS{os.sep}' in path
        }
        preserved_pessoal = {
            os.path.basename(path): f'{company_relative}/PESSOAL/GUIAS/{KEEP_YEAR}/{KEEP_MONTH}/{os.path.basename(path)}'
            for path in staged_files
            if f'{os.sep}PESSOAL{os.sep}GUIAS{os.sep}' in path
        }

        with transaction.atomic():
            documents = DocumentosConstitutivos.objects.filter(nome_empresa=company_name)
            for document in documents:
                new_path = preserved_constitutivos.get(document.nome_arquivo)
                if new_path:
                    document.caminho_arquivo = new_path
                    document.save(update_fields=['caminho_arquivo'])
                else:
                    document.delete()

            pessoal = DepartamentoPessoal.objects.filter(cnpj_empresa__in=self._company_cnpjs(company_name))
            for document in pessoal:
                new_path = preserved_pessoal.get(document.nome_arquivo)
                if document.ano == KEEP_YEAR and str(document.mes).zfill(2) == KEEP_MONTH and new_path:
                    document.caminho_arquivo = new_path
                    document.nome_empresa = company_name
                    document.save(update_fields=['caminho_arquivo', 'nome_empresa'])
                else:
                    document.delete()

            XML.objects.filter(cnpj_empresa__in=self._company_cnpjs(company_name)).delete()
            SimplesNacional.objects.filter(cnpj_empresa__in=self._company_cnpjs(company_name)).delete()
            Outros.objects.filter(nome_empresa=company_name).delete()

    @staticmethod
    def _company_cnpjs(company_name):
        from empresas.models import Empresa
        return Empresa.objects.filter(nome=company_name).values_list('cnpj', flat=True)

    def _copy_files_flat(self, source, destination):
        os.makedirs(destination, exist_ok=True)
        copied = []
        for source_file in Command._files_under(source):
            filename = os.path.basename(source_file)
            target_file = os.path.join(destination, filename)
            stem, extension = os.path.splitext(filename)
            counter = 1
            while os.path.exists(target_file):
                target_file = os.path.join(destination, f'{stem}_{counter}{extension}')
                counter += 1
            try:
                shutil.copy2(source_file, target_file)
            except FileNotFoundError:
                continue
            copied.append(target_file)
        return copied

    def _remove_tree_ignoring_missing(self, path):
        def handle_remove_error(function, failed_path, exception):
            if isinstance(exception, FileNotFoundError):
                return
            raise exception

        shutil.rmtree(path, onexc=handle_remove_error)

    @staticmethod
    def _copy_tree_without_overwrite(source, destination):
        os.makedirs(destination, exist_ok=True)
        for root, directories, filenames in os.walk(source):
            relative = os.path.relpath(root, source)
            target_root = destination if relative == '.' else os.path.join(destination, relative)
            os.makedirs(target_root, exist_ok=True)
            for directory in directories:
                os.makedirs(os.path.join(target_root, directory), exist_ok=True)
            for filename in filenames:
                source_file = os.path.join(root, filename)
                target_file = os.path.join(target_root, filename)
                if os.path.exists(target_file):
                    stem, extension = os.path.splitext(filename)
                    counter = 1
                    while os.path.exists(target_file):
                        target_file = os.path.join(target_root, f'{stem}_{counter}{extension}')
                        counter += 1
                shutil.copy2(source_file, target_file)
