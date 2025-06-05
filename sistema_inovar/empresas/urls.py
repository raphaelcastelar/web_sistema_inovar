# sistema_inovar/empresas/urls.py
from django.urls import path
from .views import (
    enviar_email, 
    enviar_documentos_whatsapp_api
)
urlpatterns = [
    path('enviar-email/', enviar_email, name='enviar_email'),
    path('enviar-documentos-whatsapp/', enviar_documentos_whatsapp_api, name='enviar_documentos_whatsapp'),
]