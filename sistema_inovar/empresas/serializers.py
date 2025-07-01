from rest_framework import serializers
from .models import Empresa, DocumentosConstitutivos, XML, DepartamentoPessoal, SimplesNacional, Outros, HistoricoEnvios, Funcionario
import re
import logging

logger = logging.getLogger(__name__)

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
        fields = ['id', 'nome_arquivo', 'nome_empresa', 'cnpj_empresa', 'tipo_documento', 'caminho_arquivo', 'mes', 'ano']

class DepartamentoPessoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = DepartamentoPessoal
        fields = ['id', 'nome_arquivo', 'nome_empresa', 'cnpj_empresa', 'tipo_documento', 'caminho_arquivo', 'mes', 'ano', 'entregue']

class SimplesNacionalSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimplesNacional
        fields = ['id', 'nome_arquivo', 'nome_empresa', 'cnpj_empresa', 'tipo_documento', 'caminho_arquivo', 'mes', 'ano', 'entregue']

class OutrosSerializer(serializers.ModelSerializer):
    class Meta:
        model = Outros
        fields = '__all__'

class HistoricoEnviosSerializer(serializers.ModelSerializer):
    class Meta:
        model = HistoricoEnvios
        fields = '__all__'
        
class FuncionarioSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'})
    
    CARGO_CHOICES = [
        ('pessoal', 'Departamento Pessoal'),
        ('fiscal', 'Departamento Fiscal'),
        ('admin', 'Administrador'),
    ]

    class Meta:
        model = Funcionario
        fields = ['id', 'username', 'password', 'first_name', 'last_name', 'email', 'is_active', 'is_staff', 'is_superuser', 'theme', 'cargo']
        extra_kwargs = {'password': {'write_only': True}}

    def validate_cargo(self, value):
        if not value:  # Se cargo for vazio ou None, define um padrão
            return 'pessoal'
        if value not in dict(self.CARGO_CHOICES).keys():
            raise serializers.ValidationError("Cargo inválido. Escolha entre: 'pessoal', 'fiscal' ou 'admin'.")
        return value

    def create(self, validated_data):
        user = Funcionario.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            password=validated_data['password']
        )
        user.is_active = validated_data.get('is_active', True)
        user.is_staff = validated_data.get('is_staff', False)
        user.cargo = validated_data.get('cargo', 'pessoal')  # Garante valor padrão
        user.theme = validated_data.get('theme', 'light')
        user.save()
        return user

    def update(self, instance, validated_data):
        logger.info(f"Dados validados recebidos: {validated_data}")  # Log para depuração
        instance.username = validated_data.get('username', instance.username)
        instance.email = validated_data.get('email', instance.email)
        instance.first_name = validated_data.get('first_name', instance.first_name)
        instance.last_name = validated_data.get('last_name', instance.last_name)
        instance.is_active = validated_data.get('is_active', instance.is_active)
        instance.is_staff = validated_data.get('is_staff', instance.is_staff)
        instance.cargo = validated_data.get('cargo', instance.cargo or 'pessoal')
        instance.theme = validated_data.get('theme', instance.theme or 'light')
        password = validated_data.get('password')
        if password:
            instance.set_password(password)
        instance.save()
        logger.info(f"Usuário salvo com cargo: {instance.cargo}")  # Log para depuração
        return instance