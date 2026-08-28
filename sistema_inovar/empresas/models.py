# models.py
import os
import re # Para sanitizar nomes de pastas/arquivos
import unidecode # Para remover acentos de nomes de pastas/arquivos (pip install unidecode)
from django.db import models, transaction
from django.contrib.postgres.indexes import GinIndex
from django.utils import timezone
from decimal import Decimal
import logging
from .utils import gerar_nome_pasta_empresa_padronizado, normalizar_nome_empresa
from django.contrib.auth.models import AbstractUser
from django.conf import settings


logger = logging.getLogger(__name__)

class Empresa(models.Model):
    REGIME_TRIBUTARIO_CHOICES = [
        ('SIMPLES NACIONAL', 'Simples Nacional'),
        ('LUCRO REAL', 'Lucro Real'),
        ('LUCRO PRESUMIDO', 'Lucro Presumido'),
        ('OUTROS', 'Outros'),
    ]
    PORTE_EMPRESA_CHOICES = [
        ('MEI', 'MEI'),
        ('ME', 'ME'),
        ('EPP', 'EPP'),
        ('MEDIO PORTE', 'Medio Porte'),
        ('GRANDE PORTE', 'Grande Porte'),
    ]
    CARTEIRA_CLIENTES_CHOICES = [
        ('INOVAR ES', 'Inovar ES'),
        ('INOVAR MG', 'Inovar MG'),
        ('NOVVA', 'Novva'),
    ]
    ANEXO_SIMPLES_CHOICES = [
        ('I', 'I'),
        ('II', 'II'),
        ('III', 'III'),
        ('IV', 'IV'),
        ('V', 'V'),
    ]

    id = models.AutoField(primary_key=True)
    nome = models.CharField(max_length=100, null=False)
    cnpj = models.CharField(max_length=18, unique=True, null=False)
    email = models.EmailField(max_length=255, blank=True, default='')
    telefone = models.CharField(max_length=20, null=True, blank=False)
    endereco = models.CharField(max_length=255, null=True, blank=True, help_text="Endereço completo da empresa")
    numero = models.CharField(max_length=20, null=True, blank=True, help_text="Numero do endereco da empresa")
    cep = models.CharField(max_length=9, null=True, blank=True, help_text="CEP sem hífen (ex.: 12345678)")
    cidade = models.CharField(max_length=100, null=True, blank=True, help_text="Cidade da empresa")
    bairro = models.CharField(max_length=100, null=True, blank=True, help_text="Bairro da empresa")
    uf = models.CharField(max_length=2, null=True, blank=True, help_text="UF da empresa (ex.: SP)")
    simples_nacional = models.BooleanField(default=False, null = True)
    regime_tributario = models.CharField(max_length=30, choices=REGIME_TRIBUTARIO_CHOICES, null=True, blank=True)
    porte_empresa = models.CharField(max_length=20, choices=PORTE_EMPRESA_CHOICES, null=True, blank=True)
    carteira_clientes = models.CharField(max_length=20, choices=CARTEIRA_CLIENTES_CHOICES, null=True, blank=True)
    grupo_atividade = models.JSONField(default=list, blank=True)
    anexo_simples = models.CharField(max_length=3, choices=ANEXO_SIMPLES_CHOICES, null=True, blank=True)
    inss = models.BooleanField(default=False, null=True)
    fgts = models.BooleanField(default=False, null=True)
    folha = models.BooleanField(default=False, null=True)
    honorario = models.BooleanField(default=False, null=True)
    monitorar_simples = models.BooleanField(default=True, null=True)
    usuarios = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name='empresas')
    tags = models.ManyToManyField('Tag', related_name='empresas', blank=True)
    ativo = models.BooleanField(default=True, null = True)
    criado_em = models.DateTimeField(auto_now_add=True)
    desativado_em = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        self.nome = normalizar_nome_empresa(self.nome)
        super().save(*args, **kwargs)

    # Configurações de Boleto
    valor_honorario = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, help_text="Valor do honorário para geração de boleto", null = True)
    dia_vencimento_honorario = models.IntegerField(default=15, help_text="Dia do vencimento do boleto (1-31)", null = True)
    juros_mora_taxa = models.DecimalField(max_digits=5, decimal_places=2, default=1.00, help_text="Taxa de juros mensal (%)", null = True)
    multa_taxa = models.DecimalField(max_digits=5, decimal_places=2, default=2.00, help_text="Taxa de multa (%)", null = True)
    desconto_taxa = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text="Taxa de desconto (%)", null = True)
    dias_para_desconto = models.IntegerField(default=0, help_text="Dias até o vencimento para aplicar desconto", null = True)

    def __str__(self):
        return self.nome

    class Meta:
        indexes = [
            models.Index(fields=['ativo', 'nome'], name='empresa_ativo_nome_idx'),
            models.Index(fields=['telefone'], name='empresa_telefone_idx'),
            models.Index(fields=['monitorar_simples'], name='empresa_monitorar_idx'),
            GinIndex(fields=['nome'], name='empresa_nome_trgm_idx', opclasses=['gin_trgm_ops']),
            GinIndex(fields=['cnpj'], name='empresa_cnpj_trgm_idx', opclasses=['gin_trgm_ops']),
            GinIndex(fields=['email'], name='empresa_email_trgm_idx', opclasses=['gin_trgm_ops']),
            GinIndex(fields=['telefone'], name='empresa_tel_trgm_idx', opclasses=['gin_trgm_ops']),
        ]

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        status_anterior = True
        if not is_new:
            status_anterior = type(self).objects.filter(pk=self.pk).values_list('ativo', flat=True).first()

        status_atual = self.ativo is not False
        status_anterior = status_anterior is not False
        status_alterado = status_anterior != status_atual
        alterado_em = timezone.now() if status_alterado else None

        if status_alterado:
            self.desativado_em = None if status_atual else alterado_em
            update_fields = kwargs.get('update_fields')
            if update_fields is not None:
                kwargs['update_fields'] = set(update_fields) | {'desativado_em'}

        with transaction.atomic():
            super().save(*args, **kwargs)
            if status_alterado:
                HistoricoStatusEmpresa.objects.create(
                    empresa=self,
                    status_anterior=status_anterior,
                    novo_status=status_atual,
                    alterado_em=alterado_em,
                    alterado_por=getattr(self, '_status_alterado_por', None),
                )
        if is_new:
            from .models import Funcionario, UserCompanyAccess
            funcionarios = Funcionario.objects.all()
            for funcionario in funcionarios:
                UserCompanyAccess.objects.get_or_create(
                    user=funcionario,
                    empresa=self,
                    defaults={'created_by': None}
                )
                funcionario.empresas_gerenciadas.add(self)
            logger.info(f"Empresa {self.nome} criada e atribuída a todos os funcionários.")


