import requests
import base64
import json
import os
import tempfile
import locale
from datetime import datetime
from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.core.cache import cache
from empresas.models import Empresa, HistoricoEnvios
from empresas.whatsapp_utils import upload_media_to_whatsapp, send_whatsapp_document_template_message
import logging
from empresas.models import Empresa, Notificacao, UserCompanyAccess
from empresas.whatsapp_utils import upload_media_to_whatsapp, send_whatsapp_document_template_message
from django.contrib.auth import get_user_model
from rest_framework.response import Response
from rest_framework import status
from datetime import datetime
from django.utils import timezone
from django.core.exceptions import ObjectDoesNotExist


logger = logging.getLogger(__name__)
Funcionario = get_user_model()

AUTH_URL = getattr(settings, 'SERPRO_AUTH_URL', 'https://autenticacao.sapi.serpro.gov.br/authenticate')
GATEWAY_URL = getattr(settings, 'SERPRO_GATEWAY_URL', 'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1')
SERPRO_TOKEN_CACHE_KEY = 'serpro_api_tokens_dict'
SERPRO_AUTH_ERROR_CACHE_KEY = 'serpro_api_auth_error'
SERPRO_TIMEOUT = 30


def _set_serpro_auth_error(erro, detalhes=None):
    error_data = {"erro": erro, "detalhes": detalhes}
    cache.set(SERPRO_AUTH_ERROR_CACHE_KEY, error_data, timeout=300)
    return error_data


def _get_serpro_auth_error(default_message="Falha na autenticação com a API Serpro."):
    return cache.get(SERPRO_AUTH_ERROR_CACHE_KEY) or {"erro": default_message, "detalhes": None}


def _resolve_serpro_cert_info():
    cert_public_path = os.path.expandvars(os.path.expanduser(getattr(settings, 'SERPRO_CERT_PUBLIC_PATH', '') or ''))
    cert_private_key_path = os.path.expandvars(os.path.expanduser(getattr(settings, 'SERPRO_CERT_PRIVATE_KEY_PATH', '') or ''))

    missing_config = []
    if not getattr(settings, 'SERPRO_CONSUMER_KEY', ''):
        missing_config.append('SERPRO_CONSUMER_KEY')
    if not getattr(settings, 'SERPRO_CONSUMER_SECRET', ''):
        missing_config.append('SERPRO_CONSUMER_SECRET')
    if not cert_public_path:
        missing_config.append('SERPRO_CERT_PUBLIC_PATH')
    if not cert_private_key_path:
        missing_config.append('SERPRO_CERT_PRIVATE_KEY_PATH')
    if missing_config:
        return None, _set_serpro_auth_error(
            "Configuração SERPRO incompleta.",
            f"Variáveis ausentes: {', '.join(missing_config)}."
        )

    missing_files = [path for path in (cert_public_path, cert_private_key_path) if not os.path.exists(path)]
    if missing_files:
        return None, _set_serpro_auth_error(
            "Certificado SERPRO não encontrado.",
            "Confira os caminhos em SERPRO_CERT_PUBLIC_PATH e SERPRO_CERT_PRIVATE_KEY_PATH: "
            + "; ".join(missing_files)
        )

    return (cert_public_path, cert_private_key_path), None

