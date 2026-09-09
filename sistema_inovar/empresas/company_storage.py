import os

from django.conf import settings
from django.db import models, transaction

from .models import (
    DepartamentoPessoal,
    DocumentoEmpresa,
    DocumentosConstitutivos,
    Outros,
    SimplesNacional,
    XML,
)
from .utils import gerar_nome_pasta_empresa_padronizado


DOCUMENT_MODELS = (
    DocumentoEmpresa,
    DocumentosConstitutivos,
    XML,
    DepartamentoPessoal,
    SimplesNacional,
    Outros,
)

LEGACY_COMPANY_NAME_MODELS = (
    DocumentosConstitutivos,
    XML,
    DepartamentoPessoal,
    SimplesNacional,
    Outros,
)


def _safe_company_path(folder_name):
    configured_media_root = str(settings.MEDIA_ROOT or '').strip()
    if not configured_media_root:
        raise RuntimeError('MEDIA_ROOT não está configurado.')
    media_root = os.path.realpath(configured_media_root)
    company_path = os.path.realpath(os.path.join(media_root, folder_name))
    if os.path.commonpath((media_root, company_path)) != media_root or company_path == media_root:
        raise ValueError('O caminho da pasta da empresa é inválido.')
    return company_path


def _update_document_paths(old_folder, new_folder):
    prefixes = (f'{old_folder}/', f'{old_folder}\\')
    for document_model in DOCUMENT_MODELS:
        documents = document_model.objects.filter(
            models.Q(caminho_arquivo__startswith=prefixes[0])
            | models.Q(caminho_arquivo__startswith=prefixes[1])
        ).only('pk', 'caminho_arquivo')
        for document in documents.iterator():
            current_name = str(document.caminho_arquivo.name)
            updated_name = f'{new_folder}{current_name[len(old_folder):]}'
            document_model.objects.filter(pk=document.pk).update(
                caminho_arquivo=updated_name
            )


def rename_company_folder(empresa, previous_company_name):
    """Move a pasta existente e sincroniza todas as referências do banco."""
    old_folder = gerar_nome_pasta_empresa_padronizado(previous_company_name)
    new_folder = gerar_nome_pasta_empresa_padronizado(empresa.nome)
    if old_folder == new_folder:
        return False

    old_path = _safe_company_path(old_folder)
    new_path = _safe_company_path(new_folder)
    old_exists = os.path.isdir(old_path)
    new_exists = os.path.exists(new_path)
    if old_exists and new_exists:
        raise FileExistsError(
            f'Já existe uma pasta para o nome "{new_folder}". '
            'A renomeação foi cancelada para não sobrescrever arquivos.'
        )

    moved = False
    if old_exists:
        os.replace(old_path, new_path)
        moved = True

    try:
        with transaction.atomic():
            if moved or new_exists:
                _update_document_paths(old_folder, new_folder)
            for document_model in LEGACY_COMPANY_NAME_MODELS:
                document_model.objects.filter(nome_empresa=previous_company_name).update(
                    nome_empresa=empresa.nome
                )
    except Exception:
        if moved and os.path.isdir(new_path) and not os.path.exists(old_path):
            os.replace(new_path, old_path)
        raise
    return moved
