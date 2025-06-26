from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from empresas.views import (
    EmpresaViewSet, DocumentosConstitutivosViewSet, XMLViewSet,
    DepartamentoPessoalViewSet, SimplesNacionalViewSet, OutrosViewSet,
    HistoricoEnviosViewSet, FuncionarioViewSet, UserCompanyAccessViewSet,
    CurrentUserView
)
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

router = routers.DefaultRouter()
router.register(r'empresas', EmpresaViewSet, basename='empresas')
router.register(r'documentos-constitutivos', DocumentosConstitutivosViewSet, basename='documentos-constitutivos')
router.register(r'xml', XMLViewSet, basename='xml')
router.register(r'departamento-pessoal', DepartamentoPessoalViewSet, basename='departamento-pessoal')
router.register(r'simples-nacional', SimplesNacionalViewSet, basename='simples-nacional')
router.register(r'outros', OutrosViewSet, basename='outros')
router.register(r'historico-envios', HistoricoEnviosViewSet, basename='historicoenvios')
router.register(r'funcionarios', FuncionarioViewSet, basename='funcionarios')
# Removido o registro duplicado de user-company-access
# router.register(r'user-company-access', UserCompanyAccessViewSet, basename='user-company-access')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('empresas.urls')),  # Inclui todas as rotas de empresas/urls.py
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/', include(router.urls)),  # Inclui as rotas do router
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)