def get_serpro_token():
    """Obtém e gerencia os tokens de autenticação da API Serpro."""
    tokens = cache.get(SERPRO_TOKEN_CACHE_KEY)
    if tokens:
        logger.info("Tokens da API Serpro encontrados no cache.")
        return tokens
    logger.info("Tokens não encontrados ou expirados. Solicitando novos tokens...")
    try:
        cert_info, cert_error = _resolve_serpro_cert_info()
        if cert_error:
            logger.error(f"{cert_error['erro']} {cert_error.get('detalhes') or ''}")
            return None

        credentials = f"{settings.SERPRO_CONSUMER_KEY}:{settings.SERPRO_CONSUMER_SECRET}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        headers = { "Authorization": f"Basic {encoded_credentials}", "Content-Type": "application/x-www-form-urlencoded", "Role-Type": "TERCEIROS" }
        data = {"grant_type": "client_credentials"}
        response = requests.post(AUTH_URL, headers=headers, data=data, cert=cert_info, timeout=SERPRO_TIMEOUT)
        response.raise_for_status()
        token_data = response.json()
        tokens = {'access_token': token_data.get('access_token'), 'jwt_token': token_data.get('jwt_token')}
        if not all(tokens.values()):
            logger.error(f"Falha ao extrair tokens da resposta: {token_data}")
            _set_serpro_auth_error("Falha ao extrair tokens da resposta do SERPRO.", token_data)
            return None
        expires_in = token_data.get('expires_in', 3600)
        cache.delete(SERPRO_AUTH_ERROR_CACHE_KEY)
        cache.set(SERPRO_TOKEN_CACHE_KEY, tokens, timeout=(expires_in - 60))
        logger.info("Novos tokens da API Serpro obtidos com sucesso.")
        return tokens
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else None
        response_text = e.response.text if e.response is not None else str(e)
        if status_code == 495:
            error = _set_serpro_auth_error(
                "Certificado digital recusado pelo SERPRO.",
                "O endpoint de autenticação retornou 495 SSL Certificate Error. "
                "Verifique se o certificado A1 está válido, pertence ao contratante/autorizado, "
                "e se o PEM público corresponde exatamente à chave privada configurada."
            )
        else:
            error = _set_serpro_auth_error("Erro HTTP ao solicitar token SERPRO.", response_text)
        logger.error(f"Erro ao solicitar token: {error['erro']} {error.get('detalhes') or ''}")
        return None
    except requests.exceptions.SSLError as e:
        error = _set_serpro_auth_error(
            "Erro SSL ao conectar no SERPRO.",
            "Confira o certificado cliente e a chave privada configurados. "
            f"Detalhes técnicos: {e}"
        )
        logger.error(f"Erro ao solicitar token: {error['erro']} {error.get('detalhes') or ''}")
        return None
    except requests.exceptions.RequestException as e:
        detalhes = e.response.text if hasattr(e, 'response') and e.response is not None else str(e)
        error = _set_serpro_auth_error("Erro de comunicação ao solicitar token SERPRO.", detalhes)
        logger.error(f"Erro ao solicitar token: {error['erro']} {error.get('detalhes') or ''}")
        return None
    except Exception as e:
        error = _set_serpro_auth_error("Erro inesperado ao solicitar token SERPRO.", str(e))
        logger.error(f"Erro ao solicitar token: {error['erro']} {error.get('detalhes') or ''}")
        return None

