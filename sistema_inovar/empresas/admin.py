from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User
from .models import (
    Empresa, 
    EmpresaAvulsaFaturamento,
    Tag,
    Socio,
    Funcionario, 
    ObrigacaoMensal, 
    DocumentosConstitutivos, 
    DepartamentoPessoal, 
    XML, 
    SimplesNacional, 
    Outros, 
    HistoricoEnvios,
    HistoricoStatusEmpresa,
    PaginaSistema,
    Atividade,
    BlocoExecucao,
    SolicitacaoCliente,
    SimplesApiUsage,
    TipoDocumento,
    DocumentoEmpresa,
)


@admin.register(PaginaSistema)
class PaginaSistemaAdmin(admin.ModelAdmin):
    list_display = ('nome', 'secao', 'rota', 'ativa', 'permite_admin', 'permite_fiscal', 'permite_pessoal', 'permite_contabil')
    list_filter = ('ativa', 'secao', 'permite_admin', 'permite_fiscal', 'permite_pessoal', 'permite_contabil')
    search_fields = ('nome', 'rota', 'descricao')
    readonly_fields = ('chave', 'rota', 'secao', 'gerenciavel', 'ordem', 'atualizado_em', 'atualizado_por')


class BlocoExecucaoInline(admin.TabularInline):
    model = BlocoExecucao
    extra = 0


@admin.register(Atividade)
class AtividadeAdmin(admin.ModelAdmin):
    list_display = ('titulo', 'tipo', 'responsavel', 'empresa', 'data_planejada', 'prazo', 'estado', 'privada')
    list_filter = ('tipo', 'estado', 'prioridade', 'privada', 'frequencia')
    search_fields = ('titulo', 'descricao', 'empresa__nome', 'responsavel__username')
    autocomplete_fields = ('empresa', 'responsavel', 'autor', 'concluida_por')
    filter_horizontal = ('compartilhados',)
    inlines = (BlocoExecucaoInline,)

