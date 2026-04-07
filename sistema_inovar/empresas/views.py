import os
import smtplib
import tempfile
import urllib.parse
import re
import datetime
import unidecode
import logging
import requests
import base64
import logging
import json


from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from email.utils import formatdate
from dateutil.relativedelta import relativedelta

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.core.files.base import ContentFile
from datetime import timedelta
from django.db.models import OuterRef, Subquery, CharField
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt

from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend 
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework import viewsets, permissions

from empresas.serpro_service import gerar_e_enviar_das
from .permissions import IsPessoalOrFiscalOrAdmin


from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import black
from io import BytesIO
import qrcode
from reportlab.graphics.barcode import code39
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.graphics.barcode import code128
from barcode.codex import Code128
from barcode.writer import ImageWriter, SVGWriter
import base64
from qrcode.image.svg import SvgImage


import pdfkit
from django.template.loader import render_to_string

from .utils import get_bb_access_token

from .models import (
    Empresa, DocumentosConstitutivos, XML, DepartamentoPessoal, 
    SimplesNacional, Outros, HistoricoEnvios, Funcionario, ObrigacaoMensal, UserCompanyAccess, Pendencia, Notificacao,
    UltimoResultadoSessao

)
from .serializers import (
    EmpresaSerializer, DocumentosConstitutivosSerializer, XMLSerializer, 
    DepartamentoPessoalSerializer, SimplesNacionalSerializer, OutrosSerializer, 
    HistoricoEnviosSerializer, FuncionarioSerializer, PendenciaSerializer, NotificacaoSerializer,
    UltimoResultadoSessaoSerializer
)
from .utils import gerar_nome_pasta_empresa_padronizado, sanitize_filename_for_upload
from .serpro_service import (
    gerar_das_serpro, 
    obter_dados_extrato_serpro, 
    obter_extrato_pdf_serpro,
    orquestrar_consulta_extrato,
)
from .filters import HistoricoEnviosFilter
from .whatsapp_utils import upload_media_to_whatsapp, send_whatsapp_document_template_message

WKHTMLTOPDF_PATH = r'C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe'


logger = logging.getLogger(__name__)

MODEL_CONFIG_MAP = {
    'documentos_constitutivos': {
        'model': DocumentosConstitutivos, 
        'company_field_name': 'nome_empresa', 
        'company_attr': 'nome',
        'whatsapp_template_name': 'envio_documento_com_contato'
    },
    'departamento_pessoal': {
        'model': DepartamentoPessoal, 
        'company_field_name': 'cnpj_empresa', 
        'company_attr': 'cnpj',
        'whatsapp_template_name': 'enviar_dp' 
    },
    'simples_nacional': {
        'model': SimplesNacional, 
        'company_field_name': 'cnpj_empresa', 
        'company_attr': 'cnpj',
        'whatsapp_template_name': 'enviar_sn' 
    },
    'outros': {
        'model': Outros, 
        'company_field_name': 'nome_empresa', 
        'company_attr': 'nome',
        'whatsapp_template_name': 'envio_documento_com_contato'
    },
}

MODEL_CONFIG_MAP_SYNC = {
    'documentos_constitutivos': {
        'model': DocumentosConstitutivos, 'serializer': DocumentosConstitutivosSerializer,
        'company_field_name_in_doc_model': 'nome_empresa', # Campo no modelo do documento que guarda o nome da empresa
        'company_attr_in_empresa_model': 'nome', # Atributo no modelo Empresa para filtro (geralmente nome ou cnpj)
        'fs_folder_name': 'DOCUMENTOS CONSTITUTIVOS', 'has_year_month': False
    },
    'departamento_pessoal': {
        'model': DepartamentoPessoal, 'serializer': DepartamentoPessoalSerializer,
        'company_field_name_in_doc_model': 'nome_empresa', # Assumindo que você adicionou nome_empresa
        'company_attr_in_empresa_model': 'nome', 
        'fs_folder_name': 'DEPARTAMENTO PESSOAL', 'has_year_month': True
    },
    'simples_nacional': {
        'model': SimplesNacional, 'serializer': SimplesNacionalSerializer,
        'company_field_name_in_doc_model': 'nome_empresa', # Assumindo que você adicionou nome_empresa
        'company_attr_in_empresa_model': 'nome',
        'fs_folder_name': 'SIMPLES NACIONAL', 'has_year_month': True
    },
    'xml': {
        'model': XML, 'serializer': XMLSerializer,
        'company_field_name_in_doc_model': 'nome_empresa', # Assumindo que você adicionou nome_empresa
        'company_attr_in_empresa_model': 'nome',
        'fs_folder_name': 'XML', 'has_year_month': True
    },
    'outros': {
        'model': Outros, 'serializer': OutrosSerializer,
        'company_field_name_in_doc_model': 'nome_empresa',
        'company_attr_in_empresa_model': 'nome',
        'fs_folder_name': 'OUTROS', 'has_year_month': False
    },
}

