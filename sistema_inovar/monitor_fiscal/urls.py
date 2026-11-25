from django.urls import path

from . import views

urlpatterns = [
    path('permissoes/', views.minhas_permissoes, name='mf_permissoes'),
    path('painel/', views.painel_monitoramento, name='mf_painel'),
    path('dashboard/', views.dashboard, name='mf_dashboard'),

    path('empresas/', views.empresas_monitoradas, name='mf_empresas'),
    path('empresas/lote/', views.configuracao_lote, name='mf_configuracao_lote'),
    path('empresas/<int:empresa_id>/configuracao/', views.configuracao_empresa, name='mf_configuracao'),
    path('empresas/<int:empresa_id>/sincronizar/', views.sincronizar_empresa, name='mf_sincronizar'),
    path('sincronizar-lote/', views.sincronizar_lote, name='mf_sincronizar_lote'),
    path('controles/<int:controle_id>/consulta-pontual/', views.consulta_pontual, name='mf_consulta_pontual'),
    path('controles/<int:controle_id>/execucoes/', views.execucoes, name='mf_execucoes'),

    path('certificados/', views.certificados, name='mf_certificados'),
    path('certificados/<int:certificado_id>/vincular/', views.vincular_certificado, name='mf_certificado_vincular'),
    path('certificados/<int:certificado_id>/desativar/', views.desativar_certificado, name='mf_certificado_desativar'),

    path('documentos/', views.documentos, name='mf_documentos'),
    path('documentos/exportar/', views.exportar_documentos, name='mf_exportar'),
    path('documentos/<int:documento_id>/', views.documento_detalhe, name='mf_documento'),
    path('documentos/<int:documento_id>/xml/', views.documento_xml, name='mf_documento_xml'),
    path('documentos/<int:documento_id>/pdf/', views.documento_pdf, name='mf_documento_pdf'),
    path('documentos/<int:documento_id>/eventos/<int:evento_id>/xml/', views.evento_xml, name='mf_evento_xml'),
    path('documentos/<int:documento_id>/manifestar/', views.manifestar, name='mf_manifestar'),
    path('manifestacoes/', views.manifestacoes, name='mf_manifestacoes'),

    path('importacao/', views.importar, name='mf_importar'),
    path('pendencias-vinculo/', views.pendencias_vinculo, name='mf_pendencias'),
    path('pendencias-vinculo/<int:pendencia_id>/resolver/', views.resolver_pendencia, name='mf_pendencia_resolver'),

    path('relatorios/<slug:tipo>/', views.relatorio, name='mf_relatorio'),
    path('alertas/', views.alertas, name='mf_alertas'),
    path('alertas/preferencias/', views.preferencias_alerta, name='mf_alertas_preferencias'),
    path('alertas/<int:alerta_id>/', views.alerta_atualizar, name='mf_alerta'),
    path('auditoria/', views.ocorrencias, name='mf_auditoria'),
    path('auditoria/<int:ocorrencia_id>/', views.ocorrencia_atualizar, name='mf_auditoria_ocorrencia'),
    path('logs/', views.logs, name='mf_logs'),
]