def orquestrar_consulta_extrato(cnpj_empresa, periodo_apuracao):
    """
    Orquestra o novo fluxo de 2 passos para obter o extrato de um mês específico.
    1. Usa CONSDECLARACAO13 para obter a lista de DAS do ano.
    2. Encontra o DAS do mês desejado.
    3. Usa CONSEXTRATO16 para obter o PDF do extrato daquele DAS.
    """
    tokens = get_serpro_token()
    if not tokens:
        return {"sucesso": False, **_get_serpro_auth_error()}
    
    # --- PASSO A: Buscar a lista de declarações do ano ---
    ano_calendario = periodo_apuracao[:4] # Extrai o ano "YYYY" de "YYYYMM"
    
    url_consulta_ano = f"{GATEWAY_URL}/Consultar"
    headers = {
        "Authorization": f"Bearer {tokens['access_token']}",
        "jwt_token": tokens['jwt_token'],
        "Content-Type": "application/json"
    }
    cnpj_contratante = settings.MEU_ESCRITORIO_CNPJ
    payload_lista_declaracoes = {
        "contratante": {"numero": cnpj_contratante, "tipo": 2},
        "autorPedidoDados": {"numero": cnpj_contratante, "tipo": 2},
        "contribuinte": {"numero": cnpj_empresa, "tipo": 2},
        "pedidoDados": {
            "idSistema": "PGDASD",
            "idServico": "CONSDECLARACAO13",
            "versaoSistema": "1.0",
            "dados": json.dumps({"anoCalendario": ano_calendario})
        }
    }

    try:
        logger.info(f"Passo A - Buscando lista de declarações para o ano {ano_calendario}")
        response_lista = requests.post(url_consulta_ano, json=payload_lista_declaracoes, headers=headers, timeout=SERPRO_TIMEOUT)
        response_lista.raise_for_status()
        response_data_lista = response_lista.json()
        logger.info(f"Resposta do Passo A (Lista): {response_data_lista}")

        # --- PASSO B: Encontrar o numeroDas para o mês desejado ---
        numero_das_alvo = None
        dados_lista_str = response_data_lista.get('dados')
        if dados_lista_str:
            dados_lista = json.loads(dados_lista_str)
            periodos = dados_lista.get('periodos', [])
            for periodo in periodos:
                if str(periodo.get('periodoApuracao')) == periodo_apuracao:
                    # Encontramos o mês correto, agora procuramos o último DAS gerado
                    operacoes = periodo.get('operacoes', [])
                    for op in reversed(operacoes): # Começa do final para pegar a última geração
                        if op.get('tipoOperacao') == 'Geração de DAS' and op.get('indiceDas'):
                            numero_das_alvo = op['indiceDas'].get('numeroDas')
                            if numero_das_alvo:
                                logger.info(f"Encontrado numeroDas '{numero_das_alvo}' para o período {periodo_apuracao}")
                                break # Para o loop interno
                    break # Para o loop externo

        if not numero_das_alvo:
            return {"sucesso": False, "erro": f"Não foi encontrada uma guia DAS gerada para o período {periodo_apuracao[4:]}/{periodo_apuracao[:4]}."}

        # --- PASSO C: Usar o numeroDas para obter o PDF do extrato ---
        url_extrato = f"{GATEWAY_URL}/Consultar"
        payload_extrato = {
            "contratante": {"numero": cnpj_contratante, "tipo": 2},
            "autorPedidoDados": {"numero": cnpj_contratante, "tipo": 2},
            "contribuinte": {"numero": cnpj_empresa, "tipo": 2},
            "pedidoDados": { "idSistema": "PGDASD", "idServico": "CONSEXTRATO16", "versaoSistema": "1.0", "dados": json.dumps({"numeroDas": numero_das_alvo}) }
        }

        logger.info(f"Passo C - Buscando PDF do extrato para o DAS '{numero_das_alvo}'")
        response_pdf = requests.post(url_extrato, json=payload_extrato, headers=headers, timeout=SERPRO_TIMEOUT)
        response_pdf.raise_for_status()
        
        # O serviço CONSEXTRATO16 retorna um JSON com o PDF em Base64
        response_pdf_data = response_pdf.json()
        dados_pdf_str = response_pdf_data.get('dados')
        if not dados_pdf_str: return {"sucesso": False, "erro": "API não retornou dados ao buscar PDF."}

        dados_pdf = json.loads(dados_pdf_str)
        pdf_base64 = dados_pdf.get('extrato', {}).get('pdf')
        if not pdf_base64: return {"sucesso": False, "erro": "PDF não encontrado na resposta da API."}
        
        pdf_content = base64.b64decode(pdf_base64)
        filename = dados_pdf.get('extrato', {}).get('nomeArquivo', f"Extrato_{cnpj_empresa}_{periodo_apuracao}.pdf")
        
        return {"sucesso": True, "pdf_content": pdf_content, "filename": filename}

    except Exception as e:
        logger.error(f"Erro no fluxo de consulta de extrato: {e}")
        detalhes = e.response.text if hasattr(e, 'response') and e.response is not None else str(e)
        return {"sucesso": False, "erro": "Erro de comunicação ou resposta inesperada da API Serpro.", "detalhes": detalhes}