class HistoricoStatusEmpresa(models.Model):
    empresa = models.ForeignKey(
        Empresa,
        on_delete=models.CASCADE,
        related_name='historico_status',
    )
    status_anterior = models.BooleanField()
    novo_status = models.BooleanField()
    alterado_em = models.DateTimeField(default=timezone.now)
    alterado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='alteracoes_status_empresa',
    )

    class Meta:
        ordering = ['-alterado_em', '-id']
        indexes = [
            models.Index(fields=['empresa', '-alterado_em'], name='hist_status_empresa_data_idx'),
        ]


class Tag(models.Model):
    CARGO_CHOICES = [
        ('pessoal', 'Departamento Pessoal'),
        ('fiscal', 'Departamento Fiscal'),
        ('admin', 'Administrador'),
    ]

    nome = models.CharField(max_length=50)
    cor = models.CharField(max_length=7, default='#3B82F6')
    cargo = models.CharField(max_length=100, choices=CARGO_CHOICES)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tags'
        ordering = ['nome']
        constraints = [
            models.UniqueConstraint(fields=['nome', 'cargo'], name='unique_tag_nome_por_cargo'),
        ]
        indexes = [
            models.Index(fields=['cargo', 'nome'], name='tag_cargo_nome_idx'),
        ]

    def __str__(self):
        return self.nome


class EmpresaAvulsaFaturamento(models.Model):
    nome = models.CharField(max_length=255)
    cnpj = models.CharField(max_length=18, null=True, blank=True)
    inscricao_estadual = models.CharField(max_length=50, null=True, blank=True)
    endereco = models.CharField(max_length=255, null=True, blank=True)
    numero = models.CharField(max_length=20, null=True, blank=True)
    bairro = models.CharField(max_length=100, null=True, blank=True)
    cidade = models.CharField(max_length=100, null=True, blank=True)
    uf = models.CharField(max_length=2, null=True, blank=True)
    cep = models.CharField(max_length=9, null=True, blank=True)
    regime = models.CharField(max_length=50, default='Simples Nacional')
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'empresas_avulsas_faturamento'
        ordering = ['nome']
        indexes = [
            models.Index(fields=['nome'], name='emp_avulsa_nome_idx'),
        ]

    def __str__(self):
        return self.nome

class Socio(models.Model):
    empresa = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name='socios')
    nome = models.CharField(max_length=255)
    cpf = models.CharField(max_length=11)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'socios'
        ordering = ['nome']
        constraints = [
            models.UniqueConstraint(fields=['empresa', 'cpf'], name='unique_socio_cpf_por_empresa'),
        ]
        indexes = [
            models.Index(fields=['empresa', 'nome'], name='socio_empresa_nome_idx'),
        ]

    def __str__(self):
        return f"{self.nome} ({self.cpf}) - {self.empresa.nome}"


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
    return os.path.join(company_folder, 'CONSTITUTIVOS', 'OUTROS', clean_filename)

