# sistema_inovar/empresas/urls.py
from django.urls import path
from .views import (
    enviar_email, 
    enviar_documentos_whatsapp_api,
    sincronizar_pasta_empresa_api,
    gerar_das_api,
    consultar_extrato_api,
    download_extrato_pdf_api,

)
urlpatterns = [
    path('enviar-email/', enviar_email, name='enviar_email'),
    path('enviar-documentos-whatsapp/', enviar_documentos_whatsapp_api, name='enviar_documentos_whatsapp'),
    path('sincronizar-pasta/', sincronizar_pasta_empresa_api, name='sincronizar_pasta_empresa'),
    path('serpro/gerar-das/', gerar_das_api, name='gerar_das_api'),
    path('serpro/consultar-extrato/', consultar_extrato_api, name='consultar_extrato_api'),
    path('serpro/download-extrato-pdf/', download_extrato_pdf_api, name='download_extrato_pdf_api'),
]