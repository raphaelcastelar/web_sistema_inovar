from rest_framework import serializers
from .models import Empresa, DocumentosConstitutivos, XML, DepartamentoPessoal, SimplesNacional, Outros

class EmpresaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ['id', 'nome', 'cnpj', 'email', 'telefone']  # Adicionado 'telefone'

class DocumentosConstitutivosSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentosConstitutivos
        fields = ['id', 'nome_arquivo', 'nome_empresa', 'tipo_documento', 'caminho_arquivo']

class XMLSerializer(serializers.ModelSerializer):
    class Meta:
        model = XML
        fields = ['id', 'nome_arquivo', 'cnpj_empresa', 'tipo_documento', 'caminho_arquivo', 'mes', 'ano']

class DepartamentoPessoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = DepartamentoPessoal
        fields = ['id', 'nome_arquivo', 'cnpj_empresa', 'tipo_documento', 'caminho_arquivo', 'mes', 'ano', 'entregue']

class SimplesNacionalSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimplesNacional
        fields = ['id', 'nome_arquivo', 'cnpj_empresa', 'tipo_documento', 'caminho_arquivo', 'mes', 'ano', 'entregue']

class OutrosSerializer(serializers.ModelSerializer):
    class Meta:
        model = Outros
        fields = '__all__'