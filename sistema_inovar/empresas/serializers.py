from rest_framework import serializers
from .models import Empresa, DocumentosConstitutivos, XML, DepartamentoPessoal, SimplesNacional

class EmpresaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = '__all__'

class DocumentosConstitutivosSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentosConstitutivos
        fields = '__all__'

class XMLSerializer(serializers.ModelSerializer):
    class Meta:
        model = XML
        fields = '__all__'

class DepartamentoPessoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = DepartamentoPessoal
        fields = '__all__'

class SimplesNacionalSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimplesNacional
        fields = '__all__'