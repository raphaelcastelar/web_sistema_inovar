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
)


@admin.register(PaginaSistema)
class PaginaSistemaAdmin(admin.ModelAdmin):
    list_display = ('nome', 'secao', 'rota', 'ativa', 'permite_admin', 'permite_fiscal', 'permite_pessoal')
    list_filter = ('ativa', 'secao', 'permite_admin', 'permite_fiscal', 'permite_pessoal')
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
        ('Configurações Pessoais', {'fields': ('theme',)}),
        ('Gerenciamento de Empresas', {'fields': ('empresas_gerenciadas',)}),
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
    readonly_fields = ('status_anterior', 'novo_status', 'alterado_em', 'alterado_por')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ('nome', 'cnpj', 'email', 'ativo', 'criado_em', 'desativado_em', 'monitorar_simples')
    search_fields = ('nome', 'cnpj')
    list_filter = ('ativo', 'monitorar_simples')
    filter_horizontal = ('tags',)
    readonly_fields = ('criado_em', 'desativado_em')
    inlines = (HistoricoStatusEmpresaInline,)


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
