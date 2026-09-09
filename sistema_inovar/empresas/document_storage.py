import os
import posixpath
import re
import uuid

from django.core.files.storage import default_storage
from django.db import transaction

from .models import DocumentoEmpresa, Empresa
from .utils import sanitize_filename_for_upload


DCTFWEB_DOCUMENT_CONFIG = {
    'GERARGUIA31': {
        'folder_key': 'pessoal_guias',
        'filename_prefix': 'GUIA_DCTFWEB',
    },
    'CONSRECIBO32': {
        'folder_key': 'pessoal_relatorios',
        'filename_prefix': 'RECIBO_DCTFWEB',
    },
    'CONSDECCOMPLETA33': {
        'folder_key': 'pessoal_relatorios',
        'filename_prefix': 'DECLARACAO_COMPLETA_DCTFWEB',
    },
}

FISCAL_DOCUMENT_CONFIG = {
    'extrato_simples': {
        'folder_key': 'fiscal_extratos',
        'filename_prefix': 'EXTRATO_SIMPLES',
        'allowed_extensions': ('pdf',),
    },
    'recibo_simples': {
        'folder_key': 'fiscal_extratos',
        'filename_prefix': 'RECIBO_SIMPLES',
        'allowed_extensions': ('pdf', 'zip'),
    },
    'parcelamento_sn': {
        'folder_key': 'fiscal_guias',
        'filename_prefix': 'GUIA_PARCELAMENTO_SN',
        'allowed_extensions': ('pdf',),
    },
}


def find_empresa_by_cnpj(cnpj):
    """Localiza a empresa mesmo quando o CNPJ está armazenado com pontuação."""
    normalized = re.sub(r'\D', '', str(cnpj or ''))
    if len(normalized) != 14:
        return None
    for empresa in Empresa.objects.only('id', 'nome', 'cnpj').iterator(chunk_size=500):
        if re.sub(r'\D', '', str(empresa.cnpj or '')) == normalized:
            return empresa
    return None


def _atomic_storage_write(storage, relative_name, content):
    """Grava no filesystem local e publica o nome final apenas após fsync."""
    final_path = storage.path(relative_name)
    storage_root = os.path.realpath(storage.location)
    final_path = os.path.realpath(final_path)
    if os.path.commonpath((storage_root, final_path)) != storage_root:
        raise ValueError('Caminho final fora do armazenamento configurado.')

    directory = os.path.dirname(final_path)
    os.makedirs(directory, exist_ok=True)
    temporary_path = os.path.join(directory, f'.{os.path.basename(final_path)}.{uuid.uuid4().hex}.part')
    try:
        with open(temporary_path, 'xb') as temporary_file:
            temporary_file.write(content)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temporary_path, final_path)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)


def rename_document_file(document, requested_name):
    """Renomeia o arquivo físico e mantém o registro sincronizado."""
    requested_name = str(requested_name or '').strip()
    if (
        not requested_name
        or requested_name in {'.', '..'}
        or '/' in requested_name
        or '\\' in requested_name
    ):
        raise ValueError('Informe somente o novo nome do arquivo.')

    safe_name = sanitize_filename_for_upload(requested_name)
    if len(safe_name) > DocumentoEmpresa._meta.get_field('nome_arquivo').max_length:
        raise ValueError('O nome do arquivo deve ter no máximo 255 caracteres.')

    duplicate = DocumentoEmpresa.objects.filter(
        empresa=document.empresa,
        folder_key=document.folder_key,
        nome_arquivo=safe_name,
        ano=document.ano,
        mes=document.mes,
    ).exclude(pk=document.pk)
    if duplicate.exists():
        raise FileExistsError('Já existe um arquivo com esse nome nesta pasta.')

    storage = document.caminho_arquivo.storage
    old_name = str(document.caminho_arquivo.name).replace('\\', '/')
    new_name = posixpath.join(posixpath.dirname(old_name), safe_name)

    if new_name == old_name:
        document.nome_arquivo = safe_name
        document.save(update_fields=['nome_arquivo'])
        return document
    if storage.exists(new_name):
        raise FileExistsError('Já existe um arquivo com esse nome nesta pasta.')
    if not storage.exists(old_name):
        raise FileNotFoundError('O arquivo físico não foi encontrado no servidor.')

    # FileSystemStorage permite uma troca atômica, que também facilita desfazer
    # a movimentação caso a atualização no banco falhe.
    old_path = storage.path(old_name)
    new_path = storage.path(new_name)
    os.makedirs(os.path.dirname(new_path), exist_ok=True)
    os.replace(old_path, new_path)
    try:
        with transaction.atomic():
            document.nome_arquivo = safe_name
            document.caminho_arquivo.name = new_name
            document.save(update_fields=['nome_arquivo', 'caminho_arquivo'])
    except Exception:
        if os.path.exists(new_path) and not os.path.exists(old_path):
            os.replace(new_path, old_path)
        raise
    return document


