from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import (
    Empresa, 
    Funcionario, 
    ObrigacaoMensal, 
    DocumentosConstitutivos, 
    DepartamentoPessoal, 
    XML, 
    SimplesNacional, 
    Outros, 
    HistoricoEnvios
)

# --- Configuração para o modelo customizado de Usuário (Funcionario) ---
class FuncionarioAdmin(UserAdmin):
    # Adiciona seus campos customizados à tela de edição do usuário no admin
    fieldsets = UserAdmin.fieldsets + (
        ('Campos Personalizados', {'fields': ('theme',)}),
        ('Gerenciamento de Empresas', {'fields': ('empresas_gerenciadas',)}),
    )
    # Adiciona campos ao list_display se quiser vê-los na lista de usuários
    list_display = ('username', 'email', 'first_name', 'last_name', 'is_staff')


# --- Configuração para o modelo Empresa ---
@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ('nome', 'cnpj', 'email', 'telefone', 'monitorar_simples')
    search_fields = ('nome', 'cnpj')
    list_filter = ('monitorar_simples',)


# --- Configuração para o modelo de Obrigações ---
@admin.register(ObrigacaoMensal)
class ObrigacaoMensalAdmin(admin.ModelAdmin):
    list_display = ('empresa', 'tipo', 'periodo_apuracao', 'status', 'data_vencimento', 'responsavel_envio')
    search_fields = ('empresa__nome', 'empresa__cnpj')
    list_filter = ('status', 'tipo', 'periodo_apuracao')
    autocomplete_fields = ['empresa', 'responsavel_envio'] # Facilita a busca


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
admin.site.register(Funcionario, FuncionarioAdmin)