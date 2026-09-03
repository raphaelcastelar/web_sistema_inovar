import os
import re
import uuid

from django.core.files.storage import default_storage
from django.db import transaction

from .models import DocumentoEmpresa, Empresa


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

