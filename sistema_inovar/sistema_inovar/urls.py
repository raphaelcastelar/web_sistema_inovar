from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from empresas.views import EmpresaViewSet, DocumentosConstitutivosViewSet, XMLViewSet, DepartamentoPessoalViewSet, SimplesNacionalViewSet, OutrosViewSet, enviar_email, HistoricoEnviosViewSet, FuncionarioViewSet, current_user, declarar_das_api, gerar_e_enviar_das
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

router = routers.DefaultRouter()
router.register(r'empresas', EmpresaViewSet, basename='empresas')
router.register(r'documentos-constitutivos', DocumentosConstitutivosViewSet)
router.register(r'xml', XMLViewSet)
router.register(r'departamento-pessoal', DepartamentoPessoalViewSet)
router.register(r'simples-nacional', SimplesNacionalViewSet)
router.register(r'outros', OutrosViewSet)
router.register(r'historico-envios', HistoricoEnviosViewSet, basename='historicoenvios')
router.register(r'funcionarios', FuncionarioViewSet, basename='funcionarios')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    path('api/', include('empresas.urls')),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/current-user/', current_user, name='current-user'),
    path('api/declarar-das/', declarar_das_api, name='declarar-das'),
    path('api/serpro/', include('empresas.urls')),
    
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)