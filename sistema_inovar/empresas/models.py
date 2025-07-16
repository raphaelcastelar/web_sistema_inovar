# models.py
import os
import re # Para sanitizar nomes de pastas/arquivos
import unidecode # Para remover acentos de nomes de pastas/arquivos (pip install unidecode)
from django.db import models
from django.utils import timezone
import logging
from .utils import gerar_nome_pasta_empresa_padronizado
from django.contrib.auth.models import AbstractUser
from django.conf import settings


logger = logging.getLogger(__name__)

class Empresa(models.Model):
    id = models.AutoField(primary_key=True)
    nome = models.CharField(max_length=100, null=False)
    cnpj = models.CharField(max_length=18, unique=True, null=False)
    email = models.CharField(max_length=255, null=False)
    telefone = models.CharField(max_length=15, null=True, blank=False)
    simples_nacional = models.BooleanField(default=False)
    inss = models.BooleanField(default=False)
    fgts = models.BooleanField(default=False)
    folha = models.BooleanField(default=False)
    honorario = models.BooleanField(default=False)
    monitorar_simples = models.BooleanField(default=True)
    usuarios = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name='empresas')
    

    def __str__(self):
        return self.nome
    
    def save(self, *args, **kwargs):
        is_new = self._state.adding  # Verifica se é uma nova empresa
        super().save(*args, **kwargs)  # Salva a empresa primeiro
        if is_new:
            # Atribuir a nova empresa a todos os funcionários
            from .models import Funcionario, UserCompanyAccess
            funcionarios = Funcionario.objects.all()
            for funcionario in funcionarios:
                # Adicionar ao UserCompanyAccess
                UserCompanyAccess.objects.get_or_create(
                    user=funcionario,
                    empresa=self,
                    defaults={'created_by': None}
                )
                # Adicionar ao empresas_gerenciadas
                funcionario.empresas_gerenciadas.add(self)
            logger.info(f"Empresa {self.nome} criada e atribuída a todos os funcionários.")

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

def sanitize_filename(filename):
    name, ext = os.path.splitext(filename)
    # Remove acentos e caracteres especiais do nome do arquivo, mantendo a extensão
    clean_name = unidecode.unidecode(name)
    clean_name = re.sub(r'\s+', '_', clean_name) # Substitui espaços por underscore
    clean_name = re.sub(r'[^\w-]', '', clean_name) # Remove outros caracteres não seguros
    return f"{clean_name}{ext}"

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


class Funcionario(AbstractUser):
    THEME_CHOICES = [
        ('light', 'Claro'),
        ('dark', 'Escuro'),
    ]
    CARGO_CHOICES = [
        ('pessoal', 'Departamento Pessoal'),
        ('fiscal', 'Departamento Fiscal'),
        ('admin', 'Administrador'),
    ]
    theme = models.CharField(max_length=10, choices=THEME_CHOICES, default='light')
    cargo = models.CharField(max_length=100, choices=CARGO_CHOICES, default='pessoal', blank=True)
    empresas_gerenciadas = models.ManyToManyField(
        'Empresa',
        blank=True,
        related_name='gerenciada_por'
    )

    class Meta:
        verbose_name = 'Funcionário'
        verbose_name_plural = 'Funcionários'

    def __str__(self):
        return self.get_full_name() or self.username

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        if not self.cargo:  # Garante que cargo não seja null
            self.cargo = 'pessoal'
        super().save(*args, **kwargs)
        if is_new:
            from .models import Empresa, UserCompanyAccess
            empresas = Empresa.objects.all()
            for empresa in empresas:
                UserCompanyAccess.objects.get_or_create(
                    user=self,
                    empresa=empresa,
                    defaults={'created_by': None}
                )
                self.empresas_gerenciadas.add(empresa)
            logger.info(f"Funcionário {self.username} criado e atribuído a todas as empresas.")

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

    data_envio = models.DateTimeField(default=timezone.now, help_text="Data e hora do envio")
    usuario = models.ForeignKey(Funcionario, on_delete=models.SET_NULL, null=True, blank=True, related_name='historico_envios', help_text="Usuário que realizou o envio")
    erro = models.TextField(null=True, blank=True, help_text="Descrição do erro, se aplicável")

    class Meta:
        # Define o nome da tabela explicitamente
        db_table = 'historico_envios'
        # Ordena os resultados mais recentes primeiro por padrão
        ordering = ['-data_hora']

    def __str__(self):
        return f"Envio para {self.remetente} em {self.data_hora.strftime('%d/%m/%Y %H:%M')} - Status: {self.status}"
    
class ObrigacaoMensal(models.Model):
    STATUS_CHOICES = [
        ('pendente', 'Pendente'),
        ('enviado', 'Enviado ao Cliente'),
        ('nao_aplicavel', 'Não Aplicável (Sem Débito)'),
        ('declarado', 'Declarado'),
        ('consultado', 'Consultado'),
    ]
    TIPO_OBRIGACAO_CHOICES = [
        ('simples_nacional', 'Simples Nacional (DAS)'),
    ]
    id = models.AutoField(primary_key=True)
    empresa = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name='obrigacoes')
    tipo = models.CharField(max_length=50, choices=TIPO_OBRIGACAO_CHOICES)
    periodo_apuracao = models.DateField()
    data_vencimento = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pendente')
    data_envio = models.DateTimeField(null=True, blank=True)
    responsavel_envio = models.ForeignKey('Funcionario', on_delete=models.SET_NULL, null=True, blank=True)
    numero_declaracao = models.CharField(max_length=255, null=True, blank=True)  # Novo campo

    class Meta:
        unique_together = ('empresa', 'tipo', 'periodo_apuracao')
        ordering = ['-periodo_apuracao', 'data_vencimento']

    def save(self, *args, **kwargs):
        if self.tipo == 'simples_nacional' and not self.data_vencimento:
            primeiro_dia = self.periodo_apuracao
            primeiro_dia_mes_seguinte = (primeiro_dia.replace(day=1) + timezone.timedelta(days=32)).replace(day=1)
            self.data_vencimento = primeiro_dia_mes_seguinte.replace(day=20)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_tipo_display()} - {self.empresa.nome} - {self.periodo_apuracao.strftime('%m/%Y')}"

class UserCompanyAccess(models.Model):
    user = models.ForeignKey(Funcionario, on_delete=models.CASCADE, related_name='usercompanyaccess')
    empresa = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name='usercompanyaccess')
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(Funcionario, null=True, on_delete=models.SET_NULL, related_name='created_accesses')
    class Meta:
        unique_together = ('user', 'empresa')

class Pendencia(models.Model):
    empresa = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name='pendencias')
    tipo = models.CharField(max_length=50, choices=[
        ('INSS', 'INSS'),
        ('FGTS', 'FGTS'),
        ('Folha', 'Folha'),
        ('Honorário', 'Honorário'),
        ('Simples Nacional', 'Simples Nacional'),
    ])
    data_criacao = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Pendência'
        verbose_name_plural = 'Pendências'

    def __str__(self):
        return f"{self.empresa.nome} - {self.tipo}"
    
class Notificacao(models.Model):
    # O destinatário da notificação. related_name permite fazer user.notificacoes.all()
    destinatario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notificacoes')
    mensagem = models.CharField(max_length=255)
    lida = models.BooleanField(default=False)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"Notificação para {self.destinatario.username}: {self.mensagem}"