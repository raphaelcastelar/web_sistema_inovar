# empresas/whatsapp_utils.py
import requests
import json
import os
import mimetypes
from django.conf import settings
import logging
from django.utils import timezone
from .models import Empresa, WhatsAppMessage

logger = logging.getLogger(__name__)

def log_whatsapp_message(wamid, to, message, msg_type, timestamp, raw_payload):
    try:
        if timestamp:
            try:
                ts = timezone.datetime.fromtimestamp(int(timestamp), tz=timezone.utc)
            except Exception:
                ts = timezone.datetime.fromisoformat(str(timestamp).replace('Z', '+00:00'))
        else:
            ts = timezone.now()

        WhatsAppMessage.objects.update_or_create(
            wamid=wamid,
            defaults={
                "to": to,
                "message": message or "",
                "msg_type": msg_type or "",
                "timestamp": ts,
                "raw_payload": raw_payload or {},
            }
        )
    except Exception as e:
        logger.error(f"Falha ao registrar mensagem no banco: {e}")

def upload_media_to_whatsapp(file_path, original_filename):
    # ... (código da função upload_media_to_whatsapp como definido anteriormente) ...
    # Exemplo:
    url = f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/media"
    headers = {"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"}
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type: mime_type = 'application/octet-stream'
    files = {'file': (original_filename, open(file_path, 'rb'), mime_type), 'messaging_product': (None, 'whatsapp')}
    logger.info(f"Fazendo upload da mídia: {original_filename} para {url}")
    try:
        response = requests.post(url, headers=headers, files=files)
        response.raise_for_status()
        media_data = response.json()
        logger.info(f"Resposta do upload da mídia: {media_data}")
        return media_data.get("id"), original_filename
    except requests.exceptions.RequestException as e:
        logger.error(f"Erro no upload da mídia {original_filename}: {e}")
        if hasattr(e, 'response') and e.response is not None: logger.error(f"Conteúdo da resposta: {e.response.text}")
        return None, original_filename
    except Exception as e:
        logger.error(f"Erro inesperado no upload da mídia {original_filename}: {e}")
        return None, original_filename

def send_whatsapp_document_template_message(
    recipient_number: str,
    document_media_id: str,
    document_filename: str,
    template_name: str,
    template_params: dict = None,
    company_name: str = None
):
    api_url = f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}", "Content-Type": "application/json"}

    # Normaliza o número de telefone para remover o '+' se presente
    normalized_phone = recipient_number.replace('+', '') if recipient_number.startswith('+') else recipient_number

    resolved_company_name = company_name

    if not resolved_company_name:
        empresas = Empresa.objects.filter(telefone=normalized_phone)

        if empresas.count() == 1:
            resolved_company_name = empresas.first().nome
        elif empresas.count() > 1:
            logger.warning(
                f"Telefone {normalized_phone} está associado a múltiplas empresas. "
                "O nome da empresa precisa ser informado explicitamente no envio do WhatsApp."
            )
            resolved_company_name = "Empresa"
        else:
            resolved_company_name = "Empresa Desconhecida"

    # Mapeamento dinâmico de parâmetros com base no template_name
    template_configs = {
        "enviar_sn": {
            "body_params": [
                {"type": "text", "text": resolved_company_name},  # 1ª variável: Nome da empresa
                {"type": "text", "text": template_params.get("period_month", "") if template_params else ""}  # 2ª variável: Mês anterior
            ]
        },
        "envio_documento_com_contato": {
            "body_params": [
                {"type": "text", "text": document_filename},  # 1ª variável: Nome do arquivo
                {"type": "text", "text": resolved_company_name}       # 2ª variável: Nome da empresa
            ]
        },
        "honorario": {
            "body_params": [
                {"type": "text", "text": resolved_company_name}
            ]
        },
        "enviar_dp": {
            "body_params": [
                {"type": "text", "text": resolved_company_name},  # 1ª variável: Nome da empresa
                {"type": "text", "text": template_params.get("period_month", "") if template_params else ""}  # 2ª variável: Mês anterior
            ]
        }
    }

    # Usa a configuração específica do template
    config = template_configs.get(template_name)
    if not config:
        logger.error(f"Template '{template_name}' não configurado em template_configs.")
        return None, f"Template '{template_name}' não suportado."

    body_params = config.get("body_params", [
        {"type": "text", "text": resolved_company_name},
        {"type": "text", "text": ""}
    ])

    # Montar o payload do template
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": recipient_number,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "pt_BR"},
            "components": [
                {
                    "type": "header",
                    "parameters": [
                        {
                            "type": "document",
                            "document": {"id": document_media_id, "filename": document_filename}
                        }
                    ]
                },
                {
                    "type": "body",
                    "parameters": body_params
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
            msg = response_data["messages"][0]
            wamid = msg.get("id")
            ts = msg.get("timestamp")
            log_whatsapp_message(
                wamid=wamid,
                to=recipient_number,
                message=f"template:{template_name}",
                msg_type="template",
                timestamp=ts,
                raw_payload=response_data,
            )
            return wamid, None
        return None, "Nenhum message_id na resposta."
    except requests.exceptions.RequestException as e:
        error_message = f"Erro API: {e}"
        if hasattr(e, 'response') and e.response is not None:
            error_message += f" - Resposta: {e.response.text}"
        logger.error(error_message)
        return None, error_message
    except Exception as e:
        logger.error(f"Erro inesperado: {e}")
        return None, str(e)
