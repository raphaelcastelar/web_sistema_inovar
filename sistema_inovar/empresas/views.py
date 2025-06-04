import os
import smtplib
import urllib.parse
import unidecode
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from email.utils import formatdate
from django.conf import settings
from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework import viewsets, status
from rest_framework.response import Response
from .models import Empresa, DocumentosConstitutivos, XML, DepartamentoPessoal, SimplesNacional, Outros
from .serializers import EmpresaSerializer, DocumentosConstitutivosSerializer, XMLSerializer, DepartamentoPessoalSerializer, SimplesNacionalSerializer, OutrosSerializer
import logging
import re
from .whatsapp_utils import upload_media_to_whatsapp, send_whatsapp_document_template_message

logger = logging.getLogger(__name__)

class EmpresaViewSet(viewsets.ModelViewSet):
    queryset = Empresa.objects.all()
    serializer_class = EmpresaSerializer

class DocumentosConstitutivosViewSet(viewsets.ModelViewSet):
    queryset = DocumentosConstitutivos.objects.all()  # Defina o queryset base
    serializer_class = DocumentosConstitutivosSerializer

    def get_queryset(self):
        empresa_id = self.kwargs.get('empresa_id') or self.request.query_params.get('empresa_id')
        if empresa_id:
            try:
                empresa = Empresa.objects.get(id=empresa_id)
                return DocumentosConstitutivos.objects.filter(nome_empresa=empresa.nome)
            except Empresa.DoesNotExist:
                return DocumentosConstitutivos.objects.none()
        return super().get_queryset()

class DepartamentoPessoalViewSet(viewsets.ModelViewSet):
    queryset = DepartamentoPessoal.objects.all()  # Defina o queryset base
    serializer_class = DepartamentoPessoalSerializer

    def get_queryset(self):
        empresa_id = self.kwargs.get('empresa_id') or self.request.query_params.get('empresa_id')
        if empresa_id:
            try:
                empresa = Empresa.objects.get(id=empresa_id)
                return DepartamentoPessoal.objects.filter(cnpj_empresa=empresa.cnpj)
            except Empresa.DoesNotExist:
                return DepartamentoPessoal.objects.none()
        return super().get_queryset()

class XMLViewSet(viewsets.ModelViewSet):
    queryset = XML.objects.all()  # Defina o queryset base
    serializer_class = XMLSerializer

    def get_queryset(self):
        empresa_id = self.kwargs.get('empresa_id') or self.request.query_params.get('empresa_id')
        if empresa_id:
            try:
                empresa = Empresa.objects.get(id=empresa_id)
                return XML.objects.filter(cnpj_empresa=empresa.cnpj)
            except Empresa.DoesNotExist:
                return XML.objects.none()
        return super().get_queryset()

class SimplesNacionalViewSet(viewsets.ModelViewSet):
    queryset = SimplesNacional.objects.all()  # Defina o queryset base
    serializer_class = SimplesNacionalSerializer

    def get_queryset(self):
        empresa_id = self.kwargs.get('empresa_id') or self.request.query_params.get('empresa_id')
        if empresa_id:
            try:
                empresa = Empresa.objects.get(id=empresa_id)
                return SimplesNacional.objects.filter(cnpj_empresa=empresa.cnpj)
            except Empresa.DoesNotExist:
                return SimplesNacional.objects.none()
        return super().get_queryset()

class OutrosViewSet(viewsets.ModelViewSet):
    queryset = Outros.objects.all()
    serializer_class = OutrosSerializer

    def get_queryset(self):
        empresa_id = self.kwargs.get('empresa_id') or self.request.query_params.get('empresa_id')
        if empresa_id:
            try:
                empresa = Empresa.objects.get(id=empresa_id)
                return Outros.objects.filter(nome_empresa=empresa.nome)
            except Empresa.DoesNotExist:
                return Outros.objects.none()
        return super().get_queryset()

