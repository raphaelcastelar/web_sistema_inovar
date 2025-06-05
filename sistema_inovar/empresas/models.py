# models.py
import os
import re # Para sanitizar nomes de pastas/arquivos
import unidecode # Para remover acentos de nomes de pastas/arquivos (pip install unidecode)
from django.db import models
import logging
from .utils import gerar_nome_pasta_empresa_padronizado

logger = logging.getLogger(__name__)

# --- Sua classe Empresa aqui ---
class Empresa(models.Model):
    id = models.AutoField(primary_key=True)
    nome = models.CharField(max_length=100, null=False)
    cnpj = models.CharField(max_length=18, unique=True, null=False)
    email = models.CharField(max_length=255, null=False)
    telefone = models.CharField(max_length=15, null=True, blank=False)

    def __str__(self):
        return self.nome

# --- Função auxiliar para gerar nome da pasta da empresa ---
def get_document_company_folder_name_for_upload(document_instance):
    """
    Obtém o nome da empresa da instância do documento e o formata para nome de pasta.
    """
    if hasattr(document_instance, 'nome_empresa') and document_instance.nome_empresa:
        # USA A FUNÇÃO CENTRALIZADA
        return gerar_nome_pasta_empresa_padronizado(document_instance.nome_empresa)
    else:
        logger.error(f"Instância de documento (tipo: {type(document_instance).__name__}, "
                     f"pk: {document_instance.pk if document_instance.pk else 'UNSAVED'}) "
                     f"não possui 'nome_empresa'. Usando fallback MUITO genérico.")
        # Este fallback é problemático pois não será consistente se 'nome_empresa' faltar.
        # Garanta que 'nome_empresa' seja sempre populado no documento.
        return "EMPRESA_NOME_NAO_FORNECIDO_NO_DOCUMENTO"

# --- Função auxiliar para sanitizar nome do arquivo ---
def sanitize_filename(filename):
    name, ext = os.path.splitext(filename)
    # Remove acentos e caracteres especiais do nome do arquivo, mantendo a extensão
    clean_name = unidecode.unidecode(name)
    clean_name = re.sub(r'\s+', '_', clean_name) # Substitui espaços por underscore
    clean_name = re.sub(r'[^\w-]', '', clean_name) # Remove outros caracteres não seguros
    return f"{clean_name}{ext}"

# --- Funções upload_to específicas ---
def documentos_constitutivos_upload_path(instance, filename):
    company_folder = get_document_company_folder_name_for_upload(instance)
    clean_filename = sanitize_filename(filename)
    return os.path.join(company_folder, 'DOCUMENTOS CONSTITUTIVOS', clean_filename)

def outros_upload_path(instance, filename):
    company_folder = get_document_company_folder_name_for_upload(instance)
    clean_filename = sanitize_filename(filename)
    return os.path.join(company_folder, 'OUTROS', clean_filename)

def timed_folder_upload_path(instance, filename, base_folder_name):
    company_folder = get_document_company_folder_name_for_upload(instance)
    year = str(instance.ano)
    # instance.mes deve ser o número do mês com dois dígitos (ex: "01", "12")
    month_for_folder = str(instance.mes).zfill(2) 
    month_year_folder = f"{month_for_folder}{year}" # Ex: "012025"
    clean_filename = sanitize_filename(filename)
    return os.path.join(company_folder, base_folder_name, year, month_year_folder, clean_filename)

def departamento_pessoal_upload_path(instance, filename):
    return timed_folder_upload_path(instance, filename, 'DEPARTAMENTO PESSOAL')

def simples_nacional_upload_path(instance, filename):
    return timed_folder_upload_path(instance, filename, 'SIMPLES NACIONAL')

def xml_upload_path(instance, filename):
    return timed_folder_upload_path(instance, filename, 'XML')

# --- Atualize seus modelos para usar as novas funções upload_to ---

class DocumentosConstitutivos(models.Model):
    id = models.AutoField(primary_key=True)
    nome_arquivo = models.CharField(max_length=255, null=False)
    nome_empresa = models.CharField(max_length=255, null=False) # Usado por get_company_folder_identifier
    tipo_documento = models.CharField(max_length=40, null=False)
    caminho_arquivo = models.FileField(upload_to=documentos_constitutivos_upload_path, null=False, max_length=500) # ATUALIZADO

    class Meta:
        unique_together = ('nome_arquivo', 'nome_empresa', 'tipo_documento')
        db_table = 'empresas_documentosconstitutivos'

    def save(self, *args, **kwargs):
        logger.info(f"Salvando DocumentosConstitutivos: {self.nome_arquivo}")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nome_arquivo} - {self.nome_empresa}"