class EmpresaViewSet(viewsets.ModelViewSet):
    queryset = Empresa.objects.all().order_by('nome')
    serializer_class = EmpresaSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'destroy']:  # Apenas create e destroy para admins
            return [IsAdminUser()]
        elif self.action == 'partial_update':  # partial_update para todos autenticados
            return [IsAuthenticated(), IsPessoalOrFiscalOrAdmin()]
        elif self.action == 'update':  # update para todos autenticados
            return [IsAuthenticated()]
        return [IsAuthenticated()]  # Padrão para list e retrieve

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.query_params.get('all') == 'true':
            return queryset
        if not self.request.user.is_staff and not self.request.user.is_superuser:
            queryset = queryset.filter(gerenciada_por=self.request.user)
        return queryset

    def destroy(self, request, *args, **kwargs):
        try:
            instance = self.get_queryset().get(pk=kwargs.get('pk'))
            empresa_nome = instance.nome
            users_to_notify = Funcionario.objects.filter(usercompanyaccess__empresa=instance)
            logger.info(f"Excluindo empresa '{empresa_nome}'. Usuários a notificar: {[user.username for user in users_to_notify]}")
            self.perform_destroy(instance)
            for user in users_to_notify:
                Notificacao.objects.create(
                    destinatario=user,
                    mensagem=f'Administrador excluiu a empresa "{empresa_nome}".'
                )
            logger.info(f"Notificações criadas para exclusão da empresa '{empresa_nome}'.")
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Empresa.DoesNotExist:
            logger.warning(f"Tentativa de excluir empresa com pk={kwargs.get('pk')} que não existe.")
            return Response({"error": "Empresa não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, *args, **kwargs):
        empresa_id = kwargs.get('pk')
        try:
            instance = self.get_queryset().get(pk=empresa_id)
            self.check_object_permissions(request, instance)
            serializer = self.get_serializer(instance, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                # Notificações são criadas automaticamente pelo signal post_save em signals.py
                logger.info(f"Empresa '{instance.nome}' atualizada parcialmente.")
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Empresa.DoesNotExist:
            return Response({"error": f"Empresa com ID {empresa_id} não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_queryset().get(pk=kwargs.get('pk'))
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        # Notificações são criadas automaticamente pelo signal post_save em signals.py
        logger.info(f"Empresa '{instance.nome}' atualizada.")
        return Response(serializer.data)
        
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

class HistoricoEnviosViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = HistoricoEnvios.objects.all()
    serializer_class = HistoricoEnviosSerializer
    filter_backends = [DjangoFilterBackend] # Adicione esta linha
    filterset_class = HistoricoEnviosFilter   # Adicione esta linha

class FuncionarioViewSet(viewsets.ModelViewSet):
    queryset = Funcionario.objects.prefetch_related('empresas_gerenciadas').all().order_by('first_name')
    serializer_class = FuncionarioSerializer
    permission_classes = [IsAdminUser]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            instance.groups.clear()
            instance.user_permissions.clear()
            instance.empresas_gerenciadas.clear()
            instance.usercompanyaccess.all().delete()
            self.perform_destroy(instance)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            logger.error(f"Erro ao excluir funcionário: {str(e)}")
            return Response({'error': f'Erro ao excluir usuário: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        
class PendenciaAPIView(APIView):
    def get(self, request):
        pendencias = Pendencia.objects.all()
        serializer = PendenciaSerializer(pendencias, many=True)
        return Response(serializer.data)

    def post(self, request):
        pendencias_data = request.data.get('pendencias', [])
        created_pendencias = []
        
        for pendencia_data in pendencias_data:
            empresa_id = pendencia_data.get('empresa', {}).get('id')
            tipo = pendencia_data.get('tipo')
            
            try:
                empresa = Empresa.objects.get(id=empresa_id)
                pendencia = Pendencia.objects.create(
                    empresa=empresa,
                    tipo=tipo
                )
                created_pendencias.append(PendenciaSerializer(pendencia).data)
            except Empresa.DoesNotExist:
                return Response(
                    {"error": f"Empresa com ID {empresa_id} não encontrada."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return Response(created_pendencias, status=status.HTTP_201_CREATED)

class NotificacaoViewSet(viewsets.ModelViewSet):
    serializer_class = NotificacaoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        Esta é a correção principal: Esta função garante que o usuário logado
        veja APENAS as suas próprias notificações.
        """
        return self.request.user.notificacoes.all()

    @action(detail=False, methods=['post'])
    def marcar_todas_como_lidas(self, request):
        """Ação customizada para excluir todas as notificações do usuário."""
        request.user.notificacoes.all().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

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
def sincronizar_pasta_empresa_api(request):
    empresa_id = request.data.get('empresa_id')
    tipo_pasta_sync = request.data.get('tipo_pasta')

    if not empresa_id or not tipo_pasta_sync:
        return Response({"error": "empresa_id e tipo_pasta são obrigatórios."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        empresa = Empresa.objects.get(id=empresa_id)
    except Empresa.DoesNotExist:
        return Response({"error": "Empresa não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    if tipo_pasta_sync not in MODEL_CONFIG_MAP_SYNC:
        return Response({"error": f"Tipo de pasta '{tipo_pasta_sync}' não suportado para sincronização."}, status=status.HTTP_400_BAD_REQUEST)

    config = MODEL_CONFIG_MAP_SYNC[tipo_pasta_sync]
    DocumentModel = config['model']
    DocumentSerializer = config['serializer']
    
    # USA A SUA FUNÇÃO DO UTILS.PY PARA O NOME DA PASTA DA EMPRESA
    company_folder_name_on_fs = gerar_nome_pasta_empresa_padronizado(empresa.nome)
    fs_doc_type_folder_name = config['fs_folder_name']
    base_doc_type_path_on_fs = os.path.join(settings.MEDIA_ROOT, company_folder_name_on_fs, fs_doc_type_folder_name)

    if not os.path.isdir(base_doc_type_path_on_fs):
        try: # Tenta criar a estrutura base se não existir (o sinal deveria ter feito, mas como garantia)
            os.makedirs(base_doc_type_path_on_fs, exist_ok=True)
            logger.info(f"SYNC: Criado diretório base do tipo de documento que faltava: {base_doc_type_path_on_fs}")
            if config['has_year_month']:
                ano_atual_str = str(datetime.date.today().year)
                caminho_pasta_ano = os.path.join(base_doc_type_path_on_fs, ano_atual_str)
                os.makedirs(caminho_pasta_ano, exist_ok=True)
                for numero_mes in range(1, 13):
                    mes_formatado_str = f"{numero_mes:02d}"
                    nome_pasta_mes_ano = f"{mes_formatado_str}{ano_atual_str}"
                    caminho_pasta_mes_ano = os.path.join(caminho_pasta_ano, nome_pasta_mes_ano)
                    os.makedirs(caminho_pasta_mes_ano, exist_ok=True)
        except Exception as e_mkdir:
            logger.error(f"SYNC: Erro crítico ao tentar criar estrutura de pasta para {base_doc_type_path_on_fs}: {e_mkdir}")
            return Response({"error": f"Não foi possível acessar ou criar a pasta de destino no servidor: {base_doc_type_path_on_fs}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # 1. Obter todos os arquivos do banco de dados
    db_files_map = {} 
    # Usa o nome da empresa para filtrar, pois os modelos de documento devem ter `nome_empresa`
    # Se alguns usam cnpj_empresa para filtro, o MODEL_CONFIG_MAP_SYNC precisaria ser ajustado.
    # Assumindo que todos os documentos podem ser filtrados por empresa.nome se 'nome_empresa' está neles.
    # Ou, se você adicionou um FK empresa aos modelos de doc: DocumentModel.objects.filter(empresa=empresa)
    db_queryset = DocumentModel.objects.filter(nome_empresa=empresa.nome) # Simplificado se todos tiverem nome_empresa
    # Se alguns usam cnpj_empresa, a lógica de filtro precisa ser mais dinâmica baseada no config:
    # company_filter_key_for_doc = config['company_field_name_in_doc_model']
    # company_value_for_doc_filter = getattr(empresa, config['company_attr_in_empresa_model']) # ex: empresa.nome ou empresa.cnpj
    # db_queryset = DocumentModel.objects.filter(**{company_filter_key_for_doc: company_value_for_doc_filter})

    for doc_instance in db_queryset:
        if doc_instance.caminho_arquivo and doc_instance.caminho_arquivo.name:
            db_path_normalized = doc_instance.caminho_arquivo.name.replace('\\', '/')
            db_files_map[db_path_normalized] = doc_instance

    # 2. Varrer o sistema de arquivos
    found_fs_files_normalized_paths = set()
    added_count = 0
    
    scan_paths = []
    if config['has_year_month']:
        if os.path.exists(base_doc_type_path_on_fs):
            for year_name in os.listdir(base_doc_type_path_on_fs):
                year_path = os.path.join(base_doc_type_path_on_fs, year_name)
                if os.path.isdir(year_path) and year_name.isdigit() and len(year_name) == 4:
                    for monthyear_name in os.listdir(year_path):
                        monthyear_path = os.path.join(year_path, monthyear_name)
                        if os.path.isdir(monthyear_path) and len(monthyear_name) == 6 and monthyear_name[:2].isdigit():
                            scan_paths.append({
                                "path": monthyear_path, 
                                "year": year_name, 
                                "month": monthyear_name[:2],
                                "sub_path_parts": [company_folder_name_on_fs, fs_doc_type_folder_name, year_name, monthyear_name]
                            })
    else: # Pastas sem estrutura de ano/mês
        if os.path.exists(base_doc_type_path_on_fs):
            scan_paths.append({
                "path": base_doc_type_path_on_fs, 
                "year": None, 
                "month": None,
                "sub_path_parts": [company_folder_name_on_fs, fs_doc_type_folder_name]
            })

    for item_to_scan in scan_paths:
        current_scan_path = item_to_scan["path"]
        for filename_raw_from_fs in os.listdir(current_scan_path):
            if os.path.isfile(os.path.join(current_scan_path, filename_raw_from_fs)):
                filename_sanitized_for_path = sanitize_filename_for_upload(filename_raw_from_fs) # USA A FUNÇÃO DE SANITIZAÇÃO CONSISTENTE
                
                # Constrói o caminho relativo da mesma forma que upload_to faria
                path_parts = item_to_scan["sub_path_parts"] + [filename_sanitized_for_path]
                temp_relative_path = os.path.join(*path_parts)
                normalized_fs_path = temp_relative_path.replace(os.sep, '/')
                found_fs_files_normalized_paths.add(normalized_fs_path)

                if normalized_fs_path not in db_files_map:
                    try:
                        doc_data = {
                            'nome_empresa': empresa.nome, # Todos os modelos de documento agora devem ter nome_empresa
                            'nome_arquivo': filename_raw_from_fs,
                            'tipo_documento': tipo_pasta_sync.replace("_", "-"), 
                            'caminho_arquivo': normalized_fs_path
                        }
                        if config['has_year_month']:
                            doc_data['ano'] = item_to_scan["year"]
                            doc_data['mes'] = item_to_scan["month"]
                        if 'entregue' in [f.name for f in DocumentModel._meta.get_fields()]: # Checa se o campo existe
                            doc_data['entregue'] = False 
                        if 'cnpj_empresa' in [f.name for f in DocumentModel._meta.get_fields()]:
                            doc_data['cnpj_empresa'] = empresa.cnpj
                        
                        DocumentModel.objects.create(**doc_data)
                        added_count += 1
                        logger.info(f"SYNC: Adicionado ao DB: {normalized_fs_path}")
                    except Exception as e_create:
                        logger.error(f"SYNC: Erro ao criar registro no DB para {normalized_fs_path}: {e_create} com dados {doc_data}")


    # 3. Remover do DB arquivos que não estão mais no FS
    removed_count = 0
    for db_path_normalized, db_instance in db_files_map.items():
        if db_path_normalized not in found_fs_files_normalized_paths:
            # Dupla checagem no sistema de arquivos antes de deletar do DB
            full_physical_path_check = os.path.join(settings.MEDIA_ROOT, db_path_normalized.replace('/', os.sep))
            if not os.path.exists(full_physical_path_check):
                try:
                    db_instance.delete()
                    removed_count += 1
                    logger.info(f"SYNC: Removido do DB (arquivo físico também não encontrado): {db_path_normalized}")
                except Exception as e_delete:
                    logger.error(f"SYNC: Erro ao remover registro do DB para {db_path_normalized}: {e_delete}")
            else:
                logger.warning(f"SYNC: Arquivo {db_path_normalized} está no DB e no FS, mas não foi listado pela varredura. Não removido.")

    # 4. Retornar a lista atualizada
    # Recarrega o queryset após as modificações
    db_queryset_updated = DocumentModel.objects.filter(nome_empresa=empresa.nome) # ou o filtro apropriado
    # ... (lógica de filtro de company_filter_key_for_doc como acima, se necessário) ...

    serializer = DocumentSerializer(db_queryset_updated, many=True)
    
    return Response({
        "message": f"Sincronização da pasta '{config['fs_folder_name']}' concluída. "
                   f"{added_count} arquivo(s) adicionado(s), {removed_count} registro(s) removido(s) do banco.",
        "data": serializer.data
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
def enviar_documentos_whatsapp_api(request):
    empresa_id = request.data.get('empresa_id')
    file_ids = request.data.get('file_ids')
    tipo_pasta = request.data.get('tipo_pasta')

    if not all([empresa_id, file_ids, tipo_pasta]):
        return JsonResponse(
            {"error": "Parâmetros faltando: empresa_id, file_ids e tipo_pasta são obrigatórios."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if tipo_pasta == 'xml':
        return JsonResponse({"error": "Envio de arquivos XML por WhatsApp não é suportado."}, status=status.HTTP_400_BAD_REQUEST)

    if tipo_pasta not in MODEL_CONFIG_MAP:
        return JsonResponse({"error": f"Tipo de pasta '{tipo_pasta}' não suportado para envio por WhatsApp."}, status=status.HTTP_400_BAD_REQUEST)

    config = MODEL_CONFIG_MAP[tipo_pasta]
    DocumentModel = config['model']
    whatsapp_template_to_use = config['whatsapp_template_name']  # Pega o nome do template do config

    try:
        empresa = Empresa.objects.get(id=empresa_id)
    except Empresa.DoesNotExist:
        return JsonResponse({"error": "Empresa não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    raw_phone_number = empresa.telefone
    if not raw_phone_number:
        logger.warning(f"Empresa {empresa.nome} (ID: {empresa_id}) não possui telefone cadastrado.")
        return JsonResponse({"error": "Telefone não cadastrado para esta empresa."}, status=status.HTTP_400_BAD_REQUEST)

    recipient_whatsapp_number = re.sub(r'\D', '', raw_phone_number)
    if not (len(recipient_whatsapp_number) >= 10 and len(recipient_whatsapp_number) <= 13 and recipient_whatsapp_number.isdigit()):
        return JsonResponse({"error": f"O número de telefone '{raw_phone_number}' cadastrado para a empresa não é válido para WhatsApp."}, status=status.HTTP_400_BAD_REQUEST)
    if not recipient_whatsapp_number.startswith('55') and len(recipient_whatsapp_number) in [10, 11]:
        recipient_whatsapp_number = '55' + recipient_whatsapp_number
    elif not recipient_whatsapp_number.startswith('55'):
        return JsonResponse({"error": f"O DDI (ex: 55 para Brasil) parece estar faltando no número de telefone '{raw_phone_number}'."}, status=status.HTTP_400_BAD_REQUEST)

    logger.info(f"Número de WhatsApp a ser utilizado para {empresa.nome}: {recipient_whatsapp_number}")

    filter_kwargs = {'id__in': file_ids}
    filter_kwargs[config['company_field_name']] = getattr(empresa, config['company_attr'])
    documentos_qs = DocumentModel.objects.filter(**filter_kwargs)

    if not documentos_qs.exists():
        return JsonResponse(
            {"error": f"Nenhum documento válido do tipo '{tipo_pasta}' encontrado para os IDs e empresa fornecidos."},
            status=status.HTTP_404_NOT_FOUND
        )

    files_sent_count = 0
    successful_sends = []
    failed_sends = []

    for doc in documentos_qs:
        if not doc.caminho_arquivo or not hasattr(doc.caminho_arquivo, 'path'):
            logger.warning(f"Documento ID {doc.id} ({doc.nome_arquivo}) não tem um caminho de arquivo válido.")
            failed_sends.append({"filename": doc.nome_arquivo, "reason": "Caminho do arquivo inválido."})
            continue
        
        # FIX: Reconstruir o caminho do arquivo manualmente para garantir que pegamos o arquivo REAL no disco (raw filename)
        # e não o caminho sanitizado que o Django salva no banco (caminho_arquivo.path)
        
        # 1. Tenta pegar a config de sync para saber a estrutura de pastas
        config_sync = MODEL_CONFIG_MAP_SYNC.get(tipo_pasta)
        
        file_path_on_server = None
        if config_sync:
            # Reconstroi o caminho da pasta
            company_folder = gerar_nome_pasta_empresa_padronizado(empresa.nome)
            fs_folder_name = config_sync['fs_folder_name']
            
            base_path = os.path.join(settings.MEDIA_ROOT, company_folder, fs_folder_name)
            
            # Adiciona Ano e Mês se necessário
            if config_sync['has_year_month']:
                doc_ano = str(doc.ano)
                doc_mes = str(doc.mes)
                # Verifica se mes já vem com 2 digitos ou não, garante formato MM
                if len(doc_mes) == 1:
                    doc_mes = f"0{doc_mes}"
                
                # Formato da pasta mensal: MMYYYY (ex: 012025)
                # IMPORTANTE: Verificar se doc.mes e doc.ano estão preenchidos.
                if doc_ano and doc_mes:
                    folder_month_year = f"{doc_mes}{doc_ano}"
                    base_path = os.path.join(base_path, doc_ano, folder_month_year)
            
            # Junta com o nome do arquivo ORIGINAL (doc.nome_arquivo)
            # doc.nome_arquivo é o nome EXATO que está no disco (raw), enquanto doc.caminho_arquivo é sanitizado pelo Django
            possible_path = os.path.join(base_path, doc.nome_arquivo)
            
            if os.path.exists(possible_path):
                file_path_on_server = possible_path
                logger.info(f"Arquivo encontrado compondo caminho manual: {file_path_on_server}")
            else:
                 # Fallback: Se não achar com o nome original (o que seria estranho dado o problema), tenta o path do django
                logger.warning(f"Arquivo não encontrado no caminho manual: {possible_path}. Tentando fallback para doc.caminho_arquivo.path")
                if doc.caminho_arquivo and hasattr(doc.caminho_arquivo, 'path') and os.path.exists(doc.caminho_arquivo.path):
                     file_path_on_server = doc.caminho_arquivo.path
        
        if not file_path_on_server:
             # Última tentativa direto do objeto, caso a lógica acima falhe ou config não exista
             if doc.caminho_arquivo and hasattr(doc.caminho_arquivo, 'path'):
                file_path_on_server = doc.caminho_arquivo.path

        if not file_path_on_server or not os.path.exists(file_path_on_server):
            logger.error(f"Arquivo FÍSICO não encontrado para ID {doc.id}: {doc.nome_arquivo}")
            failed_sends.append({"filename": doc.nome_arquivo, "reason": "Arquivo físico não encontrado no servidor."})
            continue
        original_filename = doc.nome_arquivo
        logger.info(f"Processando envio para WhatsApp: {original_filename} para {recipient_whatsapp_number} (Empresa: {empresa.nome}) usando template: {whatsapp_template_to_use}")

        media_id, _ = upload_media_to_whatsapp(file_path_on_server, original_filename)

        if not media_id:
            logger.error(f"Falha ao fazer upload da mídia para {original_filename}.")
            failed_sends.append({"filename": original_filename, "reason": "Falha no upload da mídia."})
            continue

        # Construir template_params dinamicamente com base no template
        template_params = {}
        if whatsapp_template_to_use == "enviar_documento_com_contato":
            # Forçar os valores diretamente no payload via mapeamento, sem depender de template_params
            pass
        elif whatsapp_template_to_use in ["enviar_sn", "enviar_dp"]:
            data_mes_atual = timezone.now().replace(day=1)
            data_mes_anterior = data_mes_atual - relativedelta(months=1)
            mes_passado = data_mes_anterior.strftime('%B/%Y')  # Ex.: "Agosto/2025"
            template_params = {"period_month": mes_passado}

        # Chama a função com os parâmetros ajustados
        message_id, error_sending = send_whatsapp_document_template_message(
            recipient_number=recipient_whatsapp_number,
            document_media_id=media_id,
            document_filename=original_filename,
            template_name=whatsapp_template_to_use,
            template_params=template_params,
            company_name=empresa.nome,
        )

        if message_id:
            status_envio = 'sucesso'
            successful_sends.append({"filename": original_filename, "message_id": message_id})
            files_sent_count += 1
            if tipo_pasta == 'simples_nacional':
                try:
                    ano_do_arquivo = doc.ano or timezone.now().year
                    mes_do_arquivo = doc.mes or timezone.now().month
                    periodo_date = timezone.datetime(int(ano_do_arquivo), int(mes_do_arquivo), 1).date()

                    ObrigacaoMensal.objects.filter(
                        empresa=empresa,
                        tipo='simples_nacional',
                        periodo_apuracao=periodo_date
                    ).update(status='enviado', data_envio=timezone.now(), responsavel_envio=request.user)
                    
                    logger.info(f"Status da Obrigação 'Simples Nacional' para {empresa.nome} ({periodo_date.strftime('%m/%Y')}) atualizado para 'Enviado'.")

                except Exception as e:
                    logger.error(f"Falha ao atualizar status da obrigação para {empresa.nome}: {e}")
        else:
            status_envio = 'falha'
            failed_sends.append({"filename": original_filename, "reason": f"Falha ao enviar template: {error_sending}"})

        # Criar o registro no HistoricoEnvios com a empresa associada
        HistoricoEnvios.objects.create(
            remetente=recipient_whatsapp_number,
            arquivo=original_filename,
            status=status_envio,
            message_id=message_id,  # Será None se houver falha
            empresa=empresa  # Adicionar o campo empresa
        )

    final_status = status.HTTP_200_OK
    if files_sent_count == 0 and documentos_qs.exists(): 
        if failed_sends:  # Se houve tentativas mas todas falharam
            final_status = status.HTTP_400_BAD_REQUEST
        elif not failed_sends:  # Se nenhum foi enviado e não há falhas (caso estranho)
            final_status = status.HTTP_400_BAD_REQUEST

    return JsonResponse({
        "message": f"{files_sent_count} de {documentos_qs.count()} documento(s) processado(s).",
        "successful_sends": successful_sends,
        "failed_sends": failed_sends
    }, status=final_status)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def gerar_das_api(request):
    """View para a página 'Gerar DAS'."""
    cnpj = request.data.get('cnpj')
    periodo = request.data.get('periodo')

    if not cnpj or not periodo:
        return Response({"error": "CNPJ e Período (YYYYMM) são obrigatórios."}, status=status.HTTP_400_BAD_REQUEST)
    
    # A lógica foi movida para o service.py
    resultado = gerar_das_serpro(cnpj_empresa=cnpj, periodo_apuracao=periodo)
    
    if resultado.get("sucesso"):
        pdf_content = resultado.get("pdf_content")
        filename = resultado.get("filename", "DAS.pdf")
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    else:
        return Response(
            {"error": resultado.get("erro"), "detalhes": resultado.get("detalhes")},
            status=status.HTTP_400_BAD_REQUEST
        )
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def consultar_extrato_api(request):
    cnpj = request.data.get('cnpj')
    periodo = request.data.get('periodo') # Esperado no formato "YYYYMM"

    if not cnpj or not periodo:
        return Response({"error": "CNPJ e Período (YYYYMM) são obrigatórios."}, status=status.HTTP_400_BAD_REQUEST)

    resultado = obter_dados_extrato_serpro(cnpj_empresa=cnpj, periodo_apuracao=periodo)

    if resultado.get("sucesso"):
        # Retorna os dados do extrato em JSON para o frontend renderizar
        return Response(resultado.get("extrato_data"), status=status.HTTP_200_OK)
    else:
        # Retorna a mensagem de erro em JSON
        return Response(
            {"error": resultado.get("erro"), "detalhes": resultado.get("detalhes")},
            status=status.HTTP_400_BAD_REQUEST
        )
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def download_extrato_pdf_api(request):
    cnpj = request.data.get('cnpj')
    numero_das = request.data.get('numero_das')

    if not cnpj or not numero_das:
        return Response({"error": "CNPJ e numero_das são obrigatórios."}, status=status.HTTP_400_BAD_REQUEST)

    # A view agora só precisa chamar a função de serviço, sem se preocupar com tokens.
    resultado = obter_extrato_pdf_serpro(cnpj_empresa=cnpj, numero_das=numero_das)

    if resultado.get("sucesso"):
        pdf_content = resultado.get("pdf_content")
        filename = resultado.get("filename", "Extrato.pdf")
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    else:
        return Response(
            {"error": resultado.get("erro"), "detalhes": resultado.get("detalhes")},
            status=status.HTTP_400_BAD_REQUEST
        )
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def consultar_extrato_api(request):
    cnpj = request.data.get('cnpj')
    periodo = request.data.get('periodo') # Esperado no formato "YYYYMM"

    if not cnpj or not periodo:
        return Response({"error": "CNPJ e Período (YYYYMM) são obrigatórios."}, status=status.HTTP_400_BAD_REQUEST)

    resultado = orquestrar_consulta_extrato(cnpj_empresa=cnpj, periodo_apuracao=periodo)

    if resultado.get("sucesso"):
        # Se funcionou, retorna o PDF para download
        pdf_content = resultado.get("pdf_content")
        filename = resultado.get("filename", "Extrato.pdf")
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    else:
        # Se falhou, retorna a mensagem de erro em JSON
        return Response(
            {"error": resultado.get("erro"), "detalhes": resultado.get("detalhes")},
            status=status.HTTP_400_BAD_REQUEST
        )
    
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_summary_api(request):
    """
    Agrega e retorna os dados para o dashboard. Versão final com lógica simplificada e segura.
    """
    try:
        hoje = timezone.now().date()
        
        # --- KPIs ---
        # Contamos apenas empresas onde o campo 'nome' não está vazio, como um proxy para ativas
        total_clientes = Empresa.objects.exclude(nome__exact='').count()
        
        # Filtramos tarefas pendentes com data de vencimento futura
        tarefas_pendentes_total = ObrigacaoMensal.objects.filter(
            status='pendente',
            data_vencimento__gte=hoje
        ).count()

        vencendo_em_7_dias = ObrigacaoMensal.objects.filter(
            status='pendente',
            data_vencimento__gte=hoje,
            data_vencimento__lte=hoje + timedelta(days=7)
        ).count()

        # --- Próximas Tarefas ---
        proximas_tarefas_qs = ObrigacaoMensal.objects.filter(
            status='pendente',
            data_vencimento__gte=hoje
        ).select_related('empresa').order_by('data_vencimento')[:5]
        
        proximas_tarefas = [{
            'id': tarefa.id,
            'titulo': tarefa.titulo,
            'empresa_nome': tarefa.empresa.nome if tarefa.empresa else 'Empresa não encontrada',
            'data_vencimento': tarefa.data_vencimento.strftime('%d/%m/%Y'),
        } for tarefa in proximas_tarefas_qs]

        # --- Dados do Gráfico (simplificado) ---
        chart_data = {
            'periodo': (hoje.replace(day=1) - timedelta(days=1)).strftime('%m/%Y'),
            'labels': ['Exemplo Concluído', 'Exemplo Pendente'],
            'data': [8, 2] # Dados de exemplo para garantir que o gráfico sempre renderize
        }

        # --- Montagem Final da Resposta ---
        data = {
            'kpis': {
                'total_clientes': total_clientes,
                'tarefas_pendentes': tarefas_pendentes_total,
                'vencendo_em_7_dias': vencendo_em_7_dias,
            },
            'proximas_tarefas': proximas_tarefas,
            'chart_data': chart_data
        }
        return Response(data)

    except Exception as e:
        logger.error(f"Erro CRÍTICO ao gerar dados do dashboard: {e}")
        return Response({"error": "Falha grave no servidor ao processar dados do dashboard."}, status=500)
    
@api_view(['GET'])
@permission_classes([IsAdminUser])
def gerenciamento_simples_api(request):
    hoje = timezone.now().date()
    periodo_alvo = hoje.replace(day=1)

    # Subquery para buscar o status da obrigação do mês corrente para cada empresa
    obrigacao_status = ObrigacaoMensal.objects.filter(
        empresa=OuterRef('pk'),
        tipo='simples_nacional',
        periodo_apuracao=periodo_alvo
    ).values('status')[:1]

    # Anota o status na queryset de empresas
    empresas = Empresa.objects.annotate(
        status_simples_mes_atual=Subquery(obrigacao_status, output_field=CharField())
    ).values('id', 'nome', 'cnpj', 'monitorar_simples', 'status_simples_mes_atual')

    return Response(list(empresas))

@api_view(['POST'])
@permission_classes([IsAdminUser])
def toggle_monitoramento_simples(request, empresa_id):
    try:
        empresa = Empresa.objects.get(id=empresa_id)
        empresa.monitorar_simples = not empresa.monitorar_simples
        empresa.save()
        return Response({'message': 'Status de monitoramento atualizado com sucesso.', 'novo_status': empresa.monitorar_simples})
    except Empresa.DoesNotExist:
        return Response({'error': 'Empresa não encontrada.'}, status=404)
    
@api_view(['GET'])
@permission_classes([IsAdminUser])
def gerenciamento_atribuicao_data(request):
    try:
        funcionarios = Funcionario.objects.all().order_by('first_name')
        empresas = Empresa.objects.all().order_by('nome')
        data = {
            'funcionarios': FuncionarioSerializer(funcionarios, many=True).data,
            'empresas': EmpresaSerializer(empresas, many=True).data
        }
        return Response(data)
    except Exception as e:
        logger.error(f"Erro ao obter dados de atribuição: {str(e)}")
        return Response({'error': f'Erro ao obter dados: {str(e)}'}, status=500)

@api_view(['POST'])
@permission_classes([IsAdminUser])
def salvar_atribuicoes(request):
    try:
        funcionario_id = request.data.get('funcionario_id')
        ids_empresas = request.data.get('ids_empresas', [])
        funcionario = Funcionario.objects.get(id=funcionario_id)
        funcionario.empresas_gerenciadas.set(ids_empresas)
        return Response({'message': 'Atribuições salvas com sucesso'}, status=200)
    except Funcionario.DoesNotExist:
        logger.error(f"Funcionário {funcionario_id} não encontrado")
        return Response({'error': 'Funcionário não encontrado'}, status=404)
    except Exception as e:
        logger.error(f"Erro ao salvar atribuições: {str(e)}")
        return Response({'error': f'Erro ao salvar atribuições: {str(e)}'}, status=400)
    
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user(request):
    try:
        serializer = FuncionarioSerializer(request.user)
        logger.info(f"Dados do usuário atual: {serializer.data}")
        return Response(serializer.data)
    except Exception as e:
        logger.error(f"Error in current_user: {str(e)}")
        return Response({'error': f'Erro ao obter dados do usuário: {str(e)}'}, status=500)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def ultimo_resultado_sessao(request):
    try:
        registro, _ = UltimoResultadoSessao.objects.get_or_create(usuario=request.user)

        if request.method == 'POST':
            batch_summary = request.data.get('batch_summary')

            if batch_summary is not None and not isinstance(batch_summary, dict):
                return Response({'error': 'O campo batch_summary deve ser um objeto JSON válido.'}, status=status.HTTP_400_BAD_REQUEST)

            registro.batch_summary = batch_summary
            registro.save(update_fields=['batch_summary', 'atualizado_em'])

        serializer = UltimoResultadoSessaoSerializer(registro)
        return Response(serializer.data)
    except Exception as e:
        logger.error(f"Erro ao processar último resultado de sessão para {request.user.username}: {str(e)}")
        return Response({'error': 'Erro ao processar o último resultado da sessão.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def gerar_e_enviar_das_view(request):
    """
    View to handle DAS generation and sending via WhatsApp.
    Requires authentication.
    """
    if request.method != 'POST':
        logger.error("Método não permitido. Apenas POST é aceito.")
        return JsonResponse({"sucesso": False, "erro": "Método não permitido."}, status=405)

    try:
        # Parse JSON data from request.body
        data = json.loads(request.body)
        cnpj_empresa = data.get('cnpj')
        periodo_apuracao = data.get('periodo_apuracao')
    except json.JSONDecodeError:
        logger.error("Corpo da requisição não é um JSON válido.")
        return JsonResponse({"sucesso": False, "erro": "Corpo da requisição não é um JSON válido."}, status=400)
    except Exception as e:
        logger.error(f"Erro ao processar dados da requisição: {e}")
        return JsonResponse({"sucesso": False, "erro": "Erro ao processar dados da requisição."}, status=400)

    if not cnpj_empresa:
        logger.error("CNPJ não fornecido na requisição.")
        return JsonResponse({"sucesso": False, "erro": "CNPJ é obrigatório."}, status=400)

    # Passar o request para associar o usuário autenticado ao histórico
    result = gerar_e_enviar_das(cnpj_empresa, periodo_apuracao, request=request)
    if result["sucesso"]:
        return JsonResponse(result, status=200)
    return JsonResponse(result, status=400)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_pie_chart(request):
    user = request.user
    logger.info(f"Usuário {user.username} solicitou dados do gráfico de pizza. Cargo: {user.cargo}")

    try:
        empresas = Empresa.objects.filter(usercompanyaccess__user=user)
        logger.info(f"Empresas encontradas para usuário {user.username}: {empresas.count()}")

        if user.cargo == 'pessoal':
            pendentes = sum(
                1 for empresa in empresas
                for field in ['inss', 'fgts', 'folha', 'honorario']
                if not getattr(empresa, field, False)
            )
            concluidas = sum(
                1 for empresa in empresas
                for field in ['inss', 'fgts', 'folha', 'honorario']
                if getattr(empresa, field, False)
            )
            labels = ['Pendentes', 'Concluídas']
            values = [pendentes, concluidas]
        elif user.cargo == 'fiscal':
            pendentes = sum(
                1 for empresa in empresas
                if not empresa.simples_nacional and empresa.monitorar_simples
            )
            concluidas = sum(
                1 for empresa in empresas
                if empresa.simples_nacional and empresa.monitorar_simples
            )
            labels = ['Pendentes', 'Concluídas']
            values = [pendentes, concluidas]
        else:  # admin
            pendentes_pessoal = sum(
                1 for empresa in empresas
                for field in ['inss', 'fgts', 'folha', 'honorario']
                if not getattr(empresa, field, False)
            )
            concluidas_pessoal = sum(
                1 for empresa in empresas
                for field in ['inss', 'fgts', 'folha', 'honorario']
                if getattr(empresa, field, False)
            )
            pendentes_fiscal = sum(
                1 for empresa in empresas
                if not empresa.simples_nacional and empresa.monitorar_simples
            )
            concluidas_fiscal = sum(
                1 for empresa in empresas
                if empresa.simples_nacional and empresa.monitorar_simples
            )
            labels = ['Pendentes Pessoal', 'Pendentes Fiscal', 'Concluídas Pessoal', 'Concluídas Fiscal']
            values = [pendentes_pessoal, pendentes_fiscal, concluidas_pessoal, concluidas_fiscal]

        logger.info(f"Dados do gráfico para {user.username}: labels={labels}, values={values}")
        return Response({'labels': labels, 'values': values}, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Erro ao processar dados do gráfico para {user.username}: {str(e)}")
        return Response(
            {'error': 'Erro ao processar dados do gráfico de pizza.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    user = request.user
    try:
        empresas = Empresa.objects.filter(usercompanyaccess__user=user)
        total_empresas = empresas.count()
        hoje = timezone.now().date()
        dia = hoje.day
        mes = hoje.month
        ano = hoje.year

        if user.cargo == 'fiscal':
            vencimento_dia = 25
        else:
            vencimento_dia = 15

        data_vencimento = datetime(ano, mes, vencimento_dia).date()
        if dia > vencimento_dia:
            if mes == 12:
                mes = 1
                ano += 1
            else:
                mes += 1
            data_vencimento = datetime(ano, mes, vencimento_dia).date()

        dias_ate_vencimento = (data_vencimento - hoje).days

        pendentes = 0
        if user.cargo == 'pessoal' or user.cargo == 'admin':
            for empresa in empresas:
                if not empresa.inss:
                    pendentes += 1
                if not empresa.fgts:
                    pendentes += 1
                if not empresa.folha:
                    pendentes += 1
                if not empresa.honorario:
                    pendentes += 1
        if user.cargo == 'fiscal' or user.cargo == 'admin':
            for empresa in empresas:
                if not empresa.simples_nacional and empresa.monitorar_simples:
                    pendentes += 1

        return Response({
            'total_empresas': total_empresas,
            'tarefas_pendentes': pendentes,
            'dias_ate_vencimento': dias_ate_vencimento
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Erro ao processar resumo do dashboard para {user.username}: {str(e)}")
        return Response(
            {'error': 'Erro ao processar resumo do dashboard.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
def convert_date_format(date_str):
    """Converte um formato de data YYYY-MM-DD para dd.mm.aaaa, se aplicável."""
    if not date_str:
        return "" # Retorna string vazia para campos opcionais como data de multa/desconto
    try:
        if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            parsed_date = parse_date(date_str)
            if parsed_date:
                return parsed_date.strftime('%d.%m.%Y')
        elif re.match(r'^\d{2}\.\d{2}\.\d{4}$', date_str):
            return date_str
        elif 'T' in date_str:
             parsed_date = parse_date(date_str.split('T')[0])
             if parsed_date:
                return parsed_date.strftime('%d.%m.%Y')
        elif date_str == "":
            return ""
        return date_str
    except Exception as e:
        logger.error(f"Erro ao converter data {date_str}: {str(e)}")
        return ""


def enviar_boleto_honorario_whatsapp(empresa, pdf_content, nome_arquivo, usuario=None):
    recipient_number = re.sub(r"\D", "", str(empresa.telefone or ""))

    if not recipient_number:
        erro = "Empresa sem telefone configurado para envio de boleto pelo WhatsApp."
        logger.warning(f"{erro} Empresa: {empresa.nome}")
        HistoricoEnvios.objects.create(
            remetente="",
            arquivo=nome_arquivo,
            status='falha',
            usuario=usuario,
            erro=erro,
            empresa=empresa,
        )
        return None, erro

    temp_file_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            temp_file.write(pdf_content)
            temp_file_path = temp_file.name

        media_id, _ = upload_media_to_whatsapp(temp_file_path, nome_arquivo)
        if not media_id:
            erro = "Falha ao fazer upload do boleto para o WhatsApp."
            HistoricoEnvios.objects.create(
                remetente=recipient_number,
                arquivo=nome_arquivo,
                status='falha',
                usuario=usuario,
                erro=erro,
                empresa=empresa,
            )
            return None, erro

        message_id, error_sending = send_whatsapp_document_template_message(
            recipient_number=recipient_number,
            document_media_id=media_id,
            document_filename=nome_arquivo,
            template_name='honorario',
            template_params={},
            company_name=empresa.nome,
        )

        if message_id:
            HistoricoEnvios.objects.create(
                remetente=recipient_number,
                arquivo=nome_arquivo,
                status='sucesso',
                message_id=message_id,
                usuario=usuario,
                empresa=empresa,
            )
            return message_id, None

        HistoricoEnvios.objects.create(
            remetente=recipient_number,
            arquivo=nome_arquivo,
            status='falha',
            usuario=usuario,
            erro=error_sending,
            empresa=empresa,
        )
        return None, error_sending
    except Exception as e:
        logger.error(f"Erro ao enviar boleto via WhatsApp para {empresa.nome}: {e}")
        HistoricoEnvios.objects.create(
            remetente=recipient_number,
            arquivo=nome_arquivo,
            status='falha',
            usuario=usuario,
            erro=str(e),
            empresa=empresa,
        )
        return None, str(e)
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)


def salvar_boleto_honorario_departamento_pessoal(empresa, pdf_content):
    agora = timezone.now()
    ano_referencia = str(agora.year)
    mes_referencia = str(agora.month).zfill(2)
    nome_arquivo_pasta = 'HONORARIO.pdf'

    documentos_existentes = DepartamentoPessoal.objects.filter(
        cnpj_empresa=empresa.cnpj,
        tipo_documento='HONORARIO',
        mes=mes_referencia,
        ano=ano_referencia,
    ).order_by('id')

    documento = documentos_existentes.first()
    for documento_extra in documentos_existentes[1:]:
        if documento_extra.caminho_arquivo:
            documento_extra.caminho_arquivo.delete(save=False)
        documento_extra.delete()

    if documento is None:
        documento = DepartamentoPessoal(
            nome_empresa=empresa.nome,
            cnpj_empresa=empresa.cnpj,
            tipo_documento='HONORARIO',
            mes=mes_referencia,
            ano=ano_referencia,
            entregue=False,
        )
    else:
        documento.nome_empresa = empresa.nome
        documento.cnpj_empresa = empresa.cnpj
        documento.tipo_documento = 'HONORARIO'
        documento.mes = mes_referencia
        documento.ano = ano_referencia
        documento.entregue = False
        if documento.caminho_arquivo:
            documento.caminho_arquivo.delete(save=False)

    documento.nome_arquivo = nome_arquivo_pasta
    documento.caminho_arquivo.save(nome_arquivo_pasta, ContentFile(pdf_content), save=False)
    documento.save()
    return documento


@api_view(['POST'])
def gerar_boleto_view(request):
    empresa_id = request.data.get('empresa_id')
    incoming_data = request.data.get('boleto_data', {})
    action = request.data.get('action', "gerar_enviar")  # gerar_enviar (padrão) ou baixar

    if not empresa_id:
        return Response({"error": "empresa_id é obrigatório."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        empresa = Empresa.objects.get(id=empresa_id)
    except Empresa.DoesNotExist:
        return Response({"error": "Empresa não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    # Controle para manter apenas 1 boleto por mês por empresa
    agora = timezone.now()
    mes_atual = str(agora.month).zfill(2)
    ano_atual = str(agora.year)
    boleto_existente = DepartamentoPessoal.objects.filter(
        cnpj_empresa=empresa.cnpj,
        tipo_documento='HONORARIO',
        mes=mes_atual,
        ano=ano_atual,
    ).order_by('id').first()

    # Ação: somente download. Se existe, devolve link; se não, retorna erro sem gerar novo arquivo
    if action == "baixar":
        if boleto_existente and boleto_existente.caminho_arquivo:
            return Response({
                "success": True,
                "message": "Boleto encontrado. Disponível para download.",
                "from_cache": True,
                "download_url": request.build_absolute_uri(boleto_existente.caminho_arquivo.url),
                "arquivo_pasta": boleto_existente.nome_arquivo,
            }, status=status.HTTP_200_OK)

        return Response({
            "success": False,
            "error": "Nenhum boleto encontrado para download.",
        }, status=status.HTTP_404_NOT_FOUND)

    # --- INÍCIO DA CORREÇÃO FINAL ---

    # !! IMPORTANTE !!
    # CONFIRME ESTES 2 VALORES NO SEU PORTAL DE DESENVOLVEDOR DO BANCO DO BRASIL.
    SEU_NUMERO_CONVENIO = 3645123  # Seu convênio de 7 dígitos
    SUA_CARTEIRA = 17              # Geralmente 17 ou 18. CONFIRME.

    # --- Lógica de Data de Vencimento e Valores Padrão ---
    hoje = timezone.now().date()
    dia_vencimento = empresa.dia_vencimento_honorario
    
    # Determinar a data de vencimento
    try:
        data_vencimento_dt = hoje.replace(day=dia_vencimento)
    except ValueError:
        import calendar
        last_day = calendar.monthrange(hoje.year, hoje.month)[1]
        data_vencimento_dt = hoje.replace(day=last_day)

    if hoje.day > dia_vencimento:
        proximo_mes = (hoje.replace(day=1) + timedelta(days=32)).replace(day=1)
        try:
            data_vencimento_dt = proximo_mes.replace(day=dia_vencimento)
        except ValueError:
             import calendar
             last_day = calendar.monthrange(proximo_mes.year, proximo_mes.month)[1]
             data_vencimento_dt = proximo_mes.replace(day=last_day)
    
    data_vencimento_str = data_vencimento_dt.strftime('%d.%m.%Y')

    data_desconto_str = ""
    if empresa.dias_para_desconto > 0:
        data_desc_dt = data_vencimento_dt - timedelta(days=empresa.dias_para_desconto)
        data_desconto_str = data_desc_dt.strftime('%d.%m.%Y')

    default_payload = {
        "numeroConvenio": SEU_NUMERO_CONVENIO,
        "carteira": SUA_CARTEIRA,
        # "variacaoCarteira" removida, conforme sua instrução para sandbox.
        "codigoModalidade": 1,
        "dataEmissao": timezone.now().strftime('%d.%m.%Y'),
        "dataVencimento": data_vencimento_str,
        "valorOriginal": float(empresa.valor_honorario) if empresa.valor_honorario > 0 else 1.00,
        "valorAbatimento": 0.0,
        "quantidadeDiasProtesto": 0,
        "quantidadeDiasNegativacao": 0,
        "orgaoNegativador": 0,
        # Permite recebimento após o vencimento; limite alto evita baixa automática.
        "indicadorAceiteTituloVencido": "S",
        "numeroDiasLimiteRecebimento": 30,
        "codigoAceite": "N",
        "codigoTipoTitulo": 2,
        "descricaoTipoTitulo": "DM",
        "indicadorPermissaoRecebimentoParcial": "N",
        # Gera um número de controle único para cada teste
        "numeroTituloBeneficiario": f"{int(timezone.now().timestamp())}",
        "campoUtilizacaoBeneficiario": "EMISSAO WEB",
        # Gera um "Nosso Número" de 20 dígitos, único para cada teste
        "numeroTituloCliente": f"000{SEU_NUMERO_CONVENIO}{int(timezone.now().timestamp()) % 10**10:010d}",
        "mensagemBloquetoOcorrencia": "Boleto de Cobrança",
        "indicadorPix": "S",
    }

    # Construa o payload final
    final_payload = {
        "numeroConvenio": int(incoming_data.get("numeroConvenio") or default_payload["numeroConvenio"]),
        "carteira": int(incoming_data.get("carteira") or default_payload["carteira"]),
        "codigoModalidade": int(incoming_data.get("codigoModalidade") or default_payload["codigoModalidade"]),
        "dataEmissao": convert_date_format(incoming_data.get("dataEmissao")) or default_payload["dataEmissao"],
        "dataVencimento": convert_date_format(incoming_data.get("dataVencimento")) or default_payload["dataVencimento"],
        "valorOriginal": float(incoming_data.get("valorOriginal") or default_payload["valorOriginal"]),
        "valorAbatimento": float(incoming_data.get("valorAbatimento") or default_payload["valorAbatimento"]),
        "quantidadeDiasProtesto": int(incoming_data.get("quantidadeDiasProtesto") or default_payload["quantidadeDiasProtesto"]),
        "quantidadeDiasNegativacao": int(incoming_data.get("quantidadeDiasNegativacao") or default_payload["quantidadeDiasNegativacao"]),
        "orgaoNegativador": int(incoming_data.get("orgaoNegativador") or default_payload["orgaoNegativador"]),
        "indicadorAceiteTituloVencido": incoming_data.get("indicadorAceiteTituloVencido") or default_payload["indicadorAceiteTituloVencido"],
        "numeroDiasLimiteRecebimento": int(incoming_data.get("numeroDiasLimiteRecebimento") or default_payload["numeroDiasLimiteRecebimento"]),
        "codigoAceite": incoming_data.get("codigoAceite") or default_payload["codigoAceite"],
        "codigoTipoTitulo": int(incoming_data.get("codigoTipoTitulo") or default_payload["codigoTipoTitulo"]),
        "descricaoTipoTitulo": incoming_data.get("descricaoTipoTitulo") or default_payload["descricaoTipoTitulo"],
        "indicadorPermissaoRecebimentoParcial": incoming_data.get("indicadorPermissaoRecebimentoParcial") or default_payload["indicadorPermissaoRecebimentoParcial"],
        "numeroTituloBeneficiario": incoming_data.get("numeroTituloBeneficiario") or default_payload["numeroTituloBeneficiario"],
        "campoUtilizacaoBeneficiario": incoming_data.get("campoUtilizacaoBeneficiario") or default_payload["campoUtilizacaoBeneficiario"],
        "numeroTituloCliente": incoming_data.get("numeroTituloCliente") or default_payload["numeroTituloCliente"],
        "mensagemBloquetoOcorrencia": incoming_data.get("mensagemBloquetoOcorrencia") or default_payload["mensagemBloquetoOcorrencia"],
        "indicadorPix": incoming_data.get("indicadorPix") or default_payload["indicadorPix"],
        "quantidade": incoming_data.get("quantidade") or "", # Novo campo
    }
    
    # Validações...
    if final_payload["valorOriginal"] <= final_payload["valorAbatimento"]:
        final_payload["valorAbatimento"] = 0.0

    if not final_payload["dataEmissao"] or not re.match(r'^\d{2}\.\d{2}\.\d{4}$', final_payload["dataEmissao"]):
        return Response({"error": f"Formato de dataEmissao inválido: {final_payload['dataEmissao']}. Use dd.mm.aaaa."}, status=status.HTTP_400_BAD_REQUEST)
    if not final_payload["dataVencimento"] or not re.match(r'^\d{2}\.\d{2}\.\d{4}$', final_payload["dataVencimento"]):
        return Response({"error": f"Formato de dataVencimento inválido: {final_payload['dataVencimento']}. Use dd.mm.aaaa."}, status=status.HTTP_400_BAD_REQUEST)

    # Construção do campo pagador
    incoming_pagador = incoming_data.get('pagador', {})
    final_payload["pagador"] = { "tipoInscricao": incoming_pagador.get("tipoInscricao") or 2, "numeroInscricao": incoming_pagador.get("numeroInscricao") or (int(re.sub(r"\D", "", str(empresa.cnpj))) if empresa.cnpj else 0), "nome": incoming_pagador.get("nome") or empresa.nome, "endereco": incoming_pagador.get("endereco") or empresa.endereco or "Endereço Padrão", "cep": incoming_pagador.get("cep") or (int(re.sub(r"\D", "", str(empresa.cep))) if empresa.cep else 0), "cidade": incoming_pagador.get("cidade") or empresa.cidade or "Cidade", "bairro": incoming_pagador.get("bairro") or empresa.bairro or "Bairro", "uf": incoming_pagador.get("uf") or empresa.uf or "SP", "telefone": incoming_pagador.get("telefone") or (re.sub(r"\D", "", str(empresa.telefone)) if empresa.telefone else "00000000000"), "email": incoming_pagador.get("email") or empresa.email or "email@exemplo.com", }

    # Calculando datas padrão para Multa e Juros (geralmente vencimento + 1 dia)
    data_limite_pagamento_dt = data_vencimento_dt + timedelta(days=1)
    data_encargos_str = data_limite_pagamento_dt.strftime('%d.%m.%Y')

    # Construção dos campos aninhados com lógica de validação e defaults da empresa
    def build_charge_field(data, field_name, default_percent=0.0, default_date=""):
        incoming_field = data.get(field_name, {})
        
        # Se o form não enviou nada, mas temos um default configurado na empresa > 0
        if not incoming_field and default_percent > 0:
            return {
                "tipo": 2, # 2 = Percentual
                "porcentagem": float(default_percent),
                "valor": 0.0, # Para tipo 2, valor deve ser zerado
                "data": default_date # Usado para desconto ou multa
            }

        tipo = int(incoming_field.get("tipo") or 0)
        
        field_data = {
            "tipo": tipo,
            "porcentagem": float(incoming_field.get("porcentagem") or 0.0) if tipo == 2 else 0.0,
            "valor": float(incoming_field.get("valor") or 0.0) if tipo == 1 else 0.0,
        }
        
        # Adiciona datas apenas se elas existirem e forem válidas
        data_val = convert_date_format(incoming_field.get("data", ""))
        if data_val: 
            field_data["data"] = data_val
        elif default_date and default_percent > 0 and tipo == 0: 
             # Se não veio nada no input (tipo 0), mas estamos aplicando default
             field_data["tipo"] = 2
             field_data["porcentagem"] = float(default_percent)
             field_data["data"] = default_date
             
        data_exp_val = convert_date_format(incoming_field.get("dataExpiracao", ""))
        if data_exp_val: field_data["dataExpiracao"] = data_exp_val

        return field_data

    final_payload["desconto"] = build_charge_field(incoming_data, "desconto", empresa.desconto_taxa, data_desconto_str)
    final_payload["segundoDesconto"] = build_charge_field(incoming_data, "segundoDesconto")
    final_payload["terceiroDesconto"] = build_charge_field(incoming_data, "terceiroDesconto")
    
    # --- ALTERAÇÃO: Juros e Multa desativados temporariamente conforme pedido ---
    # Para reativar, basta voltar a usar build_charge_field com os parâmetros da empresa
    final_payload["multa"] = { "tipo": 0, "porcentagem": 0.0, "valor": 0.0, "data": "" }
    final_payload["jurosMora"] = { "tipo": 0, "porcentagem": 0.0, "valor": 0.0, "data": "" }
    
    final_payload["beneficiarioFinal"] = incoming_data.get("beneficiarioFinal", {"tipoInscricao": 0, "numeroInscricao": 0, "nome": ""})
    
    # --- FIM DA CORREÇÃO ---

    access_token = get_bb_access_token()
    if not access_token:
        return Response({"error": "Falha ao obter token de acesso do BB."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    headers = { 'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json', 'X-Developer-Application-Key': settings.BB_DEVELOPER_APPLICATION_KEY }
    register_url = f"{settings.BB_API_BASE_URL}/boletos"


    logger.info(f"URL: {register_url}")
    logger.info(f"HEADERS: {headers}") 
    logger.debug(f"PAYLOAD keys: {list(final_payload.keys())} - valorOriginal={final_payload.get('valorOriginal')}")
    response = requests.post(register_url, json=final_payload, headers=headers, timeout=30)

    logger.info(f"RESPOSTA: Status {response.status_code}, Body: {response.text[:500]}...")

    if response.status_code not in [200, 201]:
        return Response({"error": f"Erro ao registrar boleto: {response.text}"}, status=response.status_code)


    # === GERACAO DO BOLETO ===
    boleto_response = response.json()

    # --- Extração dos campos retornados pelo BB (nomes conforme exemplo de resposta) ---
    beneficiario = boleto_response.get('beneficiario', {}) or {}
    # Linha digitável retornada pelo BB
    linha_digitavel = boleto_response.get('linhaDigitavel') or boleto_response.get('linha_digitavel')
    # Código de barras numérico (string somente com dígitos)
    codigo_barra_numerico = boleto_response.get('codigoBarraNumerico') or boleto_response.get('codigoBarra') or boleto_response.get('codigoBarras')
    # Nosso número / número do boleto
    numero_boleto = boleto_response.get('numero') or boleto_response.get('nossoNumero')
    # QR code info (muitos ambientes do BB retornam objeto qrCode; pode ter url, emv, txId, imagemBase64, payload)
    qr_info = boleto_response.get('qrCode', {}) or {}
    qr_url = qr_info.get('url') or ''
    qr_emv = qr_info.get('emv') or qr_info.get('payload') or ''
    qr_image_base64 = qr_info.get('imagemBase64') or qr_info.get('imagem')  # se existir

    # Log minimal — sem payloads sensíveis
    logger.debug(f"BB response: numero={numero_boleto}, linha_digitavel present={bool(linha_digitavel)}, codigo_barra_numerico present={bool(codigo_barra_numerico)}, qr present={bool(qr_url or qr_emv or qr_image_base64)}")


    # === GERAR QR CODE EM SVG ===
    qr_base64 = None
    qr_mime = None

    # 1) prefira imagem retornada pelo BB
    if qr_image_base64:
        # supondo que seja SVG ou PNG — você pode detectar depois se necessário
        qr_base64 = qr_image_base64
        # tente inferir mime (muitos retornam SVG em base64)
        qr_mime = 'image/svg+xml'
    else:
        # 2) se o BB retornou emv/payload, gere o QR localmente
        qr_payload = qr_emv or qr_url
        if qr_payload:
            try:
                factory = qrcode.image.svg.SvgImage
                qr = qrcode.make(qr_payload, image_factory=factory)
                qr_buffer = BytesIO()
                qr.save(qr_buffer)
                qr_buffer.seek(0)
                qr_base64 = base64.b64encode(qr_buffer.getvalue()).decode()
                qr_mime = 'image/svg+xml'
            except Exception as e:
                logger.warning(f"Falha ao gerar QR localmente: {e}")
                qr_base64 = None
                qr_mime = None
    # Se tudo falhar, qr_base64 fica None e o template não deve exibir QR.


    logger.debug("API codigoBarraNumerico (raw): %r", boleto_response.get('codigoBarraNumerico'))
    logger.debug("API linhaDigitavel (raw): %r", boleto_response.get('linhaDigitavel'))
    # se você já tem codigo_barra que vai para o gerador:
    

    # === GERAR CÓDIGO DE BARRAS EM SVG ===
    # === GERAR CÓDIGO DE BARRAS EM SVG (USAR MESMO PADRÃO QUE VOCÊ DISSE FUNCIONAR) ===
    writer_options = {
        'write_text': True,   # mostra os números abaixo
        'font_size': 30,      # tamanho da fonte dos números
        'text_distance': 10,  # distância entre barras e números
        'module_height': 48,  # altura das barras
        'module_width': 1,    # largura de cada barra
    }

    # Usar Code128 diretamente (mesmo padrão antigo)
    # 'codigo_barra' vem de: codigo_barra = boleto_response.get('codigoBarraNumerico')
    codigo_barra = linha_digitavel
    codigo_barra_obj = Code128(codigo_barra, writer=SVGWriter())
    barcode_buffer = BytesIO()
    # Algumas versões aceitam options=..., outras writer_options=...
    try:
        codigo_barra_obj.write(barcode_buffer, options=writer_options)
    except TypeError:
        codigo_barra_obj.write(barcode_buffer, writer_options=writer_options)
    barcode_buffer.seek(0)
    codigo_barra_base64 = base64.b64encode(barcode_buffer.getvalue()).decode()
    codigo_barra_mime = 'image/svg+xml'


    # === DADOS DO BOLETO ===
    data_boleto = {
        'codigo_banco_com_dv': boleto_response.get('bancoCodigoComDv') or '001-9',
        'linha_digitavel': linha_digitavel or '',
        'cedente': 'INOVAR SERVICOS ADMINISTRATIVOS LTDA',
        'agencia_codigo': f"{beneficiario.get('agencia','')}/{beneficiario.get('codigoCliente','') or boleto_response.get('codigoCliente','')}",
        'nosso_numero': numero_boleto or final_payload.get('numeroTituloBeneficiario',''),
        'data_vencimento': boleto_response.get('dataVencimento') or final_payload['dataVencimento'],
        'valor_boleto': f"R$ {float(boleto_response.get('valorOriginal', final_payload['valorOriginal'])):,.2f}".replace(',', 'v').replace('.', ',').replace('v', '.'),
        'numero_documento': final_payload.get('numeroTituloBeneficiario', '') or '',
        'cpf_cnpj': '46.440.172/0001-87',
        'data_documento': boleto_response.get('dataDocumento') or final_payload['dataEmissao'],
        'especie_doc': boleto_response.get('especieDocumento') or final_payload.get('descricaoTipoTitulo','DM'),
        'aceite': boleto_response.get('aceite') or final_payload.get('codigoAceite','N'),
        'data_processamento': boleto_response.get('dataProcessamento') or final_payload.get('dataEmissao','') or '',
        'carteira': str(final_payload['carteira']),
        'especie': 'R$',
        'quantidade': boleto_response.get('quantidade','') or '',
        'valor_unitario': boleto_response.get('valorUnitario','') or '',
        'demonstrativo1': boleto_response.get('demonstrativo1','') or '',
        'demonstrativo2': boleto_response.get('demonstrativo2','') or '',
        'demonstrativo3': boleto_response.get('demonstrativo3','') or '',
        'instrucoes1': boleto_response.get('mensagemOcorrencia') or final_payload.get('mensagemBloquetoOcorrencia',''),
        'instrucoes2': '',
        'instrucoes3': '',
        'instrucoes4': '',
        'sacado': final_payload['pagador']['nome'],
        'endereco1': final_payload['pagador'].get('endereco',''),
        'endereco2': f"{final_payload['pagador'].get('cidade','')} - {final_payload['pagador'].get('uf','')}",
    }


    # === CAMINHO ABSOLUTO DA LOGO ===
    caminho_logo = os.path.join(settings.BASE_DIR, 'frontend','src', 'assets', 'logobb.PNG')
    if not os.path.exists(caminho_logo):
        raise FileNotFoundError(f"Logo não encontrada: {caminho_logo}")

    with open(caminho_logo, "rb") as img_file:
        logobb_base64 = base64.b64encode(img_file.read()).decode()

    # === RENDERIZAR HTML COM SVG BASE64 ===
    caminho_logo_url = caminho_logo.replace('\\', '/')
    html_string = render_to_string('boleto_bb.html', {
        'dataBoleto': data_boleto,
        'caminho_logo': f"file:///{caminho_logo_url}",
        'codigo_barra_base64': codigo_barra_base64,
        'codigo_barra_mime': codigo_barra_mime,
        'qr_base64': qr_base64,
        'qr_mime': qr_mime,
        'logobb': logobb_base64,
    })

    # === CONFIGURAÇÕES DO PDF ===
    options = {
        'page-size': 'A4',
        'margin-top': '0mm',
        'margin-right': '0mm',
        'margin-bottom': '0mm',
        'margin-left': '0mm',
        'encoding': 'UTF-8',
        'quiet': '',
        'disable-smart-shrinking': '',
        'dpi': 300,
        'load-error-handling': 'ignore',
        'load-media-error-handling': 'ignore',
        'enable-local-file-access': None,
        'allow': os.path.dirname(caminho_logo),
        'enable-external-links': None,
        'enable-internal-links': None,
    }

    config = pdfkit.configuration(wkhtmltopdf=WKHTMLTOPDF_PATH)

    # === GERAR PDF ===
    try:
        pdf = pdfkit.from_string(
            html_string,
            False,
            options=options,
            configuration=config
        )
    except Exception as e:
        return HttpResponse(f"Erro ao gerar PDF: {str(e)}", status=500)

    documento_honorario = salvar_boleto_honorario_departamento_pessoal(empresa, pdf)
    nome_base_empresa = empresa.nome or 'empresa'
    nome_arquivo_boleto = sanitize_filename_for_upload(f"honorario_{nome_base_empresa}.pdf").lower()
    usuario_envio = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None

    # Se a ação for apenas baixar, não envia pelo WhatsApp
    if action == "baixar":
        return Response({
            "success": True,
            "message": "Boleto gerado e disponível para download.",
            "from_cache": False,
            "download_url": request.build_absolute_uri(documento_honorario.caminho_arquivo.url),
            "arquivo_pasta": documento_honorario.nome_arquivo,
            "caminho_arquivo": documento_honorario.caminho_arquivo.name,
        }, status=status.HTTP_200_OK)

    try:
        message_id, whatsapp_error = enviar_boleto_honorario_whatsapp(
            empresa=empresa,
            pdf_content=pdf,
            nome_arquivo=nome_arquivo_boleto,
            usuario=usuario_envio,
        )
        if message_id:
            logger.info(f"Boleto enviado via WhatsApp com sucesso para {empresa.nome}. message_id={message_id}")
        else:
            logger.warning(f"Falha ao enviar boleto via WhatsApp para {empresa.nome}: {whatsapp_error}")
    except Exception as e:
        logger.error(f"Erro inesperado no fluxo de envio do boleto via WhatsApp para {empresa.nome}: {e}")

    # === RETORNO ===
    return Response({
        "success": True,
        "message": "Boleto gerado, salvo na pasta da empresa e processado para envio no WhatsApp.",
        "arquivo_whatsapp": nome_arquivo_boleto,
        "arquivo_pasta": documento_honorario.nome_arquivo,
        "caminho_arquivo": documento_honorario.caminho_arquivo.name,
    }, status=status.HTTP_200_OK)
