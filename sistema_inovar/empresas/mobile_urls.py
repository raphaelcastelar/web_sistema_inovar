from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .mobile_api import (
    ClientRequestsView, CompaniesView, CurrentUserView, DctfWebView,
    GuideActionView, GuideLimitsView, InstallmentsView, MobileDocumentsView,
    MobileTokenView, NotificationsView, SecureDocumentDownloadView,
)


def documents_view(source):
    return MobileDocumentsView.as_view(source=source)


def guide_view(action):
    return GuideActionView.as_view(action=action)


urlpatterns = [
    path('token/', MobileTokenView.as_view(), name='mobile-token'),
    path('token/refresh/', TokenRefreshView.as_view(), name='mobile-token-refresh'),
    path('current-user/', CurrentUserView.as_view()),
    path('empresas/', CompaniesView.as_view()),
    path('documentos-constitutivos/', documents_view('documentos-constitutivos')),
    path('departamento-pessoal/', documents_view('departamento-pessoal')),
    path('simples-nacional/', documents_view('simples-nacional')),
    path('xml/', documents_view('xml')),
    path('outros/', documents_view('outros')),
    path('files/<int:document_id>/', SecureDocumentDownloadView.as_view()),
    path('solicitacoes-clientes/', ClientRequestsView.as_view()),
    path('notifications/', NotificationsView.as_view()),
    path('notifications/<int:notification_id>/', NotificationsView.as_view()),
    path('serpro/limites-guias/', GuideLimitsView.as_view()),
    path('serpro/gerar-das/', guide_view('gerar_das')),
    path('serpro/recalcular-das/', guide_view('recalcular_das')),
    path('serpro/consultar-extrato/', guide_view('gerar_extrato')),
    path('dctfweb/', DctfWebView.as_view()),
    path('parcelamentos-simples/', InstallmentsView.as_view()),
]
