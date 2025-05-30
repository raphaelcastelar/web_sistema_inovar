# sistema_inovar/empresas/urls.py
from django.urls import path
from .views import enviar_email

urlpatterns = [
    path('enviar-email/', enviar_email, name='enviar_email'),
]