@api_view(['POST'])
def enviar_email(request):
    try:
        empresa_id = int(request.data.get('empresa_id'))
        tipo_pasta = request.data.get('tipo_pasta')
        file_ids = request.data.get('file_ids', [])

        logger.info(f"Requisição recebida: empresa_id={empresa_id}, tipo_pasta={tipo_pasta}, file_ids={file_ids}")

        if not empresa_id or not tipo_pasta or not file_ids:
            return Response({'error': 'Faltam parâmetros: empresa_id, tipo_pasta ou file_ids.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            empresa = Empresa.objects.get(id=empresa_id)
            nome_empresa = empresa.nome
            email_destinatario = empresa.email
            if not email_destinatario:
                return Response({'error': f'Email não cadastrado para a empresa ID {empresa_id}.'}, status=status.HTTP_400_BAD_REQUEST)
        except Empresa.DoesNotExist:
            return Response({'error': f'Empresa com ID {empresa_id} não encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        modelos = {
            'documentos_constitutivos': (DocumentosConstitutivos, 'nome_empresa'),
            'departamento_pessoal': (DepartamentoPessoal, 'cnpj_empresa'),
            'xml': (XML, 'cnpj_empresa'),
            'simples_nacional': (SimplesNacional, 'cnpj_empresa'),
            'outros': (Outros, 'nome_empresa'), 
        }

        if tipo_pasta not in modelos:
            return Response({'error': f'Tipo de pasta inválido: {tipo_pasta}.'}, status=status.HTTP_400_BAD_REQUEST)

        modelo, campo_empresa = modelos[tipo_pasta]
        if campo_empresa == 'nome_empresa':
            arquivos = modelo.objects.filter(id__in=file_ids, nome_empresa=nome_empresa)
        else:
            arquivos = modelo.objects.filter(id__in=file_ids, cnpj_empresa=empresa.cnpj)

        logger.info(f"Arquivos encontrados: {list(arquivos.values('id', 'nome_arquivo', 'nome_empresa'))}")

        if not arquivos.exists():
            return Response({'error': 'Nenhum arquivo encontrado para os IDs fornecidos.'}, status=status.HTTP_404_NOT_FOUND)

        # Verificar tamanho total dos arquivos
        total_size = 0
        caminhos_arquivos = []
        nomes_arquivos = []
        for arquivo in arquivos:
            caminho_arquivo = arquivo.caminho_arquivo.path  # Caminho absoluto no servidor
            if os.path.exists(caminho_arquivo):
                total_size += os.path.getsize(caminho_arquivo)
                caminhos_arquivos.append(caminho_arquivo)
                nomes_arquivos.append(arquivo.nome_arquivo)
            else:
                logger.warning(f"Arquivo não encontrado no servidor: {caminho_arquivo}")

        if total_size > 20 * 1024 * 1024:  # 20 MB
            return Response({'error': 'O tamanho total dos arquivos excede 20 MB.'}, status=status.HTTP_400_BAD_REQUEST)

        # Preparar o email
        msg = MIMEMultipart()
        msg['From'] = settings.EMAIL_REMETENTE
        msg['To'] = email_destinatario
        msg['Subject'] = f"Envio de Documentos - {empresa.nome}"
        msg['Date'] = formatdate(localtime=True)

        body = f"Prezado(a),\n\nSegue(m) em anexo o(s) arquivo(s) da empresa {empresa.nome}:\n"
        for nome_arquivo in nomes_arquivos:
            body += f"- {nome_arquivo}\n"
        body += "\nAtenciosamente, Inovar Contabilidade"
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        # Anexar os arquivos
        for caminho_arquivo, nome_arquivo in zip(caminhos_arquivos, nomes_arquivos):
            extensao = os.path.splitext(nome_arquivo)[1].lower()
            content_types = {
                '.pdf': 'application/pdf',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.xls': 'application/vnd.ms-excel',
                '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
            }
            content_type = content_types.get(extensao, 'application/octet-stream')

            nome_arquivo_simples = unidecode.unidecode(nome_arquivo).replace(' ', '_').replace('"', '')
            nome_arquivo_codificado = urllib.parse.quote(nome_arquivo)

            part = MIMEBase(*content_type.split('/', 1))
            with open(caminho_arquivo, 'rb') as attachment:
                part.set_payload(attachment.read())
            encoders.encode_base64(part)
            part.add_header('Content-Disposition', f'attachment; filename="{nome_arquivo_simples}"')
            part.add_header('Content-Disposition', f'attachment; filename*=UTF-8\'\'{nome_arquivo_codificado}')
            part.add_header('Content-Transfer-Encoding', 'base64')
            msg.attach(part)

        # Enviar o email
        dominio = settings.EMAIL_REMETENTE.split('@')[1].lower()
        if dominio == 'gmail.com':
            smtp_server = 'smtp.gmail.com'
            smtp_port = 587
        elif dominio in ['hotmail.com', 'outlook.com']:
            smtp_server = 'smtp-mail.outlook.com'
            smtp_port = 587
        elif dominio == 'yahoo.com':
            smtp_server = 'smtp.mail.yahoo.com'
            smtp_port = 587
        else:
            return Response({'error': f'Provedor de email {dominio} não suportado.'}, status=status.HTTP_400_BAD_REQUEST)

        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(settings.EMAIL_REMETENTE, settings.EMAIL_SENHA_APP)
        server.sendmail(settings.EMAIL_REMETENTE, email_destinatario, msg.as_string())
        server.quit()

        return Response({'message': f'Email enviado com sucesso para {email_destinatario}.'}, status=status.HTTP_200_OK)

    except smtplib.SMTPAuthenticationError:
        logger.error("Erro de autenticação no envio de email: Credenciais inválidas.")
        return Response({'error': 'Erro de autenticação: Credenciais de email inválidas.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        logger.error(f"Erro ao enviar email: {str(e)}")
        return Response({'error': f'Erro ao enviar email: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    

@api_view(['POST'])
def enviar_doc_constitutivo_whatsapp_api(request):
    empresa_id = request.data.get('empresa_id')
    file_ids = request.data.get('file_ids')
    recipient_whatsapp_number = request.data.get('whatsapp_number')

    if not all([empresa_id, file_ids]):
        return Response(
            {"error": "Parâmetros faltando: empresa_id, file_ids e whatsapp_number são obrigatórios."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        empresa = Empresa.objects.get(id=empresa_id)
    except Empresa.DoesNotExist:
        return Response({"error": "Empresa não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    raw_phone_number = empresa.telefone
    if not raw_phone_number:
        logger.warning(f"Empresa {empresa.nome} (ID: {empresa_id}) não possui telefone cadastrado.")
        return Response({"error": "Telefone não cadastrado para esta empresa."}, status=status.HTTP_400_BAD_REQUEST)
    recipient_whatsapp_number = re.sub(r'\D', '', raw_phone_number)

    if not (recipient_whatsapp_number.startswith('55') and 12 <= len(recipient_whatsapp_number) <= 13) and \
       not (10 <= len(recipient_whatsapp_number) <= 11 and not recipient_whatsapp_number.startswith('55')): # Para números locais sem DDI, assumindo que pode ser necessário adicionar 55
        logger.warning(f"Número de telefone da empresa '{empresa.nome}' (ID: {empresa_id}) "
                       f"após limpeza ('{recipient_whatsapp_number}') não parece ser um número de WhatsApp válido "
                       f"(original: '{raw_phone_number}').")

        if not (len(recipient_whatsapp_number) >= 10 and len(recipient_whatsapp_number) <= 13 and recipient_whatsapp_number.isdigit()):
             return Response({"error": f"O número de telefone '{raw_phone_number}' cadastrado para a empresa não é válido para WhatsApp. Deve conter apenas números e ter entre 10 a 13 dígitos (com DDI)."}, status=status.HTTP_400_BAD_REQUEST)
        # Se não começar com 55, você pode querer prefixar automaticamente, ou exigir que o usuário cadastre com DDI.
        # Por exemplo, se você sabe que todos os números são do Brasil:
        if not recipient_whatsapp_number.startswith('55') and len(recipient_whatsapp_number) in [10,11]: # DDD + Numero (8 ou 9 digitos)
            recipient_whatsapp_number = '55' + recipient_whatsapp_number
        elif not recipient_whatsapp_number.startswith('55'): # Outros casos
            return Response({"error": f"O DDI (ex: 55 para Brasil) parece estar faltando no número de telefone '{raw_phone_number}'."}, status=status.HTTP_400_BAD_REQUEST)

    logger.info(f"Número de WhatsApp a ser utilizado para {empresa.nome}: {recipient_whatsapp_number}")


    documentos_qs = DocumentosConstitutivos.objects.filter(id__in=file_ids, nome_empresa=empresa.nome)

    if not documentos_qs.exists():
        return Response(
            {"error": "Nenhum documento constitutivo válido encontrado."},
            status=status.HTTP_404_NOT_FOUND
        )

    files_sent_count = 0
    successful_sends = []
    failed_sends = []
    company_name_for_template = empresa.nome

    for doc in documentos_qs:
        if not doc.caminho_arquivo or not hasattr(doc.caminho_arquivo, 'path'):
            logger.warning(f"Documento ID {doc.id} ({doc.nome_arquivo}) sem caminho de arquivo.")
            failed_sends.append({"filename": doc.nome_arquivo, "reason": "Caminho inválido."})
            continue
        
        file_path_on_server = doc.caminho_arquivo.path
        original_filename = doc.nome_arquivo
        logger.info(f"Processando WhatsApp para: {original_filename} -> {recipient_whatsapp_number}")

        media_id, _ = upload_media_to_whatsapp(file_path_on_server, original_filename)

        if not media_id:
            logger.error(f"Falha no upload da mídia para {original_filename}.")
            failed_sends.append({"filename": original_filename, "reason": "Falha no upload da mídia."})
            continue

        message_id, error_sending = send_whatsapp_document_template_message(
            recipient_number=recipient_whatsapp_number,
            document_media_id=media_id,
            document_filename=original_filename,
            company_name_for_template=company_name_for_template
        )

        if message_id:
            files_sent_count += 1
            successful_sends.append({"filename": original_filename, "message_id": message_id})
            logger.info(f"Template para {original_filename} enviado. ID: {message_id}")
        else:
            logger.error(f"Falha ao enviar template para {original_filename}: {error_sending}")
            failed_sends.append({"filename": original_filename, "reason": f"Falha no template: {error_sending}"})

    if files_sent_count > 0:
        return Response({
            "message": f"{files_sent_count} de {documentos_qs.count()} doc(s) processados.",
            "successful_sends": successful_sends,
            "failed_sends": failed_sends
        }, status=status.HTTP_200_OK)
    else:
        return Response({
            "error": "Nenhum documento enviado com sucesso.",
            "failed_sends": failed_sends
        }, status=status.HTTP_400_BAD_REQUEST)