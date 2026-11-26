from rest_framework import serializers

from . import constantes as c
from .models import (
    AlertaFiscal, CertificadoDigital, ConfiguracaoMonitorFiscal, ControleSincronizacao, DocumentoFiscal,
    EventoFiscal, ExecucaoSincronizacao, ImportacaoManual, ItemDocumentoFiscal, Manifestacao, OcorrenciaAuditoria,
    PendenciaVinculo, RegistroAuditoria,
)
from .permissoes import tem_permissao


class CertificadoSerializer(serializers.ModelSerializer):
    """Nunca expõe arquivo, senha ou chave privada."""

    vencido = serializers.BooleanField(read_only=True)
    dias_para_vencer = serializers.IntegerField(read_only=True)
    empresas = serializers.SerializerMethodField()

    class Meta:
        model = CertificadoDigital
        fields = [
            'id', 'titular', 'cnpj', 'cpf', 'emissor', 'numero_serie', 'fingerprint_sha256', 'valido_de',
            'valido_ate', 'autenticacao_cliente', 'cadeia_icp_brasil', 'alertas_validacao', 'nome_arquivo',
            'ativo', 'substituido_por', 'criado_em', 'vencido', 'dias_para_vencer', 'empresas',
        ]

    def get_empresas(self, obj):
        return [{'id': cfg.empresa_id, 'nome': cfg.empresa.nome} for cfg in obj.configuracoes.select_related('empresa')]


class ControleSerializer(serializers.ModelSerializer):
    fonte_display = serializers.CharField(source='get_fonte_display', read_only=True)
    situacao_display = serializers.CharField(source='get_situacao_display', read_only=True)

    class Meta:
        model = ControleSincronizacao
        exclude = ['execucao_token']


class ConfiguracaoSerializer(serializers.ModelSerializer):
    certificado_info = serializers.SerializerMethodField()

    class Meta:
        model = ConfiguracaoMonitorFiscal
        fields = [
            'id', 'empresa', 'ativo', 'ambiente', 'data_inicio', 'certificado', 'certificado_info',
            'inscricao_estadual', 'inscricao_municipal', 'codigo_ibge_municipio', 'codigo_uf',
            'monitorar_nfe', 'monitorar_nfse', 'monitorar_cte', 'monitorar_mdfe', 'monitorar_eventos',
            'ciencia_automatica', 'ciencia_autorizada_por', 'ciencia_autorizada_em', 'ciencia_autorizacao_descricao',
            'alertas_fiscais', 'alertas_certificado', 'dias_alerta_certificado', 'atualizado_em',
        ]
        read_only_fields = ['empresa', 'ciencia_autorizada_por', 'ciencia_autorizada_em', 'atualizado_em']

    def get_certificado_info(self, obj):
        cert = obj.certificado
        if not cert:
            return None
        return {'id': cert.pk, 'titular': cert.titular, 'cnpj': cert.cnpj, 'valido_ate': cert.valido_ate,
                'vencido': cert.vencido, 'dias_para_vencer': cert.dias_para_vencer}

    def validate_dias_alerta_certificado(self, valor):
        if not isinstance(valor, list) or not all(isinstance(v, int) and 0 < v <= 365 for v in valor):
            raise serializers.ValidationError('Informe uma lista de dias entre 1 e 365.')
        return sorted(set(valor), reverse=True)

    def validate_ambiente(self, valor):
        from .ambiente import ambiente_permitido, mensagem_bloqueio
        if not ambiente_permitido(valor):
            raise serializers.ValidationError(mensagem_bloqueio(valor))
        return valor

    def validate_codigo_uf(self, valor):
        if valor and (not valor.isdigit() or len(valor) != 2):
            raise serializers.ValidationError('Código IBGE da UF com 2 dígitos.')
        return valor


class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemDocumentoFiscal
        exclude = ['documento']


class EventoSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventoFiscal
        exclude = ['xml', 'resposta_servico']


class ManifestacaoSerializer(serializers.ModelSerializer):
    tipo_evento_display = serializers.SerializerMethodField()
    solicitado_por_nome = serializers.SerializerMethodField()

    class Meta:
        model = Manifestacao
        exclude = ['xml_enviado', 'xml_retorno', 'xml_processado']

    def get_tipo_evento_display(self, obj):
        return c.EVENTOS_NFE.get(obj.tipo_evento, obj.tipo_evento)

    def get_solicitado_por_nome(self, obj):
        if obj.automatica:
            return 'Automação (ciência automática)'
        return str(obj.solicitado_por) if obj.solicitado_por else ''


