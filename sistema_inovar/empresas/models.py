# models.py
import os
import re # Para sanitizar nomes de pastas/arquivos
import unidecode # Para remover acentos de nomes de pastas/arquivos (pip install unidecode)
from django.db import models
import logging

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
def get_company_folder_identifier(instance_obj):
    """
    Gera um nome de pasta seguro para a empresa.
    Tenta usar o CNPJ se disponível no objeto da instância, caso contrário, o nome da empresa.
    Isso assume que 'instance_obj' é uma instância de um dos seus modelos de documento
    e tem um atributo 'cnpj_empresa' ou 'nome_empresa'.
    Para uma solução mais robusta, o ideal seria ter um ForeignKey para o modelo Empresa
    em todos os modelos de documento e usar um identificador único da Empresa (como o CNPJ).
    """
    empresa_identificadora = None
    if hasattr(instance_obj, 'cnpj_empresa') and instance_obj.cnpj_empresa:
        # Remove caracteres não alfanuméricos do CNPJ para usar como nome de pasta
        empresa_identificadora = re.sub(r'[^a-zA-Z0-9]', '', str(instance_obj.cnpj_empresa))
    elif hasattr(instance_obj, 'nome_empresa') and instance_obj.nome_empresa:
        # Usa o nome da empresa, removendo acentos e substituindo espaços e caracteres especiais
        nome_limpo = unidecode.unidecode(str(instance_obj.nome_empresa))
        empresa_identificadora = re.sub(r'\s+', '_', nome_limpo) # Substitui espaços por underscore
        empresa_identificadora = re.sub(r'[^\w-]', '', empresa_identificadora) # Remove outros caracteres não seguros
    
    if not empresa_identificadora: # Fallback
        logger.warning(f"Não foi possível gerar identificador de pasta para a instância: {instance_obj}")
        return "EMPRESA_DESCONHECIDA"
    return empresa_identificadora

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
    company_folder = get_company_folder_identifier(instance)
    clean_filename = sanitize_filename(filename)
    return os.path.join(company_folder, 'DOCUMENTOS CONSTITUTIVOS', clean_filename)

def outros_upload_path(instance, filename):
    company_folder = get_company_folder_identifier(instance)
    clean_filename = sanitize_filename(filename)
    return os.path.join(company_folder, 'OUTROS', clean_filename)

def timed_folder_upload_path(instance, filename, base_folder_name):
    company_folder = get_company_folder_identifier(instance)
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