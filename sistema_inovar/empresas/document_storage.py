import os
import posixpath
import re
import uuid
import hashlib

from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone

from .models import DocumentoEmpresa, Empresa, TipoDocumento
from .utils import sanitize_filename_for_upload


DCTFWEB_DOCUMENT_CONFIG = {
    'GERARGUIA31': {
        'folder_key': 'pessoal_guias',
        'filename_prefix': 'GUIA_DCTFWEB',
        'type_code': 'guia_inss',
    },
    'CONSRECIBO32': {
        'folder_key': 'pessoal_relatorios',
        'filename_prefix': 'RECIBO_DCTFWEB',
        'type_code': 'recibo_dctfweb',
    },
    'CONSDECCOMPLETA33': {
        'folder_key': 'pessoal_relatorios',
        'filename_prefix': 'DECLARACAO_COMPLETA_DCTFWEB',
        'type_code': 'declaracao_dctfweb',
    },
}

FISCAL_DOCUMENT_CONFIG = {
    'extrato_simples': {
        'folder_key': 'fiscal_extratos',
        'filename_prefix': 'EXTRATO_SIMPLES',
        'allowed_extensions': ('pdf',),
        'type_code': 'extrato_simples',
    },
    'recibo_simples': {
        'folder_key': 'fiscal_extratos',
        'filename_prefix': 'RECIBO_SIMPLES',
        'allowed_extensions': ('pdf', 'zip'),
        'type_code': 'recibo_simples',
    },
    'parcelamento_sn': {
        'folder_key': 'fiscal_guias',
        'filename_prefix': 'GUIA_PARCELAMENTO_SN',
        'allowed_extensions': ('pdf',),
        'type_code': 'guia_parcelamento_simples',
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


def find_reusable_document(empresa, type_code, competencia, visible_only=False):
    """Retorna somente um documento publicado cujo arquivo ainda existe."""
    query = DocumentoEmpresa.objects.filter(
        empresa=empresa,
        tipo_documento__codigo=type_code,
        competencia=competencia,
        status='disponivel',
    )
    if visible_only:
        query = query.filter(visivel_no_app=True)
    document = query.order_by('-versao', '-criado_em').first()
    if not document or not document.caminho_arquivo:
        return None
    try:
        return document if document.caminho_arquivo.storage.exists(document.caminho_arquivo.name) else None
    except (OSError, ValueError):
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
def save_generated_das(cnpj, periodo, pdf_content, force_new_version=False, generated_by=None):
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
    document_type = TipoDocumento.objects.get(codigo='das_simples', ativo=True)
    previous = find_reusable_document(empresa, 'das_simples', normalized_period)
    version = previous.versao if previous else 1
    if force_new_version and previous:
        archived_name = f'DAS_{normalized_cnpj}_{normalized_period}_V{previous.versao}.pdf'
        rename_document_file(previous, archived_name)
        previous.status = 'substituido'
        previous.save(update_fields=['status'])
        version = previous.versao + 1
    elif previous:
        version = previous.versao
    document = DocumentoEmpresa(
        empresa=empresa,
        tipo_documento=document_type,
        folder_key='fiscal_guias',
        nome_arquivo=filename,
        ano=year,
        mes=month,
        competencia=normalized_period,
        origem='api',
        status='disponivel',
        visivel_no_app=True,
        versao=version,
        documento_anterior=previous if force_new_version else previous.documento_anterior if previous else None,
        checksum_sha256=hashlib.sha256(pdf_content).hexdigest(),
        gerado_em=timezone.now(),
        gerado_por=generated_by,
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
        defaults={
            'caminho_arquivo': relative_name,
            'tipo_documento': document_type,
            'competencia': normalized_period,
            'origem': 'api',
            'status': 'disponivel',
            'visivel_no_app': True,
            'versao': version,
            'documento_anterior': previous if force_new_version else previous.documento_anterior if previous else None,
            'checksum_sha256': hashlib.sha256(pdf_content).hexdigest(),
            'gerado_em': timezone.now(),
            'gerado_por': generated_by,
        },
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
    document_type = TipoDocumento.objects.get(codigo=config['type_code'], ativo=True)
    document = DocumentoEmpresa(
        empresa=empresa,
        tipo_documento=document_type,
        folder_key=config['folder_key'],
        nome_arquivo=filename,
        ano=year,
        mes=month,
        competencia=normalized_period,
        origem='api',
        status='disponivel',
        visivel_no_app=True,
        checksum_sha256=hashlib.sha256(pdf_content).hexdigest(),
        gerado_em=timezone.now(),
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
        defaults={
            'caminho_arquivo': relative_name, 'tipo_documento': document_type,
            'competencia': normalized_period, 'origem': 'api', 'status': 'disponivel',
            'visivel_no_app': True, 'checksum_sha256': hashlib.sha256(pdf_content).hexdigest(),
            'gerado_em': timezone.now(),
        },
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
    document_type = TipoDocumento.objects.get(codigo=config['type_code'], ativo=True)
    document = DocumentoEmpresa(
        empresa=empresa,
        tipo_documento=document_type,
        folder_key=config['folder_key'],
        nome_arquivo=filename,
        ano=year,
        mes=month,
        competencia=normalized_period,
        origem='api',
        status='disponivel',
        visivel_no_app=True,
        checksum_sha256=hashlib.sha256(file_content).hexdigest(),
        gerado_em=timezone.now(),
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
        defaults={
            'caminho_arquivo': relative_name, 'tipo_documento': document_type,
            'competencia': normalized_period, 'origem': 'api', 'status': 'disponivel',
            'visivel_no_app': True, 'checksum_sha256': hashlib.sha256(file_content).hexdigest(),
            'gerado_em': timezone.now(),
        },
    )
    return saved_document