def gerar_das_serpro(cnpj_empresa, periodo_apuracao):
    """
    Chama a API Serpro usando o serviço GERARDAS12 para gerar o DAS de um período específico,
    retornando o PDF mesmo sem débitos, conforme comportamento do e-CAC.
    """
    tokens = get_serpro_token()
    if not tokens:
        return {"sucesso": False, **_get_serpro_auth_error()}

    url = f"{GATEWAY_URL}/Emitir"
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
            "idServico": "GERARDAS12",
            "versaoSistema": "1.0",
            "dados": json.dumps({"periodoApuracao": periodo_apuracao})
        }
    }

    logger.info(f"Enviando payload para GERAR DAS: {json.dumps(payload, indent=2)}")

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=SERPRO_TIMEOUT)
        
        if response.status_code == 401:
            logger.warning("Token expirado (401). Renovando e tentando novamente.")
            cache.delete(SERPRO_TOKEN_CACHE_KEY)
            tokens = get_serpro_token()
            if not tokens:
                return {"sucesso": False, **_get_serpro_auth_error("Falha ao renovar token.")}
            headers["Authorization"] = f"Bearer {tokens['access_token']}"
            headers["jwt_token"] = tokens['jwt_token']
            response = requests.post(url, json=payload, headers=headers, timeout=SERPRO_TIMEOUT)

        response.raise_for_status()

        response_data = response.json()
        logger.info(f"Resposta da API Serpro: {json.dumps(response_data, indent=2)}")

        mensagens = response_data.get('mensagens', [])
        dados_str = response_data.get('dados')

        # Verifica se há mensagem de "sem valor devido" ou sucesso
        if any('MSG_E0139' in msg.get('codigo', '') for msg in mensagens):
            # Mesmo sem débitos, o e-CAC gera um PDF. A resposta contém uma lista.
            if not dados_str:
                return {"sucesso": False, "erro": "Nenhum dado retornado pela API para o período informado."}
            
            dados = json.loads(dados_str)
            if isinstance(dados, list) and len(dados) > 0:
                dados_item = dados[0]  # Extrai o primeiro item da lista
                pdf_base64 = dados_item.get('pdf') or dados_item.get('extrato', {}).get('pdf')
                if not pdf_base64:
                    return {"sucesso": False, "erro": "PDF não encontrado na resposta da API."}
                
                pdf_content = base64.b64decode(pdf_base64)
                filename = dados_item.get('nomeArquivo', f"DAS_{cnpj_empresa}_{periodo_apuracao}.pdf")
                logger.info(f"PDF do DAS gerado com sucesso para {cnpj_empresa}/{periodo_apuracao} (sem débitos).")
                return {"sucesso": True, "pdf_content": pdf_content, "filename": filename}
            else:
                return {"sucesso": False, "erro": "Formato de dados inválido: lista vazia ou formato inesperado."}

        # Verifica se há sucesso na resposta
        if not any('sucesso' in msg.get('texto', '').lower() for msg in mensagens):
            error_message = mensagens[0].get('texto', 'Erro não especificado pela API.')
            return {"sucesso": False, "erro": error_message}

        # Caso de sucesso com débitos
        if not dados_str:
            return {"sucesso": False, "erro": "Nenhum dado retornado pela API."}
        
        dados = json.loads(dados_str)
        if isinstance(dados, list) and len(dados) > 0:
            dados_item = dados[0]  # Extrai o primeiro item da lista
            pdf_base64 = dados_item.get('pdf') or dados_item.get('extrato', {}).get('pdf')
            if not pdf_base64:
                return {"sucesso": False, "erro": "PDF não encontrado na resposta da API."}
            
            pdf_content = base64.b64decode(pdf_base64)
            filename = dados_item.get('nomeArquivo', f"DAS_{cnpj_empresa}_{periodo_apuracao}.pdf")
            logger.info(f"PDF do DAS gerado com sucesso para {cnpj_empresa}/{periodo_apuracao}.")
            return {"sucesso": True, "pdf_content": pdf_content, "filename": filename}
        else:
            return {"sucesso": False, "erro": "Formato de dados inválido: lista vazia ou formato inesperado."}

    except requests.exceptions.RequestException as e:
        logger.error(f"Erro na requisição para gerar DAS: {e}")
        detalhes_erro = e.response.text if hasattr(e, 'response') and e.response is not None else str(e)
        return {"sucesso": False, "erro": "Erro de comunicação com a API Serpro.", "detalhes": detalhes_erro}
    except Exception as e:
        logger.error(f"Erro ao processar resposta da API: {e}")
        return {"sucesso": False, "erro": "Erro ao processar a resposta da API Serpro."}
    
def obter_dados_extrato_serpro(cnpj_empresa, periodo_apuracao):
    """
    Faz uma ÚNICA chamada à API com o serviço GERARDAS12 para obter
    os dados do extrato de um período de apuração.
    Trata tanto respostas com dados quanto respostas de aviso (ex: sem valor devido).
    """
    tokens = get_serpro_token()
    if not tokens:
        return {"sucesso": False, **_get_serpro_auth_error()}

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
        response = requests.post(url, json=payload, headers=headers, timeout=SERPRO_TIMEOUT)
        
        if response.status_code == 401:
            logger.warning("Token expirado (401). Renovando...")
            cache.delete(SERPRO_TOKEN_CACHE_KEY)
            tokens = get_serpro_token()
            if not tokens: return {"sucesso": False, **_get_serpro_auth_error("Falha ao renovar token.")}
            headers["Authorization"] = f"Bearer {tokens['access_token']}"
            headers["jwt_token"] = tokens['jwt_token']
            response = requests.post(url, json=payload, headers=headers, timeout=SERPRO_TIMEOUT)

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
    response = requests.post(url, json=payload, headers=headers, timeout=SERPRO_TIMEOUT)
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

