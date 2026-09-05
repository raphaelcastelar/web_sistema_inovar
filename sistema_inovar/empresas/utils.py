# empresas/utils.py (NOVO ARQUIVO ou adicione ao models.py e ajuste os imports)
import re
import unidecode
import logging
import os
import requests
from django.conf import settings
import base64

logger = logging.getLogger(__name__)

CNPJ_LENGTH = 14
_CNPJ_PATTERN = re.compile(r'^[A-Z0-9]{12}[0-9]{2}$')
_CNPJ_FIRST_DIGIT_WEIGHTS = (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)
_CNPJ_SECOND_DIGIT_WEIGHTS = (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)


def normalize_cnpj(value):
    """Remove somente a máscara do CNPJ, preservando eventuais letras."""
    return re.sub(r'[.\-/\s]', '', str(value or '')).upper()


def format_cnpj(value):
    normalized = normalize_cnpj(value)
    if len(normalized) != CNPJ_LENGTH:
        return normalized
    return (
        f'{normalized[:2]}.{normalized[2:5]}.{normalized[5:8]}/'
        f'{normalized[8:12]}-{normalized[12:]}'
    )


def _calculate_cnpj_digit(characters, weights):
    total = sum((ord(character) - 48) * weight for character, weight in zip(characters, weights))
    remainder = total % 11
    return '0' if remainder < 2 else str(11 - remainder)


def is_valid_cnpj(value):
    """Valida CNPJs numéricos legados e CNPJs alfanuméricos."""
    normalized = normalize_cnpj(value)
    if not _CNPJ_PATTERN.fullmatch(normalized):
        return False
    if len(set(normalized[:12])) == 1:
        return False
    first_digit = _calculate_cnpj_digit(normalized[:12], _CNPJ_FIRST_DIGIT_WEIGHTS)
    second_digit = _calculate_cnpj_digit(
        normalized[:12] + first_digit,
        _CNPJ_SECOND_DIGIT_WEIGHTS,
    )
    return normalized[-2:] == first_digit + second_digit


def normalizar_nome_empresa(nome_da_empresa_str):
    """Normaliza o nome cadastral para que também seja seguro como pasta."""
    if not nome_da_empresa_str:
        return ''

    nome_sem_acentos = unidecode.unidecode(str(nome_da_empresa_str))
    nome_sem_caracteres_de_caminho = re.sub(
        r'[<>:"/\\|?*\x00-\x1F]',
        '',
        nome_sem_acentos,
    )
    return re.sub(r'\s+', ' ', nome_sem_caracteres_de_caminho).strip().upper()


def gerar_nome_pasta_empresa_padronizado(nome_da_empresa_str):
    """Retorna o mesmo nome canônico usado no cadastro da empresa."""
    nome_padronizado = normalizar_nome_empresa(nome_da_empresa_str)
    if not nome_padronizado:
        logger.warning("Tentativa de gerar nome de pasta para empresa sem nome válido.")
        return "EMPRESA_NOME_VAZIO"

    return nome_padronizado

def sanitize_filename_for_upload(filename):
    """
    Sanitiza o nome do arquivo para ser usado em caminhos.
    Consistente com o que as funções upload_to devem fazer.
    Exemplo: remove acentos, substitui espaços por underscores, remove caracteres inválidos.
    """
    name, ext = os.path.splitext(filename)
    clean_name_no_accents = unidecode.unidecode(name)
    name_underscored = re.sub(r'[\s.\-]+', '_', clean_name_no_accents) # Troca espaços, pontos, hífens por _
    name_sanitized = re.sub(r'[^\w_.-]+', '', name_underscored) # Permite alphanumeric, _, ., -
                                                              # Se quiser mais restrito (só \w e -): r'[^\w-]'
    
    if not name_sanitized: # Evita nome de arquivo vazio
        name_sanitized = "arquivo_sem_nome_valido"
    return f"{name_sanitized}{ext}"

logger = logging.getLogger(__name__)

def get_bb_access_token():
    if not all([settings.BB_CLIENT_ID, settings.BB_CLIENT_SECRET]):
        logger.error("Credenciais do BB não configuradas no settings.py.")
        return None

    credentials = f"{settings.BB_CLIENT_ID}:{settings.BB_CLIENT_SECRET}"
    encoded_credentials = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')
    payload = {
        'grant_type': 'client_credentials',
        # Removido o scope para usar os padrões do app
    }

    headers = {
        'Authorization': f'Basic {encoded_credentials}',
        'Content-Type': 'application/x-www-form-urlencoded',
    }

    logger.info("Obtendo token BB em %s", settings.BB_OAUTH_URL)

    try:
        response = requests.post(settings.BB_OAUTH_URL, data=payload, headers=headers, timeout=30)
        logger.info("Resposta OAuth BB: status=%s", response.status_code)
        if response.status_code in (200,201):
            token_data = response.json()
            logger.info(f"Token obtido com scopes: {token_data.get('scope')}")
            return token_data.get('access_token')
        else:
            logger.error("Erro ao obter token BB: status=%s", response.status_code)
            return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Erro de conexão: {str(e)}")
        return None
