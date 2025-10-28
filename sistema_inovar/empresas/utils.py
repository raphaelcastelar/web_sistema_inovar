# empresas/utils.py (NOVO ARQUIVO ou adicione ao models.py e ajuste os imports)
import re
import unidecode
import logging
import os
import requests
from django.conf import settings
import base64

logger = logging.getLogger(__name__)

def gerar_nome_pasta_empresa_padronizado(nome_da_empresa_str):
    """
    Gera um nome de pasta seguro e MAIÚSCULO a partir de uma string de nome de empresa.
    """
    if not nome_da_empresa_str:
        logger.warning("Tentativa de gerar nome de pasta para empresa sem nome.")
        # Você pode querer um fallback diferente ou levantar um erro
        # Para consistência com o sinal, podemos ter um fallback similar
        return "EMPRESA_NOME_VAZIO" 

    name_no_accents = unidecode.unidecode(str(nome_da_empresa_str))
    name_underscored = re.sub(r'[\s.\-]+', '_', name_no_accents)
    name_sanitized = re.sub(r'[^\w_]', '', name_underscored)
    name_upper = name_sanitized.upper()

    if not name_upper:
        logger.warning(f"Nome de empresa '{nome_da_empresa_str}' resultou em nome de pasta vazio.")
        return "NOME_EMPRESA_INVALIDO_PARA_PASTA"

    return name_upper

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

# utils/bb_api_utils.py
import requests
from django.conf import settings
import base64
import logging

logger = logging.getLogger(__name__)

def get_bb_access_token():
    if not all([settings.BB_CLIENT_ID, settings.BB_CLIENT_SECRET]):
        logger.error("Credenciais do BB não configuradas no settings.py.")
        return None

    credentials = f"{settings.BB_CLIENT_ID}:{settings.BB_CLIENT_SECRET}"
    encoded_credentials = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')
    logger.debug(f"Credenciais codificadas: {encoded_credentials}")

    payload = {
        'grant_type': 'client_credentials',
        # Removido o scope para usar os padrões do app
    }

    headers = {
        'Authorization': f'Basic {encoded_credentials}',
        'Content-Type': 'application/x-www-form-urlencoded',
    }

    logger.info(f"Obtendo token com URL: {settings.BB_OAUTH_URL}, Payload: {payload}, Headers: {headers}")

    try:
        response = requests.post(settings.BB_OAUTH_URL, data=payload, headers=headers, timeout=30)
        logger.info(f"Resposta OAuth: Status {response.status_code}, Headers: {dict(response.headers)}, Body: {response.text}")
        if response.status_code in (200,201):
            token_data = response.json()
            logger.info(f"Token obtido com scopes: {token_data.get('scope')}")
            return token_data.get('access_token')
        else:
            logger.error(f"Erro no token: Status {response.status_code}, Resposta completa: {response.text}")
            return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Erro de conexão: {str(e)}")
        return None