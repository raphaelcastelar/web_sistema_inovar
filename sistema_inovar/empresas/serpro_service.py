# empresas/serpro_service.py
import requests
import base64
import json
from django.conf import settings
from django.core.cache import cache # Usaremos o cache do Django para armazenar o token
import logging

logger = logging.getLogger(__name__)

# URL de autenticação do Serpro
AUTH_URL = 'https://autenticacao.sapi.serpro.gov.br/authenticate'

# URL do gateway da API Integra Contador
GATEWAY_URL = 'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1'

# Chave para armazenar o token no cache do Django
SERPRO_TOKEN_CACHE_KEY = 'serpro_api_access_token'


def get_serpro_token():
    """
    Obtém um token de acesso da API Serpro.
    Primeiro, tenta pegar do cache. Se não existir ou estiver expirado (o que faremos na chamada),
    solicita um novo.
    """
    token = cache.get(SERPRO_TOKEN_CACHE_KEY)
    if token:
        logger.info("Token da API Serpro encontrado no cache.")
        return token

    logger.info("Token não encontrado ou expirado. Solicitando novo token...")

    # Codifica as credenciais em Base64
    credentials = f"{settings.SERPRO_CONSUMER_KEY}:{settings.SERPRO_CONSUMER_SECRET}"
    encoded_credentials = base64.b64encode(credentials.encode()).decode()

    headers = {
        "Authorization": f"Basic {encoded_credentials}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Role-Type": "TERCEIROS"  # <-- LINHA ADICIONADA
    }
    
    data = {
        "grant_type": "client_credentials"
    }

    # O certificado precisa ser passado na requisição.
    # A biblioteca 'requests' aceita um tuple (caminho_do_cert, senha) no parâmetro 'cert'.
    cert_info = (
        r'\\servidor\SERVIDOR INOVAR\CERTIFICADO\certificado_publico.pem', 
        r'\\servidor\SERVIDOR INOVAR\CERTIFICADO\chave_privada_sem_senha.pem'
    )

    try:
        response = requests.post(AUTH_URL, headers=headers, data=data, cert=cert_info)
        response.raise_for_status() # Levanta erro para respostas 4xx/5xx

        token_data = response.json()
        access_token = token_data.get('access_token')
        
        # Armazena o token no cache com um tempo de expiração ligeiramente menor que o 'expires_in'
        # para evitar usar um token que está prestes a expirar.
        expires_in = token_data.get('expires_in', 3600) # Padrão de 1 hora se não vier
        cache.set(SERPRO_TOKEN_CACHE_KEY, access_token, timeout=(expires_in - 60)) # Armazena por 1 minuto a menos

        logger.info("Novo token da API Serpro obtido e armazenado em cache.")
        return access_token

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
    
    Args:
        cnpj_empresa (str): CNPJ do contribuinte para o qual o DAS será gerado.
        periodo_apuracao (str): Período de apuração no formato "YYYYMM".
    """
    token = get_serpro_token()
    if not token:
        return {"sucesso": False, "erro": "Falha na autenticação com a API Serpro."}

    url = f"{GATEWAY_URL}/Emitir"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
        # 'jwt_token' e 'autenticar_procurador_token' não são necessários para esta chamada
    }

    # O CNPJ do contratante e do autor do pedido é geralmente o CNPJ do escritório de contabilidade
    # que possui o certificado e o contrato com o Serpro. Vamos assumir que está no settings.
    # Se for variável, precisará ser passado como parâmetro.
    # Por agora, vamos assumir que o contratante é o mesmo que o contribuinte para simplificar.
    # Ajuste 'numero' em 'contratante' e 'autorPedidoDados' para o CNPJ do seu escritório.
    cnpj_contratante = settings.MEU_ESCRITORIO_CNPJ # Ou um CNPJ específico do seu escritório
    
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
        
        # Se a resposta for 401 (Unauthorized), o token pode ter expirado.
        if response.status_code == 401:
            logger.warning("Token expirado (401). Solicitando um novo e tentando novamente.")
            cache.delete(SERPRO_TOKEN_CACHE_KEY) # Limpa o token antigo
            token = get_serpro_token() # Pega um novo
            if not token:
                return {"sucesso": False, "erro": "Falha ao renovar o token de autenticação."}
            headers["Authorization"] = f"Bearer {token}" # Atualiza o header
            response = requests.post(url, json=payload, headers=headers) # Tenta a chamada de novo

        response.raise_for_status()

        # A API retorna um PDF diretamente no corpo da resposta
        # O content-type da resposta provavelmente será 'application/pdf'
        if 'application/pdf' in response.headers.get('Content-Type', ''):
            logger.info(f"DAS em PDF gerado com sucesso para {cnpj_empresa} / {periodo_apuracao}.")
            return {"sucesso": True, "pdf_content": response.content, "filename": f"DAS_{cnpj_empresa}_{periodo_apuracao}.pdf"}
        else:
            # Se não for um PDF, pode ser um JSON de erro
            logger.error(f"Resposta inesperada ao gerar DAS (não é PDF): {response.text}")
            return {"sucesso": False, "erro": "Resposta inesperada da API Serpro.", "detalhes": response.json()}

    except requests.exceptions.RequestException as e:
        logger.error(f"Erro na requisição para gerar DAS: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"Resposta da API Serpro (erro): {e.response.status_code} - {e.response.text}")
            return {"sucesso": False, "erro": "Erro de comunicação com a API Serpro.", "detalhes": e.response.text}
        return {"sucesso": False, "erro": "Erro de comunicação com a API Serpro."}