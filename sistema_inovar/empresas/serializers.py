from rest_framework import serializers
from .models import Empresa, DocumentosConstitutivos, XML, DepartamentoPessoal, SimplesNacional, Outros
import re


class EmpresaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ['id', 'nome', 'cnpj', 'email', 'telefone']
        
    def validate_telefone(self, value):
        """
        Valida o campo telefone. Espera DDD (2 dígitos) + número (8 ou 9 dígitos).
        O 'value' aqui é o que foi enviado pelo frontend.
        """
        if not value: # Se, por algum motivo, um valor vazio passar pelas validações padrão do DRF
            raise serializers.ValidationError("O campo telefone é obrigatório.")

        # Remove todos os caracteres não numéricos (parênteses, espaços, traços)
        cleaned_value = re.sub(r'\D', '', str(value))

        # Verifica se o número limpo contém 10 ou 11 dígitos
        if not (cleaned_value.isdigit() and (len(cleaned_value) == 10 or len(cleaned_value) == 11)):
            raise serializers.ValidationError(
                "O telefone deve ser fornecido no formato DDD + Número (10 ou 11 dígitos numéricos). Ex: 22999998888 ou 2233334444."
            )
        
        # Retorna o número limpo (apenas DDD + Número) para ser usado nos métodos create/update
        return cleaned_value

    def _prefix_country_code(self, ddd_plus_number_str):
        """
        Adiciona o DDI '55' ao número de telefone.
        Espera que ddd_plus_number_str seja uma string de 10 ou 11 dígitos.
        """
        if ddd_plus_number_str: # Já deve ter sido validado por validate_telefone
            return '55' + ddd_plus_number_str
        return None # Não deve acontecer se o campo for obrigatório

    def create(self, validated_data):
        """
        Chamado ao criar uma nova Empresa.
        """
        telefone_ddd_num = validated_data.get('telefone') # Vem limpo de validate_telefone
        if telefone_ddd_num:
            validated_data['telefone'] = self._prefix_country_code(telefone_ddd_num)
        
        return super().create(validated_data)

    def update(self, instance, validated_data):
        """
        Chamado ao atualizar uma Empresa existente.
        """
        # Verifica se o campo 'telefone' foi incluído nos dados da requisição de atualização
        if 'telefone' in validated_data:
            telefone_ddd_num = validated_data.get('telefone') # Vem limpo de validate_telefone
            if telefone_ddd_num: # Se um novo valor (já validado como DDD+Num) foi fornecido
                validated_data['telefone'] = self._prefix_country_code(telefone_ddd_num)
            # Se telefone_ddd_num for None ou vazio e o campo fosse opcional, você trataria aqui.
            # Mas como tornamos obrigatório, validate_telefone não deve permitir isso.
        
        return super().update(instance, validated_data)

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