def delete_document_file(document):
    """Exclui o registro e o arquivo físico como uma única operação de serviço."""
    storage = document.caminho_arquivo.storage
    stored_name = document.caminho_arquivo.name
    with transaction.atomic():
        document.delete()
        if stored_name and storage.exists(stored_name):
            storage.delete(stored_name)


@transaction.atomic
def save_generated_das(cnpj, periodo, pdf_content):
    """Salva/reprocessa um DAS em FISCAL/GUIAS/AAAA/MM de forma idempotente."""
    normalized_cnpj = re.sub(r'\D', '', str(cnpj or ''))
    normalized_period = re.sub(r'\D', '', str(periodo or ''))
    if len(normalized_cnpj) != 14:
        raise ValueError('CNPJ inválido para salvar o DAS.')
    if not re.fullmatch(r'\d{4}(0[1-9]|1[0-2])', normalized_period):
        raise ValueError('Competência inválida para salvar o DAS.')
    if not isinstance(pdf_content, bytes) or not pdf_content.startswith(b'%PDF'):
        raise ValueError('O conteúdo retornado não é um PDF válido.')

    empresa = find_empresa_by_cnpj(normalized_cnpj)
    if not empresa:
        raise Empresa.DoesNotExist(f'Empresa com CNPJ {normalized_cnpj} não cadastrada.')

    year, month = normalized_period[:4], normalized_period[4:]
    filename = f'DAS_{normalized_cnpj}_{normalized_period}.pdf'
    document = DocumentoEmpresa(
        empresa=empresa,
        folder_key='fiscal_guias',
        nome_arquivo=filename,
        ano=year,
        mes=month,
    )
    relative_name = document.caminho_arquivo.field.generate_filename(document, filename)

    # O armazenamento definitivo desta fase é o filesystem local da Droplet.
    # Falhar explicitamente é mais seguro do que produzir arquivo sem atomicidade.
    if not hasattr(default_storage, 'path') or not hasattr(default_storage, 'location'):
        raise RuntimeError('O armazenamento configurado não oferece filesystem local.')
    _atomic_storage_write(default_storage, relative_name, pdf_content)

    saved_document, _ = DocumentoEmpresa.objects.select_for_update().update_or_create(
        empresa=empresa,
        folder_key='fiscal_guias',
        nome_arquivo=filename,
        ano=year,
        mes=month,
        defaults={'caminho_arquivo': relative_name},
    )
    return saved_document


