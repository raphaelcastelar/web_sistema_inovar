from rest_framework import serializers
from .models import Empresa, EmpresaAvulsaFaturamento, Tag, Socio, DocumentosConstitutivos, XML, DepartamentoPessoal, SimplesNacional, Outros, HistoricoEnvios, Funcionario, Pendencia, Notificacao, UltimoResultadoSessao, BoletoBB
import re
import logging

logger = logging.getLogger(__name__)


def visible_tags_for_request(request):
    queryset = Tag.objects.all()
    user = getattr(request, 'user', None)
    cargo = getattr(user, 'cargo', None)
    if cargo == 'admin':
        return queryset
    if not cargo:
        return queryset.none()
    return queryset.filter(cargo=cargo)


def unique_tags_by_name(tags):
    unique_tags = {}
    for tag in tags:
        key = str(tag.nome or '').strip().casefold()
        if key and key not in unique_tags:
            unique_tags[key] = tag
    return list(unique_tags.values())


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'nome', 'cor', 'cargo', 'criado_em']
        read_only_fields = ['id', 'cargo', 'criado_em']

    def validate_nome(self, value):
        nome = str(value or '').strip()
        if not nome:
            raise serializers.ValidationError("O nome da tag é obrigatório.")
        return nome

    def validate_cor(self, value):
        cor = str(value or '').strip()
        if not re.fullmatch(r'^#[0-9A-Fa-f]{6}$', cor):
            raise serializers.ValidationError("A cor da tag deve estar no formato hexadecimal. Ex: #10B981")
        return cor

    def validate(self, attrs):
        request = self.context.get('request')
        cargo = getattr(getattr(request, 'user', None), 'cargo', None)
        nome = attrs.get('nome', getattr(self.instance, 'nome', None))

        if nome and cargo:
            queryset = Tag.objects.filter(nome=nome)
            if cargo != 'admin':
                queryset = queryset.filter(cargo=cargo)
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)
            if queryset.exists():
                raise serializers.ValidationError({'nome': ['Já existe uma tag com esse nome para a sua função.']})

        return attrs


class SocioSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = Socio
        fields = ['id', 'nome', 'cpf']

    def validate_nome(self, value):
        nome = str(value or '').strip()
        if not nome:
            raise serializers.ValidationError("O nome do sócio é obrigatório.")
        return nome

    def validate_cpf(self, value):
        cleaned_value = re.sub(r'\D', '', str(value or ''))
        if len(cleaned_value) != 11:
            raise serializers.ValidationError("O CPF do sócio deve conter 11 dígitos numéricos.")
        return cleaned_value


