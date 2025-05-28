from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from empresas.views import EmpresaViewSet

router = routers.DefaultRouter()
router.register(r'empresas', EmpresaViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
]