class DocumentoListaSerializer(serializers.ModelSerializer):
    empresa_nome = serializers.CharField(source='empresa.nome', read_only=True)
    tipo_documento_display = serializers.CharField(source='get_tipo_documento_display', read_only=True)
    classificacao_display = serializers.CharField(source='get_classificacao_display', read_only=True)
    situacao_fiscal_display = serializers.CharField(source='get_situacao_fiscal_display', read_only=True)
    situacao_xml_display = serializers.CharField(source='get_situacao_xml_display', read_only=True)
    situacao_manifestacao_display = serializers.CharField(source='get_situacao_manifestacao_display', read_only=True)
    situacao_conferencia_display = serializers.CharField(source='get_situacao_conferencia_display', read_only=True)

    class Meta:
        model = DocumentoFiscal
        fields = [
            'id', 'empresa', 'empresa_nome', 'tipo_documento', 'tipo_documento_display', 'modelo', 'ambiente',
            'chave', 'numero', 'serie', 'data_emissao', 'competencia', 'capturado_em', 'emitente_documento',
            'emitente_nome', 'destinatario_documento', 'destinatario_nome', 'valor_total', 'classificacao',
            'classificacao_display', 'situacao_fiscal', 'situacao_fiscal_display', 'situacao_xml',
            'situacao_xml_display', 'situacao_manifestacao', 'situacao_manifestacao_display',
            'situacao_conferencia', 'situacao_conferencia_display', 'fontes', 'municipio_nome', 'uf',
        ]


class DocumentoDetalheSerializer(DocumentoListaSerializer):
    itens = ItemSerializer(many=True, read_only=True)
    eventos = EventoSerializer(many=True, read_only=True)
    manifestacoes = ManifestacaoSerializer(many=True, read_only=True)
    recebimentos = serializers.SerializerMethodField()
    informacoes_indisponiveis = serializers.SerializerMethodField()

    class Meta(DocumentoListaSerializer.Meta):
        fields = DocumentoListaSerializer.Meta.fields + [
            'emitente_ie', 'participantes', 'municipio_codigo', 'tipo_operacao', 'data_autorizacao', 'protocolo',
            'valores_tributarios', 'dados', 'observacao_interna', 'hash_xml', 'schema', 'versao_leiaute',
            'substituido_por', 'chave_substituta', 'atualizado_em', 'itens', 'eventos', 'manifestacoes',
            'recebimentos', 'informacoes_indisponiveis',
        ]

    def get_recebimentos(self, obj):
        return [
            {'fonte': r.get_fonte_display(), 'nsu': r.nsu, 'tipo_conteudo': r.get_tipo_conteudo_display(),
             'recebido_em': r.recebido_em, 'processado': r.processado, 'erro': r.erro}
            for r in obj.recebimentos.all()[:100]
        ]

    def get_informacoes_indisponiveis(self, obj):
        if obj.situacao_xml != 'resumo':
            return []
        return ['Destinatário', 'Produtos e serviços', 'Tributos detalhados', 'Transporte',
                'Informações adicionais', 'Documentos relacionados']

    def to_representation(self, instance):
        dados = super().to_representation(instance)
        request = self.context.get('request')
        if request and not tem_permissao(request.user, 'visualizar_tributos'):
            dados['valores_tributarios'] = None
            for item in dados.get('itens', []):
                item['tributos'] = None
        return dados


class AlertaSerializer(serializers.ModelSerializer):
    empresa_nome = serializers.CharField(source='empresa.nome', read_only=True, default='')
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)

    class Meta:
        model = AlertaFiscal
        exclude = ['chave_deduplicacao']
        read_only_fields = [f.name for f in AlertaFiscal._meta.fields if f.name != 'situacao']


class OcorrenciaSerializer(serializers.ModelSerializer):
    empresa_nome = serializers.CharField(source='empresa.nome', read_only=True)
    documento_chave = serializers.CharField(source='documento.chave', read_only=True, default='')

    class Meta:
        model = OcorrenciaAuditoria
        exclude = ['chave_deduplicacao']
        read_only_fields = ['empresa', 'documento', 'regra', 'severidade', 'descricao', 'resolvido_por',
                            'resolvido_em', 'criado_em']


class ExecucaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExecucaoSincronizacao
        fields = '__all__'


class ImportacaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportacaoManual
        fields = ['id', 'criado_em', 'empresa', 'arquivos', 'totais', 'resultados']


class PendenciaVinculoSerializer(serializers.ModelSerializer):
    class Meta:
        model = PendenciaVinculo
        exclude = ['conteudo']


class RegistroAuditoriaSerializer(serializers.ModelSerializer):
    usuario_nome = serializers.CharField(source='usuario.username', read_only=True, default='')
    empresa_nome = serializers.CharField(source='empresa.nome', read_only=True, default='')

    class Meta:
        model = RegistroAuditoria
        fields = '__all__'