class EmpresaSerializer(serializers.ModelSerializer):
    GRUPO_ATIVIDADE_CHOICES = {'SERVICO', 'COMERCIO', 'INDUSTRIA'}

    socios = SocioSerializer(many=True, required=False)
    tags = serializers.SerializerMethodField()
    tag_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Tag.objects.all(),
        required=False,
        source='tags',
        write_only=True,
    )

    class Meta:
        model = Empresa
        fields = ['id', 'nome', 'cnpj', 'email', 'telefone', 'endereco', 'numero', 'cep', 'cidade', 'bairro', 'uf', 'simples_nacional', 'regime_tributario', 'porte_empresa', 'carteira_clientes', 'grupo_atividade', 'anexo_simples', 'inss', 'fgts', 'folha', 'honorario', 'monitorar_simples', 'usuarios', 'ativo', 'valor_honorario', 'dia_vencimento_honorario', 'juros_mora_taxa', 'multa_taxa', 'desconto_taxa', 'dias_para_desconto', 'socios', 'tags', 'tag_ids']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        self.fields['tag_ids'].queryset = visible_tags_for_request(request)

    def get_tags(self, obj):
        request = self.context.get('request')
        visible_tag_ids = visible_tags_for_request(request).values_list('id', flat=True)
        tags = obj.tags.filter(id__in=visible_tag_ids).order_by('nome', 'cargo', 'id')
        if getattr(getattr(request, 'user', None), 'cargo', None) == 'admin':
            tags = unique_tags_by_name(tags)
        return TagSerializer(tags, many=True, context=self.context).data

    def validate_grupo_atividade(self, value):
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Grupo de atividade deve ser uma lista.")

        grupos = []
        for item in value:
            grupo = str(item or '').strip().upper()
            if grupo not in self.GRUPO_ATIVIDADE_CHOICES:
                raise serializers.ValidationError("Grupo de atividade inválido.")
            if grupo not in grupos:
                grupos.append(grupo)

        return grupos

    def _sync_socios(self, empresa, socios_data):
        socios_data = socios_data or []
        existing_socios = {socio.id: socio for socio in empresa.socios.all()}
        kept_ids = set()
        cpfs_payload = set()

        for socio_data in socios_data:
            socio_id = socio_data.get('id')
            nome = socio_data.get('nome')
            cpf = socio_data.get('cpf')

            if cpf in cpfs_payload:
                raise serializers.ValidationError({'socios': ['Não é permitido repetir CPF entre os sócios da mesma empresa.']})
            cpfs_payload.add(cpf)

            if socio_id:
                socio = existing_socios.get(socio_id)
                if not socio:
                    raise serializers.ValidationError({'socios': [f'Sócio id={socio_id} não pertence à empresa informada.']})
                socio.nome = nome
                socio.cpf = cpf
                socio.save(update_fields=['nome', 'cpf', 'atualizado_em'])
                kept_ids.add(socio.id)
            else:
                novo_socio = Socio.objects.create(empresa=empresa, nome=nome, cpf=cpf)
                kept_ids.add(novo_socio.id)

        for socio_id, socio in existing_socios.items():
            if socio_id not in kept_ids:
                socio.delete()
        
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
        socios_data = validated_data.pop('socios', [])
        telefone_ddd_num = validated_data.get('telefone') # Vem limpo de validate_telefone
        if telefone_ddd_num:
            validated_data['telefone'] = self._prefix_country_code(telefone_ddd_num)

        empresa = super().create(validated_data)
        self._sync_socios(empresa, socios_data)
        return empresa

    def update(self, instance, validated_data):
        """
        Chamado ao atualizar uma Empresa existente.
        """
        socios_data = validated_data.pop('socios', None)
        # Verifica se o campo 'telefone' foi incluído nos dados da requisição de atualização
        if 'telefone' in validated_data:
            telefone_ddd_num = validated_data.get('telefone') # Vem limpo de validate_telefone
            if telefone_ddd_num: # Se um novo valor (já validado como DDD+Num) foi fornecido
                validated_data['telefone'] = self._prefix_country_code(telefone_ddd_num)
            # Se telefone_ddd_num for None ou vazio e o campo fosse opcional, você trataria aqui.
            # Mas como tornamos obrigatório, validate_telefone não deve permitir isso.

        instance = super().update(instance, validated_data)
        if socios_data is not None:
            self._sync_socios(instance, socios_data)
        return instance


