import requests
import json
import os
import mimetypes # Para adivinhar o tipo MIME do arquivo
from django.conf import settings
from .models import DocumentosConstitutivos, Empresa # Supondo que Empresa é seu modelo de empresa
import logging

logger = logging.getLogger(__name__)

def upload_media_to_whatsapp(file_path, original_filename):
    """
    Faz o upload de um arquivo para os servidores do WhatsApp/Meta e retorna o media_id.
    """
    url = f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/media"
    headers = {
        "Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}",
    }
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = 'application/octet-stream' # Fallback genérico

    files = {
        'file': (original_filename, open(file_path, 'rb'), mime_type),
        'messaging_product': (None, 'whatsapp'),
    }
    logger.info(f"Fazendo upload da mídia: {original_filename}, mimetype: {mime_type} para {url}")
    try:
        response = requests.post(url, headers=headers, files=files)
        response.raise_for_status()  # Levanta um erro para códigos HTTP ruins (4xx ou 5xx)
        media_data = response.json()
        logger.info(f"Resposta do upload da mídia: {media_data}")
        return media_data.get("id"), original_filename
    except requests.exceptions.RequestException as e:
        logger.error(f"Erro no upload da mídia {original_filename}: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"Conteúdo da resposta do erro de upload: {e.response.text}")
        return None, original_filename
    except Exception as e:
        logger.error(f"Erro inesperado no upload da mídia {original_filename}: {e}")
        return None, original_filename

def send_whatsapp_document_template_message(
    recipient_number: str,
    document_media_id: str,
    document_filename: str,
    company_name_for_template: str, # Nome da empresa para o corpo do template
    template_name: str = settings.WHATSAPP_TEMPLATE_NAME_DOCS
):
    """
    Envia uma mensagem de template do WhatsApp com um documento.
    """
    api_url = f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": recipient_number, # Número do destinatário
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "pt_BR"},
            "components": [
                {
                    "type": "header",
                    "parameters": [{
                        "type": "document",
                        "document": {"id": document_media_id, "filename": document_filename}
                    }]
                },
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": document_filename},      # Parâmetro {{1}} do template
                        {"type": "text", "text": company_name_for_template} # Parâmetro {{2}} do template
                    ]
                }
            ]
        }
    }

    logger.info(f"Enviando payload do template: {json.dumps(payload, indent=2, ensure_ascii=False)} para {api_url}")
    try:
        response = requests.post(api_url, json=payload, headers=headers)
        response.raise_for_status()
        response_data = response.json()
        logger.info(f"Resposta do envio do template: {json.dumps(response_data, indent=2, ensure_ascii=False)}")
        if "messages" in response_data and response_data["messages"]:
            return response_data["messages"][0].get("id"), None  # message_id, erro
        return None, "Nenhum message_id na resposta do template."
    except requests.exceptions.RequestException as e:
        error_message = f"Erro na API ao enviar template: {e}"
        if hasattr(e, 'response') and e.response is not None:
            error_message += f" - Resposta: {e.response.text}"
        logger.error(error_message)
        return None, error_message
    except Exception as e:
        logger.error(f"Erro inesperado ao enviar template: {e}")
        return None, str(e)