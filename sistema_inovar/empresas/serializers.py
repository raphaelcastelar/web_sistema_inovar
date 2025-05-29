from rest_framework import serializers
from .models import Empresa, Pasta, Arquivo

class ArquivoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Arquivo
        fields = '__all__'

class PastaSerializer(serializers.ModelSerializer):
    arquivos = ArquivoSerializer(many=True, read_only=True)

    class Meta:
        model = Pasta
        fields = '__all__'

class EmpresaSerializer(serializers.ModelSerializer):
    pastas = PastaSerializer(many=True, read_only=True)

    class Meta:
        model = Empresa
        fields = '__all__'