from rest_framework import viewsets
from .models import Empresa, Pasta, Arquivo
from .serializers import EmpresaSerializer, PastaSerializer, ArquivoSerializer

class EmpresaViewSet(viewsets.ModelViewSet):
    queryset = Empresa.objects.all()
    serializer_class = EmpresaSerializer
    filterset_fields = ['nome', 'cnpj', 'email', 'telefone']

class PastaViewSet(viewsets.ModelViewSet):
    queryset = Pasta.objects.all()
    serializer_class = PastaSerializer

class ArquivoViewSet(viewsets.ModelViewSet):
    queryset = Arquivo.objects.all()
    serializer_class = ArquivoSerializer