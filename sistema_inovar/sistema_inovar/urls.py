from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from empresas.views import EmpresaViewSet, PastaViewSet, ArquivoViewSet
from django.conf import settings
from django.conf.urls.static import static

router = routers.DefaultRouter()
router.register(r'empresas', EmpresaViewSet)
router.register(r'pastas', PastaViewSet)
router.register(r'arquivos', ArquivoViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)