def obter_extrato_pdf_serpro(cnpj_empresa, numero_das):
    """
    Chama o serviço CONSEXTRATO16 para obter o PDF de um extrato de DAS existente.
    Agora, esta função é responsável por obter o token.
    """
    # CHAMA A FUNÇÃO DE OBTER TOKEN INTERNAMENTE
    tokens = get_serpro_token()
    if not tokens:
        # A get_serpro_token já loga o erro, aqui apenas retornamos o resultado
        return {"sucesso": False, **_get_serpro_auth_error("Falha na autenticação com a API Serpro ao buscar extrato.")}

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
        response = requests.post(url, json=payload, headers=headers, timeout=SERPRO_TIMEOUT)
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

def gerar_e_enviar_das(cnpj_empresa, periodo_apuracao=None, request=None, template_name="enviar_sn"):
    """
    Gera o DAS para o mês anterior ao atual, envia automaticamente via WhatsApp,
    marca o campo simples_nacional da empresa como True, cria notificações e registra no histórico.
    """
    # Configurar locale para português do Brasil
    locale.setlocale(locale.LC_TIME, 'pt_BR.UTF-8')

    try:
        # Validar CNPJ
        if not cnpj_empresa:
            logger.error("CNPJ não fornecido.")
            return {"sucesso": False, "erro": "CNPJ é obrigatório."}

        # Normalizar CNPJ
        from .utils import normalize_cnpj
        cnpj_empresa_clean = normalize_cnpj(cnpj_empresa)
        if len(cnpj_empresa_clean) != 14:
            logger.error(f"CNPJ inválido: {cnpj_empresa_clean}")
            return {"sucesso": False, "erro": "CNPJ inválido. Deve conter 14 caracteres."}
        
        cnpj_empresa_formatted = (
            f"{cnpj_empresa_clean[:2]}.{cnpj_empresa_clean[2:5]}.{cnpj_empresa_clean[5:8]}/"
            f"{cnpj_empresa_clean[8:12]}-{cnpj_empresa_clean[12:]}"
        )
        logger.info(f"Buscando empresa com CNPJ: {cnpj_empresa_formatted}")

        # Buscar empresa
        try:
            empresa = Empresa.objects.get(cnpj=cnpj_empresa_formatted)
        except ObjectDoesNotExist:
            logger.error(f"Empresa com CNPJ {cnpj_empresa_formatted} não encontrada.")
            return {"sucesso": False, "erro": f"Empresa com CNPJ {cnpj_empresa_formatted} não encontrada."}

        # Validar telefone
        if not empresa.telefone:
            logger.error(f"A empresa {empresa.nome} não possui número de telefone cadastrado.")
            return {"sucesso": False, "erro": f"A empresa {empresa.nome} não possui número de telefone cadastrado."}

        telefone = empresa.telefone
        if not telefone.startswith('+'):
            telefone = f'+{telefone}'
        logger.info(f"Número de telefone normalizado: {telefone}")

        # Definir período de apuração (mês anterior)
        if not periodo_apuracao:
            data_mes_atual = datetime.now().replace(day=1)
            data_mes_anterior = data_mes_atual - relativedelta(months=1)
            periodo_apuracao = data_mes_anterior.strftime('%m/%Y')  # Formato MM/YYYY
            periodo_apuracao_alt = data_mes_anterior.strftime('%Y%m')  # Formato YYYYMM para compatibilidade
            mes_passado = data_mes_anterior.strftime('%B/%Y')  # Ex.: "Agosto/2025" em português
            logger.info(f"Período de apuração definido como mês anterior: {periodo_apuracao}")
        else:
            periodo_apuracao_alt = ''.join(filter(str.isdigit, periodo_apuracao))  # Para compatibilidade com YYYYMM
            logger.info(f"Período de apuração fornecido: {periodo_apuracao}")
            # Calcular mês anterior a partir de periodo_apuracao
            mes_ano = periodo_apuracao.split('/')
            if len(mes_ano) == 2:
                data = datetime.strptime(periodo_apuracao, '%m/%Y')
                data_mes_anterior = data.replace(day=1) - relativedelta(months=1)
                mes_passado = data_mes_anterior.strftime('%B/%Y')  # Em português
            else:
                data_mes_anterior = datetime.now().replace(day=1) - relativedelta(months=1)
                mes_passado = data_mes_anterior.strftime('%B/%Y')  # Fallback para mês anterior atual

        # Tentar gerar DAS com formato MM/YYYY, depois com YYYYMM se necessário
        das_result = gerar_das_serpro(cnpj_empresa_clean, periodo_apuracao)
        if not das_result["sucesso"]:
            logger.info(f"Tentando formato alternativo de período: {periodo_apuracao_alt}")
            das_result = gerar_das_serpro(cnpj_empresa_clean, periodo_apuracao_alt)
            if not das_result["sucesso"]:
                logger.error(f"Falha ao gerar DAS: {das_result['erro']}")
                return das_result

        pdf_content = das_result["pdf_content"]
        filename = das_result["filename"]

        # Processar o arquivo PDF
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            temp_file.write(pdf_content)
            temp_file_path = temp_file.name

        try:
            media_id, _ = upload_media_to_whatsapp(temp_file_path, filename)
            if not media_id:
                logger.error("Falha ao fazer upload do PDF para o WhatsApp.")
                HistoricoEnvios.objects.create(
                    remetente=telefone,
                    arquivo=filename,
                    status='falha',
                    data_envio=timezone.now(),
                    usuario=None,
                    erro="Falha ao fazer upload do PDF para o WhatsApp.",
                    empresa=empresa,
                )
                return {"sucesso": False, "erro": "Falha ao fazer upload do PDF para o WhatsApp."}

            # Envia o template com parâmetros dinâmicos
            template_params = {
                "period_month": mes_passado  # Para enviar_sn e enviar_dp
            }
            message_id, error = send_whatsapp_document_template_message(
                recipient_number=telefone,
                document_media_id=media_id,
                document_filename=filename,
                template_params=template_params,
                template_name=template_name,
                company_name=empresa.nome,
            )

            if not message_id:
                logger.error(f"Falha ao enviar o DAS via WhatsApp: {error}")
                HistoricoEnvios.objects.create(
                    remetente=telefone,
                    arquivo=filename,
                    status='falha',
                    data_envio=timezone.now(),
                    usuario=None,
                    erro=f"Falha ao enviar o DAS via WhatsApp: {error}",
                    empresa=empresa,
                )
                return {"sucesso": False, "erro": f"Falha ao enviar o DAS via WhatsApp: {error}"}

            # Marcar simples_nacional como True
            empresa.simples_nacional = True
            empresa.save()
            logger.info(f"Campo simples_nacional marcado como True para a empresa {empresa.nome}.")

            # Criar notificação para todos os funcionários associados
            users_to_notify = Funcionario.objects.filter(usercompanyaccess__empresa=empresa)
            logger.info(f"Enviando DAS para '{empresa.nome}'. Usuários a notificar: {[user.username for user in users_to_notify]}")
            for user in users_to_notify:
                Notificacao.objects.create(
                    destinatario=user,
                    mensagem=f"DAS de {periodo_apuracao} enviado para a empresa '{empresa.nome}'."
                )
            logger.info(f"Notificações criadas para envio do DAS da empresa '{empresa.nome}'.")

            # Registrar no histórico com o usuário autenticado
            usuario = None
            if request and hasattr(request, 'user') and not request.user.is_anonymous:
                try:
                    usuario = Funcionario.objects.get(id=request.user.id)
                except ObjectDoesNotExist:
                    logger.warning(f"Usuário {request.user} não encontrado como Funcionario.")
            HistoricoEnvios.objects.create(
                remetente=telefone,
                arquivo=filename,
                status='sucesso',
                message_id=message_id,
                data_envio=timezone.now(),
                usuario=usuario
            )
            logger.info(f"DAS enviado com sucesso para {empresa.nome} ({cnpj_empresa_formatted}) via WhatsApp. Registro no histórico criado.")

            return {
                "sucesso": True,
                "mensagem": f"DAS de {periodo_apuracao} enviado com sucesso para {empresa.nome}.",
                "filename": filename,
                "message_id": message_id
            }
        finally:
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
    except Exception as e:
        logger.error(f"Erro ao gerar e enviar DAS: {e}")
        HistoricoEnvios.objects.create(
            remetente=telefone if 'telefone' in locals() else None,
            arquivo=filename if 'filename' in locals() else None,
            status='falha',
            data_envio=timezone.now(),
            usuario=None,
            erro=f"Erro ao processar a geração e envio do DAS via WhatsApp: {str(e)}"
        )
        return {"sucesso": False, "erro": "Erro ao processar a geração e envio do DAS via WhatsApp."}


    