class XML(models.Model):
    id = models.AutoField(primary_key=True)
    nome_arquivo = models.CharField(max_length=255, null=False)
    nome_empresa = models.CharField(max_length=255, null=True, blank=True, help_text="Nome da empresa para path de upload")
    cnpj_empresa = models.CharField(max_length=18, null=False) # Usado por get_company_folder_identifier
    tipo_documento = models.CharField(max_length=40, null=False)
    caminho_arquivo = models.FileField(upload_to=xml_upload_path, null=False, max_length=500) # ATUALIZADO
    mes = models.CharField(max_length=2, null=False) # Alterado para max_length=2 para "01", "12"
    ano = models.CharField(max_length=4, null=False)

    def save(self, *args, **kwargs):
        logger.info(f"Salvando XML: {self.nome_arquivo}")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nome_arquivo} - {self.cnpj_empresa}"

class DepartamentoPessoal(models.Model):
    id = models.AutoField(primary_key=True)
    nome_arquivo = models.CharField(max_length=255, null=False)
    nome_empresa = models.CharField(max_length=255, null=True, blank=True, help_text="Nome da empresa para path de upload")
    cnpj_empresa = models.CharField(max_length=18, null=False) # Usado por get_company_folder_identifier
    tipo_documento = models.CharField(max_length=40, null=False)
    caminho_arquivo = models.FileField(upload_to=departamento_pessoal_upload_path, null=False, max_length=500) # ATUALIZADO
    mes = models.CharField(max_length=2, null=False) # Alterado para max_length=2
    ano = models.CharField(max_length=4, null=False)
    entregue = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        logger.info(f"Salvando DepartamentoPessoal: {self.nome_arquivo}")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nome_arquivo} - {self.cnpj_empresa}"

class SimplesNacional(models.Model):
    id = models.AutoField(primary_key=True)
    nome_arquivo = models.CharField(max_length=255, null=False)
    nome_empresa = models.CharField(max_length=255, null=True, blank=True, help_text="Nome da empresa para path de upload")
    cnpj_empresa = models.CharField(max_length=18, null=False) # Usado por get_company_folder_identifier
    tipo_documento = models.CharField(max_length=40, null=False)
    caminho_arquivo = models.FileField(upload_to=simples_nacional_upload_path, null=False, max_length=500) # ATUALIZADO
    mes = models.CharField(max_length=2, null=False) # Alterado para max_length=2
    ano = models.CharField(max_length=4, null=False)
    entregue = models.BooleanField(default=False)

    class Meta:
        unique_together = ('nome_arquivo', 'cnpj_empresa', 'tipo_documento', 'mes', 'ano')

    def save(self, *args, **kwargs):
        logger.info(f"Salvando SimplesNacional: {self.nome_arquivo}")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nome_arquivo} - {self.cnpj_empresa}"
    
class Outros(models.Model):
    # Se 'Outros' também precisa de um ID primário explícito
    # id = models.AutoField(primary_key=True) 
    nome_arquivo = models.CharField(max_length=255)
    nome_empresa = models.CharField(max_length=255) # Usado por get_company_folder_identifier
    tipo_documento = models.CharField(max_length=50) # Aumentado de 10 para 50 para consistência
    caminho_arquivo = models.FileField(upload_to=outros_upload_path, max_length=500) # ATUALIZADO

    class Meta:
        db_table = 'outros'

    def __str__(self):
        return self.nome_arquivo
    
class HistoricoEnvios(models.Model):
    STATUS_CHOICES = [
        ('sucesso', 'Sucesso'),
        ('falha', 'Falha'),
    ]

    id = models.AutoField(primary_key=True)
    # auto_now_add=True preenche automaticamente com a data e hora da criação
    data_hora = models.DateTimeField(auto_now_add=True) 
    remetente = models.CharField(max_length=20) # Número para o qual foi enviado
    arquivo = models.CharField(max_length=255)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    # message_id pode ser nulo se o envio falhar antes de ser gerado
    message_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        # Define o nome da tabela explicitamente
        db_table = 'historico_envios'
        # Ordena os resultados mais recentes primeiro por padrão
        ordering = ['-data_hora']

    def __str__(self):
        return f"Envio para {self.remetente} em {self.data_hora.strftime('%d/%m/%Y %H:%M')} - Status: {self.status}"