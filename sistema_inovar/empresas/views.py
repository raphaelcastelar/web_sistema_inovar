from rest_framework import viewsets
from .models import Empresa, DocumentosConstitutivos, XML, DepartamentoPessoal, SimplesNacional
from .serializers import EmpresaSerializer, DocumentosConstitutivosSerializer, XMLSerializer, DepartamentoPessoalSerializer, SimplesNacionalSerializer
import logging

logger = logging.getLogger(__name__)

class EmpresaViewSet(viewsets.ModelViewSet):
    queryset = Empresa.objects.all()
    serializer_class = EmpresaSerializer
    filterset_fields = ['nome', 'cnpj', 'email']

class DocumentosConstitutivosViewSet(viewsets.ModelViewSet):
    queryset = DocumentosConstitutivos.objects.all()
    serializer_class = DocumentosConstitutivosSerializer

    def create(self, request, *args, **kwargs):
        logger.info(f"Recebendo POST para DocumentosConstitutivos: {request.data}")
        return super().create(request, *args, **kwargs)

class XMLViewSet(viewsets.ModelViewSet):
    queryset = XML.objects.all()
    serializer_class = XMLSerializer

    def create(self, request, *args, **kwargs):
        logger.info(f"Recebendo POST para XML: {request.data}")
        return super().create(request, *args, **kwargs)

class DepartamentoPessoalViewSet(viewsets.ModelViewSet):
    queryset = DepartamentoPessoal.objects.all()
    serializer_class = DepartamentoPessoalSerializer

    def create(self, request, *args, **kwargs):
        logger.info(f"Recebendo POST para DepartamentoPessoal: {request.data}")
        return super().create(request, *args, **kwargs)

class SimplesNacionalViewSet(viewsets.ModelViewSet):
    queryset = SimplesNacional.objects.all()
    serializer_class = SimplesNacionalSerializer

    def create(self, request, *args, **kwargs):
        logger.info(f"Recebendo POST para SimplesNacional: {request.data}")
        return super().create(request, *args, **kwargs)