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
SERPRO_TOKEN_CACHE_KEY = 'serpro_api_tokens_dict'

def get_serpro_token():
    """
    Obtém e gerencia os tokens de autenticação da API Serpro.
    Esta função está correta e não precisa de alterações.
    """
    tokens = cache.get(SERPRO_TOKEN_CACHE_KEY)
    if tokens:
        logger.info("Tokens da API Serpro encontrados no cache.")
        return tokens

    logger.info("Tokens não encontrados ou expirados. Solicitando novos tokens...")
    try:
        credentials = f"{settings.SERPRO_CONSUMER_KEY}:{settings.SERPRO_CONSUMER_SECRET}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        headers = {
            "Authorization": f"Basic {encoded_credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Role-Type": "TERCEIROS"
        }
        data = {"grant_type": "client_credentials"}
        cert_info = (settings.SERPRO_CERT_PUBLIC_PATH, settings.SERPRO_CERT_PRIVATE_KEY_PATH)
        
        response = requests.post(AUTH_URL, headers=headers, data=data, cert=cert_info)
        response.raise_for_status()
        
        token_data = response.json()
        tokens = {
            'access_token': token_data.get('access_token'),
            'jwt_token': token_data.get('jwt_token')
        }
        if not all(tokens.values()):
            logger.error(f"Falha ao extrair tokens da resposta: {token_data}")
            return None
        
        expires_in = token_data.get('expires_in', 3600)
        cache.set(SERPRO_TOKEN_CACHE_KEY, tokens, timeout=(expires_in - 60))
        logger.info("Novos tokens da API Serpro obtidos com sucesso.")
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
    Chama a API Integra Contador usando o serviço GERARDASCOBRANCA17
    para obter o PDF da guia de pagamento do DAS diretamente.
    """
    tokens = get_serpro_token()
    if not tokens:
        return {"sucesso": False, "erro": "Falha na autenticação com a API Serpro."}

    # O endpoint para este serviço é /Emitir, como mostra a documentação que você encontrou.
    url = f"{GATEWAY_URL}/Emitir"
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "jwt_token": tokens['jwt_token'],
        "Content-Type": "application/json"
    }
    
    cnpj_contratante = settings.MEU_ESCRITORIO_CNPJ
    
    # O payload agora usa o idServico correto e o periodoApuracao nos dados
    payload = {
        "contratante": {"numero": cnpj_contratante, "tipo": 2},
        "autorPedidoDados": {"numero": cnpj_contratante, "tipo": 2},
        "contribuinte": {"numero": cnpj_empresa, "tipo": 2},
        "pedidoDados": {
            "idSistema": "PGDASD",
            "idServico": "GERARDASCOBRANCA17", # <-- O SERVIÇO CORRETO!
            "versaoSistema": "1.0",
            "dados": json.dumps({"periodoApuracao": periodo_apuracao}) # Envia o período de apuração
        }
    }

    logger.info(f"Enviando payload para GERAR DAS COBRANÇA: {json.dumps(payload, indent=2)}")

    try:
        response = requests.post(url, json=payload, headers=headers)
        
        # Lógica para tentar novamente se o token expirou
        if response.status_code == 401:
            logger.warning("Token expirado (401). Renovando e tentando novamente.")
            cache.delete(SERPRO_TOKEN_CACHE_KEY)
            tokens = get_serpro_token()
            if not tokens: return {"sucesso": False, "erro": "Falha ao renovar token."}
            headers["Authorization"] = f"Bearer {tokens['access_token']}"
            headers["jwt_token"] = tokens['jwt_token']
            response = requests.post(url, json=payload, headers=headers)

        response.raise_for_status()

        # Verifica se a resposta é um PDF diretamente
        if 'application/pdf' in response.headers.get('Content-Type', ''):
            logger.info(f"PDF da guia de pagamento DAS obtido com sucesso para {cnpj_empresa} / {periodo_apuracao}.")
            return {
                "sucesso": True, 
                "pdf_content": response.content, 
                "filename": f"DAS-Cobranca_{cnpj_empresa}_{periodo_apuracao}.pdf"
            }
        else:
            # Se não for um PDF, pode ser um JSON com os dados (incluindo Base64) ou um erro.
            # Vamos adicionar a lógica para tratar o caso de JSON com Base64 que vimos antes.
            logger.warning(f"Resposta não foi PDF direto. Tentando extrair de JSON... Content-Type: {response.headers.get('Content-Type', '')}")
            response_data = response.json()
            dados_str = response_data.get('dados')
            if dados_str:
                dados = json.loads(dados_str)
                # Tentando encontrar o PDF em Base64 em campos comuns
                pdf_base64_string = dados.get('pdf') or dados.get('extrato', {}).get('pdf') or dados.get('conteudoRecibo')
                if pdf_base64_string:
                    pdf_content_bytes = base64.b64decode(pdf_base64_string)
                    nome_arquivo = dados.get('extrato', {}).get('nomeArquivo', f"DAS-Cobranca_{cnpj_empresa}_{periodo_apuracao}.pdf")
                    logger.info(f"PDF do DAS decodificado com sucesso a partir de Base64.")
                    return {"sucesso": True, "pdf_content": pdf_content_bytes, "filename": nome_arquivo}
            
            logger.error(f"Resposta inesperada ao gerar DAS Cobrança: {response.text}")
            return {"sucesso": False, "erro": "Resposta inesperada da API Serpro.", "detalhes": response_data}

    except requests.exceptions.RequestException as e:
        logger.error(f"Erro na requisição para gerar DAS Cobrança: {e}")
        detalhes_erro = e.response.text if hasattr(e, 'response') and e.response is not None else str(e)
        return {"sucesso": False, "erro": "Erro de comunicação com a API Serpro.", "detalhes": detalhes_erro}
    
def obter_dados_extrato_serpro(cnpj_empresa, periodo_apuracao):
    """
    Faz uma ÚNICA chamada à API com o serviço GERARDAS12 para obter
    os dados do extrato de um período de apuração.
    Trata tanto respostas com dados quanto respostas de aviso (ex: sem valor devido).
    """
    tokens = get_serpro_token()
    if not tokens:
        return {"sucesso": False, "erro": "Falha na autenticação com a API Serpro."}

    url = f"{GATEWAY_URL}/Emitir" # O serviço GERARDAS12 usa o endpoint /Emitir
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "jwt_token": tokens['jwt_token'],
        "Content-Type": "application/json"
    }
    cnpj_contratante = settings.MEU_ESCRITORIO_CNPJ
    
    payload = {
      "contratante": {"numero": cnpj_contratante, "tipo": 2},
      "autorPedidoDados": {"numero": cnpj_contratante, "tipo": 2},
      "contribuinte": {"numero": cnpj_empresa, "tipo": 2},
      "pedidoDados": {
        "idSistema": "PGDASD",
        "idServico": "GERARDAS12", # Usamos este serviço que retorna todos os dados
        "versaoSistema": "1.0",
        "dados": json.dumps({"periodoApuracao": periodo_apuracao})
      }
    }

    logger.info(f"Enviando payload para obter dados de extrato: {json.dumps(payload, indent=2)}")

    try:
        response = requests.post(url, json=payload, headers=headers)
        
        if response.status_code == 401:
            logger.warning("Token expirado (401). Renovando...")
            cache.delete(SERPRO_TOKEN_CACHE_KEY)
            tokens = get_serpro_token()
            if not tokens: return {"sucesso": False, "erro": "Falha ao renovar token."}
            headers["Authorization"] = f"Bearer {tokens['access_token']}"
            headers["jwt_token"] = tokens['jwt_token']
            response = requests.post(url, json=payload, headers=headers)

        response.raise_for_status()
        
        response_data = response.json()
        logger.info(f"Resposta da consulta de extrato recebida: {response_data}")

        mensagens = response_data.get('mensagens', [])
        
        # Primeiro, verifica se há uma mensagem de aviso de "sem valor devido"
        if any('MSG_E0139' in msg.get('codigo', '') for msg in mensagens):
            texto_aviso = mensagens[0].get('texto', 'Não foi gerado DAS por não haver valor devido.')
            return {"sucesso": False, "erro": texto_aviso}

        # Se não, verifica se há uma mensagem genérica de sucesso
        if not any('sucesso' in msg.get('texto', '').lower() for msg in mensagens):
             error_message = mensagens[0].get('texto') if mensagens else "A API Serpro retornou um erro não especificado."
             return {"sucesso": False, "erro": error_message}

        # Se houve sucesso, esperamos que o campo 'dados' contenha o extrato
        dados_str = response_data.get('dados')
        if not dados_str or dados_str == '[]':
            return {"sucesso": False, "erro": "A API retornou sucesso, mas não há dados de extrato para este período."}
        
        dados_internos = json.loads(dados_str)
        
        if isinstance(dados_internos, list) and len(dados_internos) > 0:
            return {"sucesso": True, "extrato_data": dados_internos[0]}
        else:
            return {"sucesso": False, "erro": "Formato de dados do extrato inesperado."}

    except requests.exceptions.RequestException as e:
        logger.error(f"Erro na requisição para obter extrato: {e}")
        detalhes_erro = e.response.text if hasattr(e, 'response') and e.response is not None else str(e)
        return {"sucesso": False, "erro": "Erro de comunicação com a API Serpro.", "detalhes": detalhes_erro}
    except Exception as e:
        logger.error(f"Erro ao processar resposta do extrato: {e}")
        return {"sucesso": False, "erro": "Erro ao ler a resposta da API Serpro."}
    
def obter_numero_declaracao_original(tokens, cnpj_empresa, periodo_apuracao):
    """
    PASSO A: Usa o serviço CONSDECLARACAO13 para encontrar o número da declaração original de um período.
    """
    url = f"{GATEWAY_URL}/Consultar"
    headers = {"Authorization": f"Bearer {tokens['access_token']}", "jwt_token": tokens['jwt_token'], "Content-Type": "application/json"}
    cnpj_contratante = settings.MEU_ESCRITORIO_CNPJ
    payload = {
      "contratante": {"numero": cnpj_contratante, "tipo": 2},
      "autorPedidoDados": {"numero": cnpj_contratante, "tipo": 2},
      "contribuinte": {"numero": cnpj_empresa, "tipo": 2},
      "pedidoDados": {
        "idSistema": "PGDASD",
        "idServico": "CONSDECLARACAO13",
        "versaoSistema": "1.0",
        "dados": json.dumps({"periodoApuracao": periodo_apuracao})
      }
    }
    logger.info(f"Passo A - Buscando número da declaração original para {periodo_apuracao}")
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    response_data = response.json()

    if not any('sucesso' in msg.get('texto', '').lower() for msg in response_data.get('mensagens', [])):
        return None, response_data.get('mensagens', [{}])[0].get('texto')

    dados = json.loads(response_data.get('dados', '{}'))
    operacoes = dados.get('periodos', [{}])[0].get('operacoes', [])
    
    for op in operacoes:
        if op.get('tipoOperacao') == 'Original' and op.get('indiceDeclaracao'):
            numero_declaracao = op['indiceDeclaracao'].get('numeroDeclaracao')
            if numero_declaracao:
                logger.info(f"Número da declaração original encontrado: {numero_declaracao}")
                return numero_declaracao, None
    return None, "Declaração original não encontrada para este período."

def obter_extrato_pdf_serpro(cnpj_empresa, numero_das): # REMOVIDO 'tokens' dos parâmetros
    """
    Chama o serviço CONSEXTRATO16 para obter o PDF de um extrato de DAS existente.
    Agora, esta função é responsável por obter o token.
    """
    # CHAMA A FUNÇÃO DE OBTER TOKEN INTERNAMENTE
    tokens = get_serpro_token()
    if not tokens:
        # A get_serpro_token já loga o erro, aqui apenas retornamos o resultado
        return {"sucesso": False, "erro": "Falha na autenticação com a API Serpro ao buscar extrato."}

    url = f"{GATEWAY_URL}/Consultar"
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
            "idServico": "CONSEXTRATO16",
            "versaoSistema": "1.0",
            "dados": json.dumps({ "numeroDas": numero_das })
        }
    }
    logger.info(f"Enviando payload para obter PDF do EXTRATO: {json.dumps(payload, indent=2)}")

    try:
        # ... O restante da lógica desta função (o bloco try/except) permanece EXATAMENTE O MESMO ...
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()

        response_data = response.json()
        logger.info(f"Resposta da consulta de PDF do extrato recebida.")
        
        if not any(msg.get('codigo') == '[Sucesso-PGDASD]' for msg in response_data.get('mensagens', [])):
            return {"sucesso": False, "erro": "API Serpro indicou falha ao consultar o extrato em PDF.", "detalhes": response_data}

        dados_str = response_data.get('dados')
        if not dados_str:
            return {"sucesso": False, "erro": "Campo 'dados' não encontrado na resposta da consulta do PDF.", "detalhes": response_data}
        
        dados = json.loads(dados_str)
        extrato_data = dados.get('extrato', {})
        pdf_base64_string = extrato_data.get('pdf')
        nome_do_arquivo = extrato_data.get('nomeArquivo', f"Extrato_{cnpj_empresa}_{numero_das}.pdf")

        if not pdf_base64_string:
            return {"sucesso": False, "erro": "Campo 'pdf' com o PDF em Base64 não foi encontrado na resposta.", "detalhes": dados}

        pdf_content_bytes = base64.b64decode(pdf_base64_string)
        logger.info(f"PDF do Extrato {numero_das} decodificado com sucesso.")
        
        return {"sucesso": True, "pdf_content": pdf_content_bytes, "filename": nome_do_arquivo}
    
    except Exception as e:
        logger.error(f"Erro no processo de obtenção do PDF do extrato: {e}")
        detalhes_erro = e.response.text if hasattr(e, 'response') and e.response is not None else str(e)
        return {"sucesso": False, "erro": "Erro de comunicação ou resposta inválida da API Serpro ao buscar PDF.", "detalhes": detalhes_erro}