@transaction.atomic
def save_generated_dctfweb(cnpj, periodo, service_id, pdf_content):
    """Salva documentos da DCTFWeb na pasta pessoal da empresa."""
    config = DCTFWEB_DOCUMENT_CONFIG.get(service_id)
    if not config:
        raise ValueError('Serviço DCTFWeb inválido para armazenamento.')

    normalized_cnpj = re.sub(r'\D', '', str(cnpj or ''))
    normalized_period = re.sub(r'\D', '', str(periodo or ''))
    if len(normalized_cnpj) != 14:
        raise ValueError('CNPJ inválido para salvar o documento DCTFWeb.')
    if not re.fullmatch(r'\d{4}(0[1-9]|1[0-2])', normalized_period):
        raise ValueError('Competência inválida para salvar o documento DCTFWeb.')
    if not isinstance(pdf_content, bytes) or not pdf_content.startswith(b'%PDF'):
        raise ValueError('O conteúdo retornado da DCTFWeb não é um PDF válido.')

    empresa = find_empresa_by_cnpj(normalized_cnpj)
    if not empresa:
        raise Empresa.DoesNotExist(f'Empresa com CNPJ {normalized_cnpj} não cadastrada.')

    year, month = normalized_period[:4], normalized_period[4:]
    filename = f"{config['filename_prefix']}_{normalized_cnpj}_{normalized_period}.pdf"
    document = DocumentoEmpresa(
        empresa=empresa,
        folder_key=config['folder_key'],
        nome_arquivo=filename,
        ano=year,
        mes=month,
    )
    relative_name = document.caminho_arquivo.field.generate_filename(document, filename)

    if not hasattr(default_storage, 'path') or not hasattr(default_storage, 'location'):
        raise RuntimeError('O armazenamento configurado não oferece filesystem local.')
    _atomic_storage_write(default_storage, relative_name, pdf_content)

    saved_document, _ = DocumentoEmpresa.objects.select_for_update().update_or_create(
        empresa=empresa,
        folder_key=config['folder_key'],
        nome_arquivo=filename,
        ano=year,
        mes=month,
        defaults={'caminho_arquivo': relative_name},
    )
    return saved_document


@transaction.atomic
def save_generated_fiscal_document(cnpj, periodo, document_type, file_content):
    """Salva extratos, recibos e guias do Simples nas pastas fiscais."""
    config = FISCAL_DOCUMENT_CONFIG.get(document_type)
    if not config:
        raise ValueError('Tipo de documento fiscal inválido para armazenamento.')

    normalized_cnpj = re.sub(r'\D', '', str(cnpj or ''))
    normalized_period = re.sub(r'\D', '', str(periodo or ''))
    if len(normalized_cnpj) != 14:
        raise ValueError('CNPJ inválido para salvar o documento fiscal.')
    if not re.fullmatch(r'\d{4}(0[1-9]|1[0-2])', normalized_period):
        raise ValueError('Competência inválida para salvar o documento fiscal.')
    if not isinstance(file_content, bytes):
        raise ValueError('O conteúdo retornado para o documento fiscal é inválido.')

    if file_content.startswith(b'%PDF'):
        extension = 'pdf'
    elif file_content.startswith(b'PK'):
        extension = 'zip'
    else:
        raise ValueError('O conteúdo retornado não é um PDF ou ZIP válido.')
    if extension not in config['allowed_extensions']:
        raise ValueError(f'O formato {extension.upper()} não é permitido para este documento.')

    empresa = find_empresa_by_cnpj(normalized_cnpj)
    if not empresa:
        raise Empresa.DoesNotExist(f'Empresa com CNPJ {normalized_cnpj} não cadastrada.')

    year, month = normalized_period[:4], normalized_period[4:]
    filename = f"{config['filename_prefix']}_{normalized_cnpj}_{normalized_period}.{extension}"
    document = DocumentoEmpresa(
        empresa=empresa,
        folder_key=config['folder_key'],
        nome_arquivo=filename,
        ano=year,
        mes=month,
    )
    relative_name = document.caminho_arquivo.field.generate_filename(document, filename)

    if not hasattr(default_storage, 'path') or not hasattr(default_storage, 'location'):
        raise RuntimeError('O armazenamento configurado não oferece filesystem local.')
    _atomic_storage_write(default_storage, relative_name, file_content)

    saved_document, _ = DocumentoEmpresa.objects.select_for_update().update_or_create(
        empresa=empresa,
        folder_key=config['folder_key'],
        nome_arquivo=filename,
        ano=year,
        mes=month,
        defaults={'caminho_arquivo': relative_name},
    )
    return saved_document