@admin.register(Funcionario)
class FuncionarioAdmin(UserAdmin):
    # Adiciona seus campos customizados ('theme' e 'empresas_gerenciadas') à tela de edição
    fieldsets = UserAdmin.fieldsets + (
        ('Configurações Pessoais', {'fields': ('theme', 'cargo')}),
        ('Gerenciamento de Empresas', {'fields': ('empresas_gerenciadas',)}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Acesso Inovar', {'fields': ('cargo', 'theme')}),
    )
    # Adiciona colunas extras na lista de funcionários
    list_display = ('username', 'email', 'first_name', 'last_name', 'is_staff', 'is_superuser')
    filter_horizontal = ('empresas_gerenciadas',)

    # --- LINHA ADICIONADA PARA A CORREÇÃO ---
    # Define os campos pelos quais o admin pode buscar um funcionário.
    # Isso habilita o 'autocomplete_fields' em outros modelos.
    search_fields = ('username', 'first_name', 'last_name', 'email')

class HistoricoStatusEmpresaInline(admin.TabularInline):
    model = HistoricoStatusEmpresa
    extra = 0
    can_delete = False
    readonly_fields = ('tipo', 'status_anterior', 'novo_status', 'alterado_em', 'alterado_por')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ('nome', 'cnpj', 'email', 'ativo', 'criado_em', 'desativado_em', 'monitorar_simples')
    search_fields = ('nome', 'cnpj')
    list_filter = ('ativo', 'monitorar_simples')
    filter_horizontal = ('tags', 'usuarios')
    readonly_fields = ('criado_em', 'desativado_em')
    inlines = (HistoricoStatusEmpresaInline,)


@admin.register(SolicitacaoCliente)
class SolicitacaoClienteAdmin(admin.ModelAdmin):
    list_display = ('empresa', 'tipo', 'assunto', 'status', 'criada_em')
    list_filter = ('tipo', 'status', 'criada_em')
    search_fields = ('empresa__nome', 'empresa__cnpj', 'assunto', 'mensagem')
    readonly_fields = ('empresa', 'usuario', 'tipo', 'assunto', 'mensagem', 'criada_em', 'atualizada_em')


@admin.register(SimplesApiUsage)
class SimplesApiUsageAdmin(admin.ModelAdmin):
    list_display = ('empresa', 'action', 'competencia', 'used_at')
    list_filter = ('action', 'used_at')
    search_fields = ('empresa__nome', 'empresa__cnpj', 'competencia')
    readonly_fields = ('empresa', 'usuario', 'action', 'period_key', 'competencia', 'used_at')


@admin.register(TipoDocumento)
class TipoDocumentoAdmin(admin.ModelAdmin):
    list_display = ('nome', 'codigo', 'categoria', 'folder_key', 'periodicidade', 'ativo')
    list_filter = ('categoria', 'periodicidade', 'ativo')
    search_fields = ('nome', 'codigo')


@admin.register(DocumentoEmpresa)
class DocumentoEmpresaAdmin(admin.ModelAdmin):
    list_display = ('nome_arquivo', 'empresa', 'tipo_documento', 'competencia', 'origem', 'visivel_no_app', 'status')
    list_filter = ('tipo_documento__categoria', 'tipo_documento', 'origem', 'visivel_no_app', 'status')
    search_fields = ('nome_arquivo', 'empresa__nome', 'empresa__cnpj', 'competencia')
    autocomplete_fields = ('empresa', 'tipo_documento', 'documento_anterior', 'gerado_por')
    readonly_fields = ('checksum_sha256', 'criado_em')


@admin.register(EmpresaAvulsaFaturamento)
class EmpresaAvulsaFaturamentoAdmin(admin.ModelAdmin):
    list_display = ('nome', 'cnpj', 'cidade', 'uf', 'regime', 'atualizado_em')
    search_fields = ('nome', 'cnpj', 'cidade')
    list_filter = ('regime', 'uf')


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('nome', 'cor', 'cargo', 'criado_em')
    search_fields = ('nome',)
    list_filter = ('cargo',)

@admin.register(Socio)
class SocioAdmin(admin.ModelAdmin):
    list_display = ('nome', 'cpf', 'empresa')
    search_fields = ('nome', 'cpf', 'empresa__nome', 'empresa__cnpj')
    list_filter = ('empresa',)

@admin.register(ObrigacaoMensal)
class ObrigacaoMensalAdmin(admin.ModelAdmin):
    list_display = ('empresa', 'tipo', 'periodo_apuracao', 'status', 'data_vencimento')
    search_fields = ('empresa__nome', 'empresa__cnpj')
    list_filter = ('status', 'tipo', 'periodo_apuracao')
    autocomplete_fields = ['empresa', 'responsavel_envio']


# --- Configuração para os modelos de Documentos ---
@admin.register(DocumentosConstitutivos)
class DocumentosConstitutivosAdmin(admin.ModelAdmin):
    list_display = ('nome_arquivo', 'nome_empresa')
    search_fields = ('nome_arquivo', 'nome_empresa')

@admin.register(DepartamentoPessoal)
class DepartamentoPessoalAdmin(admin.ModelAdmin):
    list_display = ('nome_arquivo', 'cnpj_empresa', 'ano', 'mes', 'entregue')
    search_fields = ('nome_arquivo', 'cnpj_empresa')
    list_filter = ('ano', 'mes', 'entregue')

@admin.register(XML)
class XMLAdmin(admin.ModelAdmin):
    list_display = ('nome_arquivo', 'cnpj_empresa', 'ano', 'mes')
    search_fields = ('nome_arquivo', 'cnpj_empresa')
    list_filter = ('ano', 'mes')

@admin.register(SimplesNacional)
class SimplesNacionalAdmin(admin.ModelAdmin):
    list_display = ('nome_arquivo', 'cnpj_empresa', 'ano', 'mes', 'entregue')
    search_fields = ('nome_arquivo', 'cnpj_empresa')
    list_filter = ('ano', 'mes', 'entregue')

@admin.register(Outros)
class OutrosAdmin(admin.ModelAdmin):
    list_display = ('nome_arquivo', 'nome_empresa')
    search_fields = ('nome_arquivo', 'nome_empresa')


# --- Configuração para o Histórico ---
@admin.register(HistoricoEnvios)
class HistoricoEnviosAdmin(admin.ModelAdmin):
    list_display = ('remetente', 'arquivo', 'status', 'data_hora')
    search_fields = ('remetente', 'arquivo')
    list_filter = ('status', 'data_hora')
    readonly_fields = ('data_hora',)


# --- Registro final do modelo Funcionario ---
# Modelos registrados com o decorador @admin.register não precisam ser registrados aqui

# 2. Registra o seu modelo Funcionario com a configuração personalizada
