from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    enviar_email, 
    enviar_documentos_whatsapp_api,
    sincronizar_pasta_empresa_api,
    gerar_das_api,
    consultar_extrato_api,
    download_extrato_pdf_api,
    dashboard_summary_api,
    gerenciamento_simples_api,
    toggle_monitoramento_simples,
    CurrentUserView,
    UserCompanyAccessViewSet,
)

# Router apenas para rotas específicas
router = DefaultRouter()
router.register(r'user-company-access', UserCompanyAccessViewSet, basename='user-company-access')

urlpatterns = [
    path('enviar-email/', enviar_email, name='enviar_email'),
    path('enviar-documentos-whatsapp/', enviar_documentos_whatsapp_api, name='enviar_documentos_whatsapp'),
    path('sincronizar-pasta/', sincronizar_pasta_empresa_api, name='sincronizar_pasta_empresa'),
    path('serpro/gerar-das/', gerar_das_api, name='gerar_das_api'),
    path('serpro/consultar-extrato/', consultar_extrato_api, name='consultar_extrato_api'),
    path('serpro/download-extrato-pdf/', download_extrato_pdf_api, name='download_extrato_pdf_api'),
    path('dashboard-summary/', dashboard_summary_api, name='dashboard_summary_api'),
    path('gerenciamento-simples/', gerenciamento_simples_api, name='gerenciamento_simples'),
    path('empresas/<int:empresa_id>/toggle-monitoramento-simples/', toggle_monitoramento_simples, name='toggle_monitoramento_simples'),
    path('current-user/', CurrentUserView.as_view(), name='current-user'),
    path('', include(router.urls)),  # Inclui as rotas do router (ex.: /user-company-access/, /user-company-access/assign/, /user-company-access/remove/)
]