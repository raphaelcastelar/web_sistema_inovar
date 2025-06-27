from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User
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

# --- Configurações para os outros modelos (sem alterações) ---
@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ('nome', 'cnpj', 'email', 'telefone', 'monitorar_simples')
    search_fields = ('nome', 'cnpj')
    list_filter = ('monitorar_simples',)

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


