from django.contrib import admin

from .models import (
    AlertaFiscal, CertificadoDigital, ConfiguracaoMonitorFiscal, ControleSincronizacao, DocumentoFiscal,
    EventoFiscal, Manifestacao, OcorrenciaAuditoria, RegistroAuditoria,
)


@admin.register(CertificadoDigital)
class CertificadoDigitalAdmin(admin.ModelAdmin):
    list_display = ('titular', 'cnpj', 'valido_ate', 'ativo')
    search_fields = ('titular', 'cnpj')
    # Campos cifrados nunca aparecem no admin.
    exclude = ('arquivo_cifrado', 'senha_cifrada')
    readonly_fields = [f.name for f in CertificadoDigital._meta.fields if f.name not in ('arquivo_cifrado', 'senha_cifrada', 'ativo')]

    def has_add_permission(self, request):
        return False  # cadastro somente pela API, que valida e cifra o arquivo


@admin.register(ConfiguracaoMonitorFiscal)
class ConfiguracaoAdmin(admin.ModelAdmin):
    list_display = ('empresa', 'ativo', 'ambiente', 'certificado', 'ciencia_automatica')
    list_filter = ('ativo', 'ambiente', 'ciencia_automatica')
    search_fields = ('empresa__nome', 'empresa__cnpj')


@admin.register(ControleSincronizacao)
class ControleAdmin(admin.ModelAdmin):
    list_display = ('empresa', 'fonte', 'ambiente', 'ult_nsu', 'max_nsu', 'situacao', 'proxima_consulta_em', 'bloqueado_ate')
    list_filter = ('fonte', 'ambiente', 'situacao')
    search_fields = ('empresa__nome', 'cnpj_consultado')
    readonly_fields = ('ult_nsu', 'max_nsu', 'executando_desde', 'execucao_token')


@admin.register(DocumentoFiscal)
class DocumentoAdmin(admin.ModelAdmin):
    list_display = ('empresa', 'tipo_documento', 'numero', 'emitente_nome', 'data_emissao', 'valor_total', 'situacao_fiscal', 'situacao_xml')
    list_filter = ('tipo_documento', 'ambiente', 'situacao_fiscal', 'situacao_xml', 'classificacao')
    search_fields = ('chave', 'numero', 'emitente_nome', 'emitente_documento')
    readonly_fields = ('xml_resumo', 'xml_completo', 'hash_xml')


admin.site.register(EventoFiscal)
admin.site.register(Manifestacao)
admin.site.register(AlertaFiscal)
admin.site.register(OcorrenciaAuditoria)


@admin.register(RegistroAuditoria)
class RegistroAuditoriaAdmin(admin.ModelAdmin):
    list_display = ('criado_em', 'usuario', 'empresa', 'operacao', 'resultado')
    list_filter = ('operacao', 'resultado')

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