def outros_upload_path(instance, filename):
    company_folder = get_document_company_folder_name_for_upload(instance)
    reference_date = timezone.now()
    year = str(instance.ano or reference_date.year)
    month_for_folder = str(instance.mes or reference_date.month).zfill(2)
    month_year_folder = month_for_folder
    clean_filename = sanitize_filename(filename)
    return os.path.join(company_folder, 'FINANCEIRO', 'HONORARIOS MENSAIS', year, month_year_folder, clean_filename)

def timed_folder_upload_path(instance, filename, base_folder_name):
    company_folder = get_document_company_folder_name_for_upload(instance)
    year = str(instance.ano)
    # instance.mes deve ser o número do mês com dois dígitos (ex: "01", "12")
    month_for_folder = str(instance.mes).zfill(2) 
    clean_filename = sanitize_filename(filename)
    return os.path.join(company_folder, *base_folder_name, year, month_for_folder, clean_filename)

def departamento_pessoal_upload_path(instance, filename):
    return timed_folder_upload_path(instance, filename, ('PESSOAL', 'GUIAS'))

def simples_nacional_upload_path(instance, filename):
    return timed_folder_upload_path(instance, filename, ('FISCAL', 'GUIAS'))

def xml_upload_path(instance, filename):
    return timed_folder_upload_path(instance, filename, ('FISCAL', 'XML'))


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
        indexes = [
            models.Index(fields=['nome_empresa'], name='doc_const_nome_emp_idx'),
            models.Index(fields=['tipo_documento', 'nome_empresa'], name='doc_const_tipo_emp_idx'),
        ]

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

    class Meta:
        indexes = [
            models.Index(fields=['cnpj_empresa', 'ano', 'mes'], name='xml_cnpj_ano_mes_idx'),
            models.Index(fields=['tipo_documento', 'cnpj_empresa'], name='xml_tipo_cnpj_idx'),
        ]

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

    class Meta:
        indexes = [
            models.Index(fields=['cnpj_empresa', 'ano', 'mes'], name='dp_cnpj_ano_mes_idx'),
            models.Index(fields=['tipo_documento', 'cnpj_empresa'], name='dp_tipo_cnpj_idx'),
            models.Index(fields=['entregue', 'cnpj_empresa'], name='dp_entregue_cnpj_idx'),
        ]

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
        indexes = [
            models.Index(fields=['cnpj_empresa', 'ano', 'mes'], name='sn_cnpj_ano_mes_idx'),
            models.Index(fields=['tipo_documento', 'cnpj_empresa'], name='sn_tipo_cnpj_idx'),
            models.Index(fields=['entregue', 'cnpj_empresa'], name='sn_entregue_cnpj_idx'),
        ]

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
    cnpj_empresa = models.CharField(max_length=18, null=True, blank=True)
    tipo_documento = models.CharField(max_length=50) # Aumentado de 10 para 50 para consistência
    caminho_arquivo = models.FileField(upload_to=outros_upload_path, max_length=500) # ATUALIZADO
    mes = models.CharField(max_length=2, null=True, blank=True)
    ano = models.CharField(max_length=4, null=True, blank=True)

    class Meta:
        db_table = 'outros'
        indexes = [
            models.Index(fields=['nome_empresa', 'ano', 'mes'], name='outros_emp_ano_mes_idx'),
            models.Index(fields=['cnpj_empresa', 'ano', 'mes'], name='outros_cnpj_ano_mes_idx'),
            models.Index(fields=['tipo_documento', 'nome_empresa'], name='outros_tipo_emp_idx'),
        ]

    def __str__(self):
        return self.nome_arquivo
    
