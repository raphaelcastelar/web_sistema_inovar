import os
import smtplib
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

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
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

from empresas.serpro_service import gerar_e_enviar_das
from .permissions import IsPessoalOrFiscalOrAdmin

from .models import (
    Empresa, DocumentosConstitutivos, XML, DepartamentoPessoal, 
    SimplesNacional, Outros, HistoricoEnvios, Funcionario, ObrigacaoMensal, UserCompanyAccess, Pendencia, Notification

)
from .serializers import (
    EmpresaSerializer, DocumentosConstitutivosSerializer, XMLSerializer, 
    DepartamentoPessoalSerializer, SimplesNacionalSerializer, OutrosSerializer, 
    HistoricoEnviosSerializer, FuncionarioSerializer, PendenciaSerializer, NotificationSerializer
)
from .utils import gerar_nome_pasta_empresa_padronizado, sanitize_filename_for_upload
from .serpro_service import (
    gerar_das_serpro, 
    obter_dados_extrato_serpro, 
    obter_extrato_pdf_serpro,
    orquestrar_consulta_extrato,
    declarar_das_serpro,
)
from .filters import HistoricoEnviosFilter
from .whatsapp_utils import upload_media_to_whatsapp, send_whatsapp_document_template_message


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

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.query_params.get('all') == 'true':
            return queryset
        if not self.request.user.is_staff and not self.request.user.is_superuser:
            queryset = queryset.filter(gerenciada_por=self.request.user)
        return queryset

    def get_permissions(self):
        if self.action in ['create', 'update', 'destroy']:
            return [IsAdminUser()]
        elif self.action == 'partial_update':
            return [IsAuthenticated(), IsPessoalOrFiscalOrAdmin()]  # Updated permission class
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_queryset().get(pk=kwargs.get('pk'))
        empresa_nome = instance.nome  # Armazenar o nome antes da exclusão

        # Obter funcionários associados via UserCompanyAccess antes de excluir
        users_to_notify = Funcionario.objects.filter(usercompanyaccess__empresa=instance)
        logger.info(f"Excluindo empresa '{empresa_nome}'. Usuários a notificar: {[user.username for user in users_to_notify]}")

        # Excluir a empresa
        self.perform_destroy(instance)

        # Criar notificações para exclusão
        for user in users_to_notify:
            Notification.objects.create(
                user=user,
                message=f'Administrador excluiu a empresa "{empresa_nome}".'
            )
        logger.info(f"Notificações criadas para exclusão da empresa '{empresa_nome}'.")
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, *args, **kwargs):
        empresa_id = kwargs.get('pk')
        try:
            empresa = Empresa.objects.get(id=empresa_id)
            self.check_object_permissions(request, empresa)
            serializer = self.get_serializer(empresa, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Empresa.DoesNotExist:
            return Response({"error": f"Empresa com ID {empresa_id} não encontrada."}, status=status.HTTP_404_NOT_FOUND)
        
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        empresa = serializer.instance

        # Obter funcionários associados via UserCompanyAccess
        users_to_notify = Funcionario.objects.filter(usercompanyaccess__empresa=empresa)
        logger.info(f"Criando empresa '{empresa.nome}'. Usuários a notificar: {[user.username for user in users_to_notify]}")
        for user in users_to_notify:
            Notification.objects.create(
                user=user,
                message=f'Administrador adicionou a empresa "{empresa.nome}".'
            )
        logger.info(f"Notificações criadas para empresa '{empresa.nome}'.")
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_queryset().get(pk=kwargs.get('pk'))
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        # Obter funcionários associados via UserCompanyAccess
        users_to_notify = Funcionario.objects.filter(usercompanyaccess__empresa=instance)
        logger.info(f"Atualizando empresa '{instance.nome}'. Usuários a notificar: {[user.username for user in users_to_notify]}")
        for user in users_to_notify:
            Notification.objects.create(
                user=user,
                message=f'Administrador alterou informações da empresa "{instance.nome}".'
            )
        logger.info(f"Notificações criadas para atualização da empresa '{instance.nome}'.")
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

class NotificationViewSet(viewsets.ModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by('-timestamp')

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
        return Response(
            {"error": "Parâmetros faltando: empresa_id, file_ids e tipo_pasta são obrigatórios."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if tipo_pasta == 'xml':
        return Response({"error": "Envio de arquivos XML por WhatsApp não é suportado."}, status=status.HTTP_400_BAD_REQUEST)

    if tipo_pasta not in MODEL_CONFIG_MAP:
        return Response({"error": f"Tipo de pasta '{tipo_pasta}' não suportado para envio por WhatsApp."}, status=status.HTTP_400_BAD_REQUEST)

    config = MODEL_CONFIG_MAP[tipo_pasta]
    DocumentModel = config['model']
    whatsapp_template_to_use = config['whatsapp_template_name'] # Pega o nome do template do config

    try:
        empresa = Empresa.objects.get(id=empresa_id)
    except Empresa.DoesNotExist:
        return Response({"error": "Empresa não encontrada."}, status=status.HTTP_404_NOT_FOUND)

    raw_phone_number = empresa.telefone
    if not raw_phone_number:
        logger.warning(f"Empresa {empresa.nome} (ID: {empresa_id}) não possui telefone cadastrado.")
        return Response({"error": "Telefone não cadastrado para esta empresa."}, status=status.HTTP_400_BAD_REQUEST)

    recipient_whatsapp_number = re.sub(r'\D', '', raw_phone_number)
    if not (len(recipient_whatsapp_number) >= 10 and len(recipient_whatsapp_number) <= 13 and recipient_whatsapp_number.isdigit()):
         return Response({"error": f"O número de telefone '{raw_phone_number}' cadastrado para a empresa não é válido para WhatsApp."}, status=status.HTTP_400_BAD_REQUEST)
    if not recipient_whatsapp_number.startswith('55') and len(recipient_whatsapp_number) in [10,11]:
        recipient_whatsapp_number = '55' + recipient_whatsapp_number
    elif not recipient_whatsapp_number.startswith('55'):
        return Response({"error": f"O DDI (ex: 55 para Brasil) parece estar faltando no número de telefone '{raw_phone_number}'."}, status=status.HTTP_400_BAD_REQUEST)

    logger.info(f"Número de WhatsApp a ser utilizado para {empresa.nome}: {recipient_whatsapp_number}")

    filter_kwargs = {'id__in': file_ids}
    filter_kwargs[config['company_field_name']] = getattr(empresa, config['company_attr'])
    documentos_qs = DocumentModel.objects.filter(**filter_kwargs)

    if not documentos_qs.exists():
        return Response(
            {"error": f"Nenhum documento válido do tipo '{tipo_pasta}' encontrado para os IDs e empresa fornecidos."},
            status=status.HTTP_404_NOT_FOUND
        )

    files_sent_count = 0
    successful_sends = []
    failed_sends = []
    company_name_for_template = empresa.nome 

    for doc in documentos_qs:
        if not doc.caminho_arquivo or not hasattr(doc.caminho_arquivo, 'path'):
            logger.warning(f"Documento ID {doc.id} ({doc.nome_arquivo}) não tem um caminho de arquivo válido.")
            failed_sends.append({"filename": doc.nome_arquivo, "reason": "Caminho do arquivo inválido."})
            continue
        
        file_path_on_server = doc.caminho_arquivo.path
        original_filename = doc.nome_arquivo
        logger.info(f"Processando envio para WhatsApp: {original_filename} para {recipient_whatsapp_number} (Empresa: {company_name_for_template}) usando template: {whatsapp_template_to_use}")

        media_id, _ = upload_media_to_whatsapp(file_path_on_server, original_filename)

        if not media_id:
            logger.error(f"Falha ao fazer upload da mídia para {original_filename}.")
            failed_sends.append({"filename": original_filename, "reason": "Falha no upload da mídia."})
            continue

        message_id, error_sending = send_whatsapp_document_template_message(
            recipient_number=recipient_whatsapp_number,
            document_media_id=media_id,
            document_filename=original_filename,
            company_name_for_template=company_name_for_template,
            template_name=whatsapp_template_to_use # <<< USA O TEMPLATE DINÂMICO AQUI
        )

        if message_id:
            status_envio = 'sucesso'
            successful_sends.append({"filename": original_filename, "message_id": message_id})
            files_sent_count += 1
            if tipo_pasta == 'simples_nacional':
                try:
                    # Determina o período de apuração do arquivo (pode precisar de ajuste)
                    # Assumindo que o arquivo tem ano e mês. Se não, podemos pegar o mês atual.
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

        HistoricoEnvios.objects.create(
            remetente=recipient_whatsapp_number,
            arquivo=original_filename,
            status=status_envio,
            message_id=message_id # Será None se houver falha
        )

    final_status = status.HTTP_200_OK
    if files_sent_count == 0 and documentos_qs.exists(): 
        if failed_sends: # Se houve tentativas mas todas falharam
             final_status = status.HTTP_400_BAD_REQUEST
        # Se não houve falhas mas nenhum foi enviado (ex: todos os caminhos inválidos antes do upload)
        # Isso já seria coberto por failed_sends. Se failed_sends está vazio e files_sent_count é 0,
        # mas documentos_qs existe, é uma situação estranha, mas manteremos 400.
        elif not failed_sends:
             final_status = status.HTTP_400_BAD_REQUEST


    return Response({
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
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def declarar_das_api(request):
    """
    API para declarar o DAS de uma empresa para um período específico.
    Expects: {"empresa_id": int, "periodo_apuracao": "YYYYMM", "dados_declaracao": {...}}
    """
    empresa_id = request.data.get('empresa_id')
    periodo_apuracao = request.data.get('periodo_apuracao')
    dados_declaracao = request.data.get('dados_declaracao')

    if not all([empresa_id, periodo_apuracao, dados_declaracao]):
        return Response({'error': 'Campos empresa_id, periodo_apuracao e dados_declaracao são obrigatórios.'}, status=400)

    try:
        empresa = Empresa.objects.get(id=empresa_id)
        # Verificar permissões
        user = request.user
        if not (user.is_staff or user.is_superuser or empresa.usercompanyaccess.filter(user=user).exists()):
            return Response({'error': 'Você não tem permissão para declarar o DAS desta empresa.'}, status=403)

        # Formatar periodo_apuracao para o modelo (converte "YYYYMM" para DateField)
        ano = int(periodo_apuracao[:4])
        mes = int(periodo_apuracao[4:])
        periodo_apuracao_date = timezone.datetime(ano, mes, 1).date()

        # Chamar a API Serpro
        result = declarar_das_serpro(empresa.cnpj, periodo_apuracao, dados_declaracao)
        if not result['sucesso']:
            return Response({'error': result['erro'], 'detalhes': result.get('detalhes', '')}, status=400)

        # Atualizar ou criar ObrigacaoMensal
        obrigacao, created = ObrigacaoMensal.objects.get_or_create(
            empresa=empresa,
            tipo='simples_nacional',
            periodo_apuracao=periodo_apuracao_date,
            defaults={
                'status': 'declarado',
                'data_envio': timezone.now(),
                'responsavel_envio': user,
                'numero_declaracao': result['detalhes'].get('numeroDeclaracao', '')
            }
        )
        if not created:
            obrigacao.status = 'declarado'
            obrigacao.data_envio = timezone.now()
            obrigacao.responsavel_envio = user
            obrigacao.numero_declaracao = result['detalhes'].get('numeroDeclaracao', '')
            obrigacao.save()

        return Response({
            'message': 'DAS declarado com sucesso.',
            'detalhes': result['detalhes']
        })

    except Empresa.DoesNotExist:
        return Response({'error': 'Empresa não encontrada.'}, status=404)
    except Exception as e:
        logger.error(f"Erro ao declarar DAS: {str(e)}")
        return Response({'error': f'Erro ao declarar DAS: {str(e)}'}, status=500)
    
@csrf_exempt
def gerar_e_enviar_das_view(request):
    """
    View to handle DAS generation and sending via WhatsApp.
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

    result = gerar_e_enviar_das(cnpj_empresa, periodo_apuracao)
    if result["sucesso"]:
        return JsonResponse(result, status=200)
    return JsonResponse(result, status=400)


@api_view(['GET'])
def dashboard_pie_chart(request):
    """
    Returns data for a pie chart based on the user's role.
    """
    try:
        user = request.user
        if not user.is_authenticated:
            logger.error("Usuário não autenticado.")
            return Response({"error": "Usuário não autenticado."}, status=status.HTTP_401_UNAUTHORIZED)

        # Verificar se o campo 'cargo' existe
        try:
            cargo = user.cargo if hasattr(user, 'cargo') else 'admin'
        except AttributeError:
            logger.error(f"Modelo User não possui campo 'cargo' para usuário {user.username}. Usando 'admin' como fallback.")
            cargo = 'admin'
        logger.info(f"Gerando dados do gráfico de pizza para usuário {user.username} com cargo {cargo}")

        # Get companies the user has access to
        empresas = Empresa.objects.filter(usercompanyaccess__user=user)
        logger.info(f"Empresas encontradas para usuário {user.username}: {empresas.count()}")
        if not empresas.exists():
            logger.info(f"Nenhuma empresa associada ao usuário {user.username}")
            return Response({"labels": [], "values": []}, status=status.HTTP_200_OK)

        data = {"labels": ["Pendentes", "Concluídas"], "values": [0, 0]}

        if cargo == 'pessoal':
            # Departamento Pessoal: Usar campos inss, fgts, folha, honorario de Empresa
            pendentes_inss = empresas.filter(inss=False).count()
            pendentes_fgts = empresas.filter(fgts=False).count()
            pendentes_folha = empresas.filter(folha=False).count()
            pendentes_honorario = empresas.filter(honorario=False).count()
            concluidas_inss = empresas.filter(inss=True).count()
            concluidas_fgts = empresas.filter(fgts=True).count()
            concluidas_folha = empresas.filter(folha=True).count()
            concluidas_honorario = empresas.filter(honorario=True).count()
            pendentes_total = pendentes_inss + pendentes_fgts + pendentes_folha + pendentes_honorario
            concluidas_total = concluidas_inss + concluidas_fgts + concluidas_folha + concluidas_honorario
            data["values"] = [pendentes_total, concluidas_total]
            logger.info(f"Dados para Departamento Pessoal: Pendentes={pendentes_total}, Concluídas={concluidas_total}")
        elif cargo == 'fiscal':
            # Departamento Fiscal: Simples Nacional pending vs. completed
            pendentes = empresas.filter(simples_nacional=False, monitorar_simples=True).count()
            concluidas = empresas.filter(simples_nacional=True, monitorar_simples=True).count()
            data["values"] = [pendentes, concluidas]
            logger.info(f"Dados para Departamento Fiscal: Pendentes={pendentes}, Concluídas={concluidas}")
        elif cargo == 'admin':
            # Administrador: All pending tasks (personnel + fiscal)
            pendentes_inss = empresas.filter(inss=False).count()
            pendentes_fgts = empresas.filter(fgts=False).count()
            pendentes_folha = empresas.filter(folha=False).count()
            pendentes_honorario = empresas.filter(honorario=False).count()
            pendentes_fiscal = empresas.filter(simples_nacional=False, monitorar_simples=True).count()
            concluidas_inss = empresas.filter(inss=True).count()
            concluidas_fgts = empresas.filter(fgts=True).count()
            concluidas_folha = empresas.filter(folha=True).count()
            concluidas_honorario = empresas.filter(honorario=True).count()
            concluidas_fiscal = empresas.filter(simples_nacional=True, monitorar_simples=True).count()
            pendentes_pessoal = pendentes_inss + pendentes_fgts + pendentes_folha + pendentes_honorario
            concluidas_pessoal = concluidas_inss + concluidas_fgts + concluidas_folha + concluidas_honorario
            data["labels"] = ["Pendentes Pessoal", "Pendentes Fiscal", "Concluídas Pessoal", "Concluídas Fiscal"]
            data["values"] = [pendentes_pessoal, pendentes_fiscal, concluidas_pessoal, concluidas_fiscal]
            logger.info(f"Dados para Administrador: Pendentes Pessoal={pendentes_pessoal}, Pendentes Fiscal={pendentes_fiscal}, "
                        f"Concluídas Pessoal={concluidas_pessoal}, Concluídas Fiscal={concluidas_fiscal}")
        else:
            logger.error(f"Cargo inválido: {cargo}")
            return Response({"error": "Cargo inválido."}, status=status.HTTP_400_BAD_REQUEST)

        return Response(data, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Erro ao gerar dados do gráfico de pizza: {str(e)}")
        return Response({"error": f"Erro interno ao gerar dados do gráfico: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    