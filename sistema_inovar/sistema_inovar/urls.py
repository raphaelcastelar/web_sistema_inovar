from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from empresas.views import EmpresaViewSet, DocumentosConstitutivosViewSet, XMLViewSet, DepartamentoPessoalViewSet, SimplesNacionalViewSet
from django.conf import settings
from django.conf.urls.static import static

router = routers.DefaultRouter()
router.register(r'empresas', EmpresaViewSet)
router.register(r'documentos-constitutivos', DocumentosConstitutivosViewSet)
router.register(r'xml', XMLViewSet)
router.register(r'departamento-pessoal', DepartamentoPessoalViewSet)
router.register(r'simples-nacional', SimplesNacionalViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)