class HistoricoEnvios(models.Model):
    STATUS_CHOICES = [
        ('sucesso', 'Sucesso'),
        ('falha', 'Falha'),
    ]

    id = models.AutoField(primary_key=True)
    data_hora = models.DateTimeField(auto_now_add=True)
    remetente = models.CharField(max_length=20)  # Número para o qual foi enviado
    arquivo = models.CharField(max_length=255)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    message_id = models.CharField(max_length=255, null=True, blank=True)
    data_envio = models.DateTimeField(default=timezone.now, help_text="Data e hora do envio")
    usuario = models.ForeignKey(Funcionario, on_delete=models.SET_NULL, null=True, blank=True, related_name='historico_envios', help_text="Usuário que realizou o envio")
    erro = models.TextField(null=True, blank=True, help_text="Descrição do erro, se aplicável")
    empresa = models.ForeignKey(Empresa, on_delete=models.SET_NULL, null=True, blank=True, related_name='historico_envios', help_text="Empresa relacionada ao envio")

    class Meta:
        db_table = 'historico_envios'
        ordering = ['-data_hora']
        indexes = [
            models.Index(fields=['-data_hora'], name='hist_env_data_desc_idx'),
            models.Index(fields=['status', '-data_hora'], name='hist_env_status_data_idx'),
            models.Index(fields=['empresa', '-data_hora'], name='hist_env_emp_data_idx'),
            models.Index(fields=['usuario', '-data_hora'], name='hist_env_user_data_idx'),
            models.Index(fields=['remetente'], name='hist_env_remetente_idx'),
        ]

    def __str__(self):
        return f"Envio para {self.remetente} em {self.data_hora.strftime('%d/%m/%Y %H:%M')} - Status: {self.status}"

    def save(self, *args, **kwargs):
        # Normaliza o remetente, removendo o '+' para corresponder ao formato do telefone (ex.: 5528999270687)
        if self.remetente and self.remetente.startswith('+'):
            self.remetente = self.remetente.replace('+', '')  # Converte +5528999270687 para 5528999270687
        super().save(*args, **kwargs)

class WhatsAppMessage(models.Model):
    id = models.AutoField(primary_key=True)
    wamid = models.CharField(max_length=255, unique=True)
    to = models.CharField(max_length=20)
    message = models.TextField(blank=True)
    msg_type = models.CharField(max_length=32, default='text')
    timestamp = models.DateTimeField(help_text="Timestamp fornecido pela API do WhatsApp")
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'whatsapp_messages'
        indexes = [models.Index(fields=['timestamp']), models.Index(fields=['to'])]
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.to} - {self.wamid}"
    
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
        indexes = [
            models.Index(fields=['status', 'data_vencimento'], name='obrig_status_venc_idx'),
            models.Index(fields=['empresa', 'tipo', 'periodo_apuracao'], name='obrig_emp_tipo_period_idx'),
            models.Index(fields=['tipo', 'periodo_apuracao'], name='obrig_tipo_period_idx'),
        ]

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
        indexes = [
            models.Index(fields=['empresa', 'user'], name='usercomp_empresa_user_idx'),
        ]

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
        indexes = [
            models.Index(fields=['empresa', 'tipo'], name='pendencia_empresa_tipo_idx'),
            models.Index(fields=['-data_criacao'], name='pendencia_data_desc_idx'),
        ]

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
        indexes = [
            models.Index(fields=['destinatario', 'lida', '-timestamp'], name='notif_dest_lida_data_idx'),
            models.Index(fields=['destinatario', '-timestamp'], name='notif_dest_data_idx'),
        ]

    def __str__(self):
        return f"Notificação para {self.destinatario.username}: {self.mensagem}"


class UltimoResultadoSessao(models.Model):
    usuario = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='ultimo_resultado_sessao')
    batch_summary = models.JSONField(null=True, blank=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Último resultado de sessão'
        verbose_name_plural = 'Últimos resultados de sessão'

    def __str__(self):
        return f"Último resultado de {self.usuario.username}"


class BoletoBB(models.Model):
    STATUS_CHOICES = [
        ('registrado', 'Registrado'),
        ('pago', 'Pago'),
        ('baixado', 'Baixado'),
        ('cancelado', 'Cancelado'),
    ]

    empresa = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name='boletos_bb')
    numero_convenio = models.CharField(max_length=12)
    carteira = models.CharField(max_length=5, blank=True, null=True)
    variacao_carteira = models.CharField(max_length=5, blank=True, null=True)
    numero_operacao = models.CharField(max_length=30, null=True, blank=True, db_index=True)
    numero_titulo_cliente = models.CharField(max_length=30, unique=True)
    nosso_numero = models.CharField(max_length=30, db_index=True, null=True, blank=True)
    linha_digitavel = models.CharField(max_length=80, null=True, blank=True)
    codigo_barra = models.CharField(max_length=80, null=True, blank=True)
    valor_original = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    valor_pago = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    data_vencimento = models.DateField(null=True, blank=True)
    data_pagamento = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='registrado')
    payload_registro = models.JSONField(default=dict, blank=True)
    payload_baixa = models.JSONField(default=dict, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'boletos_bb'
        indexes = [
            models.Index(fields=['numero_titulo_cliente']),
            models.Index(fields=['nosso_numero']),
            models.Index(fields=['status', 'data_vencimento'], name='boleto_status_venc_idx'),
            models.Index(fields=['empresa', 'status'], name='boleto_empresa_status_idx'),
            models.Index(fields=['-atualizado_em', '-criado_em'], name='boleto_atual_criado_idx'),
        ]
        ordering = ['-criado_em']

    def __str__(self):
        return f"{self.numero_titulo_cliente} - {self.empresa.nome}"
