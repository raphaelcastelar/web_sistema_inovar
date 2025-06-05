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
from .utils import gerar_nome_pasta_empresa_padronizado
import logging
import datetime
import re
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
        'company_field_name': 'nome_empresa', 'company_attr': 'nome',
        'fs_folder_name': 'DOCUMENTOS CONSTITUTIVOS', 'has_year_month': False
    },
    'departamento_pessoal': {
        'model': DepartamentoPessoal, 'serializer': DepartamentoPessoalSerializer,
        'company_field_name': 'cnpj_empresa', 'company_attr': 'cnpj', # ou nome_empresa se você padronizou
        'fs_folder_name': 'DEPARTAMENTO PESSOAL', 'has_year_month': True
    },
    'simples_nacional': {
        'model': SimplesNacional, 'serializer': SimplesNacionalSerializer,
        'company_field_name': 'cnpj_empresa', 'company_attr': 'cnpj', # ou nome_empresa
        'fs_folder_name': 'SIMPLES NACIONAL', 'has_year_month': True
    },
    'xml': {
        'model': XML, 'serializer': XMLSerializer,
        'company_field_name': 'cnpj_empresa', 'company_attr': 'cnpj', # ou nome_empresa
        'fs_folder_name': 'XML', 'has_year_month': True
    },
    'outros': {
        'model': Outros, 'serializer': OutrosSerializer,
        'company_field_name': 'nome_empresa', 'company_attr': 'nome',
        'fs_folder_name': 'OUTROS', 'has_year_month': False
    },
}

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
    
    # Usa a função que você definiu para gerar o nome da pasta da empresa (MAIÚSCULAS, COM ESPAÇOS)
    company_folder_name_on_fs = gerar_nome_pasta_empresa_padronizado(empresa.nome)
    base_doc_type_path_on_fs = os.path.join(settings.MEDIA_ROOT, company_folder_name_on_fs, config['fs_folder_name'])

    if not os.path.isdir(base_doc_type_path_on_fs):
        # Se a pasta base do tipo de documento não existe, podemos criá-la
        # ou retornar um erro/aviso. Por agora, vamos criá-la se o sinal não o fez.
        try:
            os.makedirs(base_doc_type_path_on_fs, exist_ok=True)
            logger.info(f"Criado diretório base do tipo de documento que faltava durante sync: {base_doc_type_path_on_fs}")
            # Se for um tipo com estrutura de ano/mês, criamos o ano atual e os 12 meses
            if config['has_year_month']:
                ano_atual_str = str(datetime.date.today().year)
                caminho_pasta_ano = os.path.join(base_doc_type_path_on_fs, ano_atual_str)
                os.makedirs(caminho_pasta_ano, exist_ok=True)
                for numero_mes in range(1, 13):
                    mes_formatado_str = f"{numero_mes:02d}"
                    nome_pasta_mes_ano = f"{mes_formatado_str}{ano_atual_str}"
                    caminho_pasta_mes_ano = os.path.join(caminho_pasta_ano, nome_pasta_mes_ano)
                    os.makedirs(caminho_pasta_mes_ano, exist_ok=True)
        except Exception as e:
            logger.error(f"Erro ao tentar criar estrutura de pasta para sync: {e}")
            # Não prosseguir se não puder garantir a pasta base
            return Response({"error": f"Não foi possível acessar ou criar a pasta de destino no servidor: {base_doc_type_path_on_fs}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    # 1. Obter todos os arquivos do banco de dados para esta empresa e tipo de pasta
    db_files_map = {} # { 'caminho/relativo/arquivo.pdf': instance }
    company_filter_value = getattr(empresa, config['company_attr'])
    db_queryset = DocumentModel.objects.filter(**{config['company_field_name']: company_filter_value})
    for doc_instance in db_queryset:
        if doc_instance.caminho_arquivo and doc_instance.caminho_arquivo.name:
            db_files_map[doc_instance.caminho_arquivo.name] = doc_instance

    # 2. Varrer o sistema de arquivos e comparar
    found_fs_files_relative_paths = set()
    added_count = 0
    
    # Lógica de varredura (simplificada)
    if config['has_year_month']:
        if os.path.exists(base_doc_type_path_on_fs):
            for year_name in os.listdir(base_doc_type_path_on_fs): # ex: "2023", "2024"
                year_path = os.path.join(base_doc_type_path_on_fs, year_name)
                if os.path.isdir(year_path) and year_name.isdigit() and len(year_name) == 4:
                    for monthyear_name in os.listdir(year_path): # ex: "012023", "122023"
                        monthyear_path = os.path.join(year_path, monthyear_name)
                        if os.path.isdir(monthyear_path) and len(monthyear_name) == 6 and monthyear_name[:2].isdigit():
                            month_str = monthyear_name[:2]
                            for filename in os.listdir(monthyear_path):
                                if os.path.isfile(os.path.join(monthyear_path, filename)):
                                    # Caminho relativo como seria salvo pelo upload_to
                                    # Este caminho precisa ser IDÊNTICO ao que a função upload_to geraria
                                    # para o arquivo se ele fosse carregado normalmente.
                                    # Adapte se sua função `gerar_nome_pasta_empresa_padronizado` for diferente
                                    # do company_folder_name_on_fs ou se sanitize_filename mudar muito o nome.
                                    
                                    # Assumindo que sanitize_filename e gerar_nome_pasta_empresa_com_espacos_e_maiusculas
                                    # são usados pelas suas funções upload_to.
                                    # O `filename` aqui é o nome como está no FS. O `sanitize_filename`
                                    # é aplicado no upload. Para sync, talvez você queira usar o nome do FS diretamente.
                                    # Por simplicidade, vamos assumir que o nome do arquivo no FS é o nome a ser usado.
                                    
                                    # A função 'upload_to' original que você tem para estes tipos:
                                    # timed_folder_upload_path(instance, filename, base_folder_name)
                                    # Ela espera 'instance.ano', 'instance.mes'.
                                    # Ao criar um novo registro, precisamos preencher esses.
                                    
                                    # Para construir o caminho relativo correto:
                                    # Este é o nome da pasta da empresa, já MAIÚSCULO e com espaços
                                    path_part_empresa = company_folder_name_on_fs 
                                    # Este é o nome da pasta do tipo de doc, ex: 'XML'
                                    path_part_tipo = config['fs_folder_name'] 
                                    
                                    relative_path = os.path.join(path_part_empresa, path_part_tipo, year_name, monthyear_name, filename)
                                    found_fs_files_relative_paths.add(relative_path)

                                    if relative_path not in db_files_map:
                                        try:
                                            # Arquivo no FS, não no DB -> Adicionar
                                            # Precisamos do 'nome_empresa' para consistência se os modelos de doc o usam
                                            # nas funções upload_to, mesmo que derivemos do objeto 'empresa'.
                                            doc_data = {
                                                config['company_field_name']: company_filter_value,
                                                'nome_arquivo': filename,
                                                'tipo_documento': tipo_pasta_sync.replace("_", "-"), # Ou mais específico
                                                'ano': year_name,
                                                'mes': month_str,
                                                'caminho_arquivo': relative_path # Atribuição direta do caminho
                                            }
                                            if 'nome_empresa' in DocumentModel._meta.get_fields_map(): # Se o modelo tem nome_empresa
                                                doc_data['nome_empresa'] = empresa.nome
                                            if 'entregue' in DocumentModel._meta.get_fields_map(): # Para DP, SN
                                                doc_data['entregue'] = False 
                                            
                                            DocumentModel.objects.create(**doc_data)
                                            added_count += 1
                                            logger.info(f"SYNC: Adicionado ao DB: {relative_path}")
                                        except Exception as e_create:
                                            logger.error(f"SYNC: Erro ao criar registro no DB para {relative_path}: {e_create}")
    else: # Pastas sem estrutura de ano/mês (DocumentosConstitutivos, Outros)
        if os.path.exists(base_doc_type_path_on_fs):
            for filename in os.listdir(base_doc_type_path_on_fs):
                if os.path.isfile(os.path.join(base_doc_type_path_on_fs, filename)):
                    path_part_empresa = company_folder_name_on_fs
                    path_part_tipo = config['fs_folder_name']
                    relative_path = os.path.join(path_part_empresa, path_part_tipo, filename)
                    found_fs_files_relative_paths.add(relative_path)

                    if relative_path not in db_files_map:
                        try:
                            doc_data = {
                                config['company_field_name']: company_filter_value,
                                'nome_arquivo': filename,
                                'tipo_documento': tipo_pasta_sync.replace("_", "-"),
                                'caminho_arquivo': relative_path
                            }
                            if 'nome_empresa' in DocumentModel._meta.get_fields_map():
                                 doc_data['nome_empresa'] = empresa.nome

                            DocumentModel.objects.create(**doc_data)
                            added_count += 1
                            logger.info(f"SYNC: Adicionado ao DB: {relative_path}")
                        except Exception as e_create:
                            logger.error(f"SYNC: Erro ao criar registro no DB para {relative_path}: {e_create}")

    # 3. Remover do DB arquivos que não estão mais no FS
    removed_count = 0
    for db_path, db_instance in db_files_map.items():
        if db_path not in found_fs_files_relative_paths:
            try:
                db_instance.delete()
                removed_count += 1
                logger.info(f"SYNC: Removido do DB (não encontrado no FS): {db_path}")
            except Exception as e_delete:
                logger.error(f"SYNC: Erro ao remover registro do DB para {db_path}: {e_delete}")

    # 4. Retornar a lista atualizada
    final_queryset = DocumentModel.objects.filter(**{config['company_field_name']: company_filter_value})
    serializer = DocumentSerializer(final_queryset, many=True)
    
    return Response({
        "message": f"Sincronização da pasta '{config['fs_folder_name']}' concluída. "
                   f"{added_count} adicionado(s), {removed_count} removido(s).",
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
            files_sent_count += 1
            successful_sends.append({"filename": original_filename, "message_id": message_id})
        else:
            failed_sends.append({"filename": original_filename, "reason": f"Falha ao enviar template: {error_sending}"})

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