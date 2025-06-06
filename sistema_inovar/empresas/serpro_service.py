# empresas/serpro_service.py
import requests
import base64
import json
from django.conf import settings
from django.core.cache import cache
import logging

logger = logging.getLogger(__name__)

AUTH_URL = 'https://autenticacao.sapi.serpro.gov.br/authenticate'
GATEWAY_URL = 'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1'
SERPRO_TOKEN_CACHE_KEY = 'serpro_api_tokens_dict' # Chave de cache atualizada

def get_serpro_token():
    """
    Obtém um dicionário contendo o access_token e o jwt_token da API Serpro.
    Tenta pegar do cache, se não existir, solicita novos tokens.
    """
    tokens = cache.get(SERPRO_TOKEN_CACHE_KEY)
    if tokens:
        logger.info("Tokens da API Serpro encontrados no cache.")
        return tokens

    logger.info("Tokens não encontrados ou expirados. Solicitando novos tokens...")

    credentials = f"{settings.SERPRO_CONSUMER_KEY}:{settings.SERPRO_CONSUMER_SECRET}"
    encoded_credentials = base64.b64encode(credentials.encode()).decode()

    headers = {
        "Authorization": f"Basic {encoded_credentials}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Role-Type": "TERCEIROS"
    }
    data = {"grant_type": "client_credentials"}
    
    # A biblioteca 'requests' espera um tuple com os caminhos para o certificado público e a chave privada.
    cert_info = (settings.SERPRO_CERT_PUBLIC_PATH, settings.SERPRO_CERT_PRIVATE_KEY_PATH)

    try:
        response = requests.post(AUTH_URL, headers=headers, data=data, cert=cert_info)
        response.raise_for_status()

        token_data = response.json()
        
        # --- CORREÇÃO AQUI: Extrair e armazenar AMBOS os tokens ---
        tokens = {
            'access_token': token_data.get('access_token'),
            'jwt_token': token_data.get('jwt_token')
        }
        
        # Verifica se ambos os tokens foram recebidos com sucesso
        if not all(tokens.values()):
            logger.error(f"Falha ao extrair access_token ou jwt_token da resposta do Serpro: {token_data}")
            return None

        expires_in = token_data.get('expires_in', 3600)
        # Armazena o dicionário de tokens no cache
        cache.set(SERPRO_TOKEN_CACHE_KEY, tokens, timeout=(expires_in - 60))

        logger.info("Novos tokens da API Serpro obtidos e armazenados em cache.")
        return tokens

    except requests.exceptions.RequestException as e:
        logger.error(f"Erro ao solicitar token da API Serpro: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"Resposta da API Serpro: {e.response.status_code} - {e.response.text}")
        return None
    except Exception as e:
        logger.error(f"Erro inesperado ao manusear certificado ou token Serpro: {e}")
        return None


def gerar_das_serpro(cnpj_empresa, periodo_apuracao):
    """
    Chama o endpoint 'Emitir' da API Integra Contador para gerar o DAS.
    """
    tokens = get_serpro_token()
    if not tokens:
        return {"sucesso": False, "erro": "Falha na autenticação com a API Serpro."}

    url = f"{GATEWAY_URL}/Emitir"

    # --- CORREÇÃO AQUI: Adicionar o jwt_token ao cabeçalho ---
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "jwt_token": tokens['jwt_token'],
        "Content-Type": "application/json"
    }

    cnpj_contratante = settings.MEU_ESCRITORIO_CNPJ
    
    payload = {
      "contratante": { "numero": cnpj_contratante, "tipo": 2 },
      "autorPedidoDados": { "numero": cnpj_contratante, "tipo": 2 },
      "contribuinte": { "numero": cnpj_empresa, "tipo": 2 },
      "pedidoDados": {
        "idSistema": "PGDASD",
        "idServico": "GERARDAS12",
        "versaoSistema": "1.0",
        "dados": json.dumps({ "periodoApuracao": periodo_apuracao })
      }
    }

    logger.info(f"Enviando payload para gerar DAS: {json.dumps(payload, indent=2)}")

    try:
        response = requests.post(url, json=payload, headers=headers)
        
        if response.status_code == 401: # Se o token expirou
            logger.warning("Token expirado (401). Solicitando um novo e tentando novamente.")
            cache.delete(SERPRO_TOKEN_CACHE_KEY)
            tokens = get_serpro_token()
            if not tokens:
                return {"sucesso": False, "erro": "Falha ao renovar o token de autenticação."}
            
            # Atualiza os dois headers antes de tentar novamente
            headers["Authorization"] = f"Bearer {tokens['access_token']}"
            headers["jwt_token"] = tokens['jwt_token']
            response = requests.post(url, json=payload, headers=headers)

        response.raise_for_status()

        if 'application/pdf' in response.headers.get('Content-Type', ''):
            logger.info(f"DAS em PDF gerado com sucesso para {cnpj_empresa} / {periodo_apuracao}.")
            return {"sucesso": True, "pdf_content": response.content, "filename": f"DAS_{cnpj_empresa}_{periodo_apuracao}.pdf"}
        else:
            logger.error(f"Resposta inesperada ao gerar DAS (não é PDF): {response.text}")
            return {"sucesso": False, "erro": "Resposta inesperada da API Serpro.", "detalhes": response.json()}

    except requests.exceptions.RequestException as e:
        error_message = f"Erro na requisição para gerar DAS: {e}"
        if hasattr(e, 'response') and e.response is not None:
            error_message += f" - Resposta: {e.response.text}"
        logger.error(error_message)
        return {"sucesso": False, "erro": "Erro de comunicação com a API Serpro.", "detalhes": e.response.text if hasattr(e, 'response') else str(e)}