class EmpresaAvulsaFaturamentoSerializer(serializers.ModelSerializer):
    inscricaoEstadual = serializers.CharField(source='inscricao_estadual', required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = EmpresaAvulsaFaturamento
        fields = [
            'id',
            'nome',
            'cnpj',
            'inscricaoEstadual',
            'endereco',
            'numero',
            'bairro',
            'cidade',
            'uf',
            'cep',
            'regime',
            'criado_em',
            'atualizado_em',
        ]
        read_only_fields = ['id', 'criado_em', 'atualizado_em']

    def validate_nome(self, value):
        nome = str(value or '').strip()
        if not nome:
            raise serializers.ValidationError("O nome da empresa avulsa é obrigatório.")
        return nome

    def validate_uf(self, value):
        if value in (None, ''):
            return value
        return str(value).strip().upper()[:2]

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

# serializers.py
class HistoricoEnviosSerializer(serializers.ModelSerializer):
    nome_empresa = serializers.CharField(source='empresa.nome', read_only=True)

    class Meta:
        model = HistoricoEnvios
        fields = '__all__'

    def create(self, validated_data):
        remetente = validated_data.get('remetente', '')
        normalized_remetente = remetente.replace('+', '') if remetente.startswith('+') else remetente
        validated_data['remetente'] = normalized_remetente
        empresas = Empresa.objects.filter(telefone=normalized_remetente)
        empresa = empresas.first() if empresas.count() == 1 else None

        if empresas.count() > 1:
            logger.warning(
                f"Telefone {normalized_remetente} está associado a múltiplas empresas. "
                "O histórico não vai inferir automaticamente a empresa."
            )

        if empresa and 'empresa' not in validated_data:
            validated_data['empresa'] = empresa

        instance = super().create(validated_data)
        if not instance.empresa_id and empresa:
            instance.empresa = empresa
            instance.save()
        return instance

    def update(self, instance, validated_data):
        remetente = validated_data.get('remetente', instance.remetente)
        normalized_remetente = remetente.replace('+', '') if remetente.startswith('+') else remetente
        validated_data['remetente'] = normalized_remetente

        empresas = Empresa.objects.filter(telefone=normalized_remetente)
        empresa = empresas.first() if empresas.count() == 1 else None

        if empresas.count() > 1:
            logger.warning(
                f"Telefone {normalized_remetente} está associado a múltiplas empresas. "
                "O histórico não vai inferir automaticamente a empresa na atualização."
            )

        if empresa and 'empresa' not in validated_data:
            validated_data['empresa'] = empresa
        return super().update(instance, validated_data)
        
class FuncionarioSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'})
    empresas_gerenciadas = serializers.PrimaryKeyRelatedField(many=True, queryset=Empresa.objects.all(), required=False)

    CARGO_CHOICES = [
        ('pessoal', 'Departamento Pessoal'),
        ('fiscal', 'Departamento Fiscal'),
        ('admin', 'Administrador'),
    ]

    class Meta:
        model = Funcionario
        fields = ['id', 'username', 'password', 'first_name', 'last_name', 'email', 'is_active', 'is_staff', 'is_superuser', 'theme', 'cargo', 'empresas_gerenciadas']
        extra_kwargs = {'password': {'write_only': True}}

    def validate_cargo(self, value):
        if not value:
            return 'pessoal'
        if value not in dict(self.CARGO_CHOICES).keys():
            raise serializers.ValidationError("Cargo inválido. Escolha entre: 'pessoal', 'fiscal' ou 'admin'.")
        return value

    def create(self, validated_data):
        empresas_gerenciadas = validated_data.pop('empresas_gerenciadas', [])
        user = Funcionario.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            password=validated_data['password']
        )
        user.is_active = validated_data.get('is_active', True)
        user.is_staff = validated_data.get('is_staff', False)
        user.cargo = validated_data.get('cargo', 'pessoal')
        user.theme = validated_data.get('theme', 'light')
        user.empresas_gerenciadas.set(empresas_gerenciadas)
        user.save()
        return user

    def update(self, instance, validated_data):
        logger.info(f"Dados validados recebidos: {validated_data}")
        empresas_gerenciadas = validated_data.pop('empresas_gerenciadas', None)
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
        if empresas_gerenciadas is not None:
            instance.empresas_gerenciadas.set(empresas_gerenciadas)
        instance.save()
        logger.info(f"Usuário salvo com cargo: {instance.cargo}")
        return instance
    
class PendenciaSerializer(serializers.ModelSerializer):
    empresa = EmpresaSerializer(read_only=True)
    
    class Meta:
        model = Pendencia
        fields = ['id', 'empresa', 'tipo', 'data_criacao']

class NotificacaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notificacao
        fields = ['id', 'destinatario', 'mensagem', 'lida', 'timestamp']


class UltimoResultadoSessaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = UltimoResultadoSessao
        fields = ['batch_summary', 'atualizado_em']


class BoletoBBSerializer(serializers.ModelSerializer):
    empresa_nome = serializers.CharField(source='empresa.nome', read_only=True)

    class Meta:
        model = BoletoBB
        fields = [
            'id', 'empresa', 'empresa_nome', 'numero_convenio', 'carteira', 'variacao_carteira',
            'numero_operacao', 'numero_titulo_cliente', 'nosso_numero',
            'linha_digitavel', 'codigo_barra', 'valor_original', 'valor_pago',
            'data_vencimento', 'data_pagamento', 'status',
            'payload_registro', 'payload_baixa',
            'criado_em', 'atualizado_em',
        ]
