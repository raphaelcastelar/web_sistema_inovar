from django.conf import settings
from django.db import models
from django.utils import timezone

from . import constantes as c


def dias_alerta_certificado_padrao():
    return [30, 15, 7, 1]


class CertificadoDigital(models.Model):
    """Certificado A1 armazenado cifrado. Nunca serializar os campos binários."""

    titular = models.CharField(max_length=255)
    cnpj = models.CharField(max_length=14, blank=True, default='', db_index=True)
    cpf = models.CharField(max_length=11, blank=True, default='')
    emissor = models.CharField(max_length=255, blank=True, default='')
    numero_serie = models.CharField(max_length=80, blank=True, default='')
    fingerprint_sha256 = models.CharField(max_length=64, db_index=True)
    valido_de = models.DateTimeField()
    valido_ate = models.DateTimeField(db_index=True)
    autenticacao_cliente = models.BooleanField(default=False)
    cadeia_icp_brasil = models.BooleanField(null=True)
    alertas_validacao = models.JSONField(default=list, blank=True)
    arquivo_cifrado = models.BinaryField(editable=False)
    senha_cifrada = models.BinaryField(editable=False)
    nome_arquivo = models.CharField(max_length=255, blank=True, default='')
    ativo = models.BooleanField(default=True)
    substituido_por = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name='substitui'
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='+',
    )

    class Meta:
        ordering = ['-criado_em']
        verbose_name = 'Certificado digital'
        verbose_name_plural = 'Certificados digitais'

    def __str__(self):
        return f'{self.titular} ({self.cnpj or self.cpf}) até {self.valido_ate:%d/%m/%Y}'

    @property
    def vencido(self):
        return self.valido_ate < timezone.now()

    @property
    def dias_para_vencer(self):
        return (self.valido_ate - timezone.now()).days


class ConfiguracaoMonitorFiscal(models.Model):
    """Configuração individual de monitoramento por empresa/estabelecimento."""

    empresa = models.OneToOneField(
        'empresas.Empresa', on_delete=models.CASCADE, related_name='monitor_fiscal'
    )
    ativo = models.BooleanField(default=False)
    ambiente = models.PositiveSmallIntegerField(choices=c.AMBIENTE_CHOICES, default=c.PRODUCAO)
    data_inicio = models.DateField(null=True, blank=True)
    certificado = models.ForeignKey(
        CertificadoDigital, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='configuracoes',
    )
    inscricao_estadual = models.CharField(max_length=20, blank=True, default='')
    inscricao_municipal = models.CharField(max_length=20, blank=True, default='')
    codigo_ibge_municipio = models.CharField(max_length=7, blank=True, default='')
    codigo_uf = models.CharField(max_length=2, blank=True, default='')

    monitorar_nfe = models.BooleanField(default=True)
    monitorar_nfse = models.BooleanField(default=True)
    monitorar_cte = models.BooleanField(default=True)
    monitorar_mdfe = models.BooleanField(default=False)
    monitorar_eventos = models.BooleanField(default=True)

    # Ciência automática: desabilitada por padrão e condicionada a autorização registrada.
    ciencia_automatica = models.BooleanField(default=False)
    ciencia_autorizada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    ciencia_autorizada_em = models.DateTimeField(null=True, blank=True)
    ciencia_autorizacao_descricao = models.TextField(
        blank=True, default='',
        help_text='Identificação do contribuinte/representante que autorizou e do documento de autorização.',
    )

    alertas_fiscais = models.BooleanField(default=True)
    alertas_certificado = models.BooleanField(default=True)
    dias_alerta_certificado = models.JSONField(default=dias_alerta_certificado_padrao, blank=True)

    atualizado_em = models.DateTimeField(auto_now=True)
    atualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )

    class Meta:
        verbose_name = 'Configuração do Monitor Fiscal'
        verbose_name_plural = 'Configurações do Monitor Fiscal'

    def __str__(self):
        return f'Monitor Fiscal - {self.empresa}'

    def fonte_habilitada(self, fonte):
        return {
            c.FONTE_AN_NFE: self.monitorar_nfe,
            c.FONTE_AN_CTE: self.monitorar_cte,
            c.FONTE_ADN_NFSE: self.monitorar_nfse,
            c.FONTE_AN_MDFE: self.monitorar_mdfe,
        }.get(fonte, False)


class ControleSincronizacao(models.Model):
    """Controle de NSU independente por empresa, fonte e ambiente."""

    SITUACAO_AGUARDANDO = 'aguardando'
    SITUACAO_EXECUTANDO = 'executando'
    SITUACAO_SINCRONIZADO = 'sincronizado'
    SITUACAO_ERRO = 'erro'
    SITUACAO_BLOQUEADO = 'bloqueado'
    SITUACAO_INDISPONIVEL = 'indisponivel'
    SITUACAO_CERTIFICADO = 'certificado_invalido'
    SITUACAO_DESATIVADO = 'desativado'
    SITUACAO_CHOICES = [
        (SITUACAO_AGUARDANDO, 'Aguardando consulta'),
        (SITUACAO_EXECUTANDO, 'Em execução'),
        (SITUACAO_SINCRONIZADO, 'Sincronizado'),
        (SITUACAO_ERRO, 'Com erro'),
        (SITUACAO_BLOQUEADO, 'Bloqueado por consumo indevido'),
        (SITUACAO_INDISPONIVEL, 'Serviço governamental indisponível'),
        (SITUACAO_CERTIFICADO, 'Certificado inválido ou incompatível'),
        (SITUACAO_DESATIVADO, 'Desativado'),
    ]

    empresa = models.ForeignKey('empresas.Empresa', on_delete=models.CASCADE, related_name='controles_fiscais')
    fonte = models.CharField(max_length=30, choices=c.FONTE_CHOICES)
    ambiente = models.PositiveSmallIntegerField(choices=c.AMBIENTE_CHOICES)
    cnpj_consultado = models.CharField(max_length=14)

    ult_nsu = models.CharField(max_length=20, default='0')
    max_nsu = models.CharField(max_length=20, blank=True, default='')
    lacunas_nsu = models.JSONField(default=list, blank=True)

    situacao = models.CharField(max_length=30, choices=SITUACAO_CHOICES, default=SITUACAO_AGUARDANDO)
    ultima_consulta_em = models.DateTimeField(null=True, blank=True)
    ultimo_sucesso_em = models.DateTimeField(null=True, blank=True)
    proxima_consulta_em = models.DateTimeField(null=True, blank=True, db_index=True)
    bloqueado_ate = models.DateTimeField(null=True, blank=True)
    motivo_bloqueio = models.CharField(max_length=255, blank=True, default='')
    ultimo_cstat = models.CharField(max_length=10, blank=True, default='')
    ultima_mensagem = models.TextField(blank=True, default='')
    documentos_recuperados = models.PositiveIntegerField(default=0)
    erros_consecutivos = models.PositiveIntegerField(default=0)
    total_erros = models.PositiveIntegerField(default=0)
    inconsistencia = models.TextField(blank=True, default='')
    certificado_fingerprint = models.CharField(max_length=64, blank=True, default='')

    # Contadores de consultas pontuais (consNSU/consChNFe) na janela corrente.
    consultas_pontuais_janela_inicio = models.DateTimeField(null=True, blank=True)
    consultas_pontuais_na_janela = models.PositiveIntegerField(default=0)

    # Trava de execução concorrente com expiração (recuperação após reinício).
    executando_desde = models.DateTimeField(null=True, blank=True)
    execucao_token = models.CharField(max_length=40, blank=True, default='')

    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('empresa', 'fonte', 'ambiente')
        indexes = [models.Index(fields=['fonte', 'situacao'], name='mf_ctrl_fonte_sit_idx')]
        verbose_name = 'Controle de sincronização'
        verbose_name_plural = 'Controles de sincronização'

    def __str__(self):
        return f'{self.empresa} - {self.fonte} - NSU {self.ult_nsu}'


class ExecucaoSincronizacao(models.Model):
    controle = models.ForeignKey(ControleSincronizacao, on_delete=models.CASCADE, related_name='execucoes')
    origem = models.CharField(max_length=20, default='automatica')  # automatica | manual | lote
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    iniciado_em = models.DateTimeField(default=timezone.now)
    finalizado_em = models.DateTimeField(null=True, blank=True)
    nsu_inicial = models.CharField(max_length=20, blank=True, default='')
    nsu_final = models.CharField(max_length=20, blank=True, default='')
    lotes = models.PositiveIntegerField(default=0)
    documentos = models.PositiveIntegerField(default=0)
    cstat = models.CharField(max_length=10, blank=True, default='')
    mensagem = models.TextField(blank=True, default='')
    sucesso = models.BooleanField(default=False)

    class Meta:
        ordering = ['-iniciado_em']


class DocumentoFiscal(models.Model):
    CLASSIFICACAO_CHOICES = [
        ('entrada', 'Entrada'),
        ('saida', 'Saída'),
        ('servico_prestado', 'Serviço prestado'),
        ('servico_tomado', 'Serviço tomado'),
        ('intermediacao', 'Intermediação'),
        ('transporte_contratado', 'Transporte contratado'),
        ('transporte_prestado', 'Transporte prestado'),
        ('terceiro_autorizado', 'Terceiro autorizado'),
        ('outros', 'Outros'),
    ]
    SITUACAO_FISCAL_CHOICES = [
        ('autorizado', 'Autorizado'),
        ('cancelado', 'Cancelado'),
        ('substituido', 'Substituído'),
        ('denegado', 'Denegado'),
        ('encerrado', 'Encerrado'),
        ('desconhecida', 'Situação desconhecida'),
    ]
    SITUACAO_XML_CHOICES = [
        ('resumo', 'Resumo disponível'),
        ('completo', 'XML completo disponível'),
        ('pendente', 'XML pendente'),
        ('erro', 'Erro de processamento'),
    ]
    SITUACAO_MANIFESTACAO_CHOICES = [
        ('nao_aplicavel', 'Não aplicável'),
        ('nao_manifestada', 'Não manifestada'),
        ('ciencia', 'Ciência registrada'),
        ('confirmada', 'Operação confirmada'),
        ('desconhecida', 'Operação desconhecida'),
        ('nao_realizada', 'Operação não realizada'),
        ('pendente_conclusao', 'Manifestação pendente de conclusão'),
    ]
    SITUACAO_CONFERENCIA_CHOICES = [
        ('pendente', 'Pendente'),
        ('conferido', 'Conferido'),
        ('inconsistente', 'Com inconsistência'),
        ('em_analise', 'Aguardando análise'),
    ]

    empresa = models.ForeignKey('empresas.Empresa', on_delete=models.CASCADE, related_name='documentos_fiscais')
    cnpj_estabelecimento = models.CharField(max_length=14, blank=True, default='')
    tipo_documento = models.CharField(max_length=10, choices=c.TIPO_DOCUMENTO_CHOICES)
    modelo = models.CharField(max_length=4, blank=True, default='')
    ambiente = models.PositiveSmallIntegerField(choices=c.AMBIENTE_CHOICES)
    chave = models.CharField(max_length=60)
    numero = models.CharField(max_length=20, blank=True, default='')
    serie = models.CharField(max_length=10, blank=True, default='')
    data_emissao = models.DateTimeField(null=True, blank=True)
    competencia = models.DateField(null=True, blank=True)
    data_autorizacao = models.DateTimeField(null=True, blank=True)
    protocolo = models.CharField(max_length=30, blank=True, default='')
    capturado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    emitente_documento = models.CharField(max_length=14, blank=True, default='')
    emitente_nome = models.CharField(max_length=255, blank=True, default='')
    emitente_ie = models.CharField(max_length=20, blank=True, default='')
    destinatario_documento = models.CharField(max_length=14, blank=True, default='')
    destinatario_nome = models.CharField(max_length=255, blank=True, default='')
    participantes = models.JSONField(default=dict, blank=True)
    municipio_codigo = models.CharField(max_length=7, blank=True, default='')
    municipio_nome = models.CharField(max_length=120, blank=True, default='')
    uf = models.CharField(max_length=2, blank=True, default='')
    tipo_operacao = models.CharField(max_length=2, blank=True, default='')  # tpNF etc.

    valor_total = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    valores_tributarios = models.JSONField(default=dict, blank=True)
    dados = models.JSONField(default=dict, blank=True)  # campos específicos do tipo

    classificacao = models.CharField(max_length=30, choices=CLASSIFICACAO_CHOICES, default='outros')
    situacao_fiscal = models.CharField(max_length=20, choices=SITUACAO_FISCAL_CHOICES, default='desconhecida')
    situacao_xml = models.CharField(max_length=20, choices=SITUACAO_XML_CHOICES, default='pendente')
    situacao_manifestacao = models.CharField(
        max_length=30, choices=SITUACAO_MANIFESTACAO_CHOICES, default='nao_aplicavel'
    )
    situacao_conferencia = models.CharField(
        max_length=20, choices=SITUACAO_CONFERENCIA_CHOICES, default='pendente'
    )
    observacao_interna = models.TextField(blank=True, default='')

    xml_resumo = models.TextField(blank=True, default='')
    xml_completo = models.TextField(blank=True, default='')
    hash_xml = models.CharField(max_length=64, blank=True, default='')
    schema = models.CharField(max_length=60, blank=True, default='')
    versao_leiaute = models.CharField(max_length=10, blank=True, default='')
    fontes = models.JSONField(default=list, blank=True)
    substituido_por = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name='substitui'
    )
    chave_substituta = models.CharField(max_length=60, blank=True, default='')

    class Meta:
        unique_together = ('empresa', 'tipo_documento', 'chave', 'ambiente')
        ordering = ['-data_emissao', '-id']
        indexes = [
            models.Index(fields=['empresa', 'ambiente', 'tipo_documento', 'data_emissao'], name='mf_doc_emp_tipo_data_idx'),
            models.Index(fields=['chave'], name='mf_doc_chave_idx'),
            models.Index(fields=['empresa', 'competencia'], name='mf_doc_emp_comp_idx'),
            models.Index(fields=['situacao_xml'], name='mf_doc_sit_xml_idx'),
            models.Index(fields=['situacao_manifestacao'], name='mf_doc_sit_manif_idx'),
        ]
        permissions = [
            ('baixar_documentos', 'Pode baixar documentos fiscais'),
            ('importar_xml', 'Pode importar XMLs'),
            ('consultar_relatorios', 'Pode consultar relatórios fiscais'),
            ('visualizar_tributos', 'Pode visualizar tributos'),
            ('realizar_manifestacao', 'Pode realizar manifestação do destinatário'),
            ('configurar_ciencia_automatica', 'Pode configurar ciência automática'),
            ('gerenciar_certificados', 'Pode gerenciar certificados digitais'),
            ('ativar_monitoramento', 'Pode ativar o monitoramento fiscal'),
            ('solicitar_sincronizacao', 'Pode solicitar sincronização'),
            ('gerenciar_alertas', 'Pode gerenciar alertas fiscais'),
            ('acessar_logs', 'Pode acessar logs do monitor fiscal'),
            ('configurar_integracoes', 'Pode configurar integrações fiscais'),
        ]

    def __str__(self):
        return f'{self.get_tipo_documento_display()} {self.numero} ({self.chave})'

    @property
    def xml_original(self):
        return self.xml_completo or self.xml_resumo

    @property
    def conta_como_movimentacao(self):
        return self.situacao_fiscal in ('autorizado', 'encerrado', 'desconhecida') and not self.substituido_por_id


class ItemDocumentoFiscal(models.Model):
    documento = models.ForeignKey(DocumentoFiscal, on_delete=models.CASCADE, related_name='itens')
    numero_item = models.PositiveIntegerField()
    codigo = models.CharField(max_length=60, blank=True, default='')
    descricao = models.CharField(max_length=500, blank=True, default='')
    ncm = models.CharField(max_length=10, blank=True, default='')
    cest = models.CharField(max_length=10, blank=True, default='')
    cfop = models.CharField(max_length=4, blank=True, default='')
    gtin = models.CharField(max_length=20, blank=True, default='')
    unidade = models.CharField(max_length=10, blank=True, default='')
    quantidade = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    valor_unitario = models.DecimalField(max_digits=21, decimal_places=10, null=True, blank=True)
    valor_total = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    tributos = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['documento', 'numero_item']
        indexes = [
            models.Index(fields=['ncm'], name='mf_item_ncm_idx'),
            models.Index(fields=['cfop'], name='mf_item_cfop_idx'),
        ]


class EventoFiscal(models.Model):
    empresa = models.ForeignKey('empresas.Empresa', on_delete=models.CASCADE, related_name='eventos_fiscais')
    ambiente = models.PositiveSmallIntegerField(choices=c.AMBIENTE_CHOICES)
    tipo_documento = models.CharField(max_length=10, choices=c.TIPO_DOCUMENTO_CHOICES)
    chave_documento = models.CharField(max_length=60, db_index=True)
    documento = models.ForeignKey(
        DocumentoFiscal, null=True, blank=True, on_delete=models.SET_NULL, related_name='eventos'
    )
    tipo_evento = models.CharField(max_length=10)
    descricao = models.CharField(max_length=255, blank=True, default='')
    sequencia = models.PositiveIntegerField(default=1)
    identificador = models.CharField(max_length=80, blank=True, default='')
    data_evento = models.DateTimeField(null=True, blank=True)
    data_registro = models.DateTimeField(null=True, blank=True)
    protocolo = models.CharField(max_length=30, blank=True, default='')
    autor_documento = models.CharField(max_length=14, blank=True, default='')
    cstat = models.CharField(max_length=10, blank=True, default='')
    situacao = models.CharField(max_length=30, blank=True, default='registrado')
    completo = models.BooleanField(default=False)
    xml = models.TextField(blank=True, default='')
    resposta_servico = models.TextField(blank=True, default='')
    dados = models.JSONField(default=dict, blank=True)
    fonte = models.CharField(max_length=30, choices=c.FONTE_CHOICES)
    hash_xml = models.CharField(max_length=64, blank=True, default='')
    capturado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('empresa', 'ambiente', 'tipo_documento', 'chave_documento', 'tipo_evento', 'sequencia')
        ordering = ['data_evento', 'id']


class RecebimentoDFe(models.Model):
    """Registro bruto de cada conteúdo recebido (origem e preservação do original)."""

    TIPO_CONTEUDO_CHOICES = [
        ('resumo', 'Resumo de documento'),
        ('completo', 'Documento completo'),
        ('evento', 'Evento completo'),
        ('resumo_evento', 'Resumo de evento'),
        ('desconhecido', 'Desconhecido'),
    ]

    empresa = models.ForeignKey(
        'empresas.Empresa', null=True, blank=True, on_delete=models.CASCADE, related_name='recebimentos_dfe'
    )
    fonte = models.CharField(max_length=30, choices=c.FONTE_CHOICES)
    ambiente = models.PositiveSmallIntegerField(choices=c.AMBIENTE_CHOICES)
    nsu = models.CharField(max_length=20, null=True, blank=True)
    schema = models.CharField(max_length=80, blank=True, default='')
    tipo_conteudo = models.CharField(max_length=20, choices=TIPO_CONTEUDO_CHOICES, default='desconhecido')
    conteudo = models.TextField()
    hash_conteudo = models.CharField(max_length=64, db_index=True)
    recebido_em = models.DateTimeField(auto_now_add=True)
    processado = models.BooleanField(default=False)
    erro = models.TextField(blank=True, default='')
    documento = models.ForeignKey(
        DocumentoFiscal, null=True, blank=True, on_delete=models.SET_NULL, related_name='recebimentos'
    )
    evento = models.ForeignKey(
        EventoFiscal, null=True, blank=True, on_delete=models.SET_NULL, related_name='recebimentos'
    )
    importacao = models.ForeignKey(
        'ImportacaoManual', null=True, blank=True, on_delete=models.SET_NULL, related_name='recebimentos'
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )

    class Meta:
        ordering = ['-recebido_em']
        constraints = [
            models.UniqueConstraint(
                fields=['empresa', 'fonte', 'ambiente', 'nsu'],
                condition=models.Q(nsu__isnull=False),
                name='mf_receb_nsu_unico',
            ),
        ]


class Manifestacao(models.Model):
    SITUACAO_CHOICES = [
        ('pendente', 'Pendente de transmissão'),
        ('transmitindo', 'Transmitindo'),
        ('registrada', 'Registrada'),
        ('rejeitada', 'Rejeitada'),
        ('erro', 'Erro de comunicação'),
    ]

    documento = models.ForeignKey(DocumentoFiscal, on_delete=models.CASCADE, related_name='manifestacoes')
    tipo_evento = models.CharField(max_length=6)
    justificativa = models.CharField(max_length=255, blank=True, default='')
    sequencia = models.PositiveSmallIntegerField(default=1)
    situacao = models.CharField(max_length=20, choices=SITUACAO_CHOICES, default='pendente')
    cstat = models.CharField(max_length=10, blank=True, default='')
    motivo = models.TextField(blank=True, default='')
    protocolo = models.CharField(max_length=30, blank=True, default='')
    data_registro = models.DateTimeField(null=True, blank=True)
    xml_enviado = models.TextField(blank=True, default='')
    xml_retorno = models.TextField(blank=True, default='')
    xml_processado = models.TextField(blank=True, default='')
    automatica = models.BooleanField(default=False)
    solicitado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    transmitido_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-criado_em']


class ImportacaoManual(models.Model):
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    empresa = models.ForeignKey(
        'empresas.Empresa', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    arquivos = models.JSONField(default=list, blank=True)
    totais = models.JSONField(default=dict, blank=True)
    resultados = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ['-criado_em']


class PendenciaVinculo(models.Model):
    """Documento importado que não pôde ser vinculado automaticamente a uma empresa."""

    importacao = models.ForeignKey(ImportacaoManual, on_delete=models.CASCADE, related_name='pendencias')
    nome_arquivo = models.CharField(max_length=255)
    conteudo = models.TextField()
    chave = models.CharField(max_length=60, blank=True, default='')
    participantes = models.JSONField(default=list, blank=True)
    resolvida = models.BooleanField(default=False)
    criado_em = models.DateTimeField(auto_now_add=True)


class AlertaFiscal(models.Model):
    PRIORIDADE_CHOICES = [('baixa', 'Baixa'), ('normal', 'Normal'), ('alta', 'Alta'), ('critica', 'Crítica')]
    SITUACAO_CHOICES = [
        ('novo', 'Novo'), ('lido', 'Lido'), ('analisado', 'Analisado'), ('resolvido', 'Resolvido'),
    ]
    TIPO_CHOICES = [
        ('nova_nfe', 'Nova NF-e recebida'),
        ('nova_nfse', 'Nova NFS-e'),
        ('novo_cte', 'Novo CT-e'),
        ('novo_mdfe', 'Novo MDF-e'),
        ('documento_cancelado', 'Documento cancelado'),
        ('documento_substituido', 'Documento substituído'),
        ('xml_disponivel', 'XML completo disponibilizado'),
        ('manifestacao_pendente', 'Manifestação pendente'),
        ('certificado_vencendo', 'Certificado próximo do vencimento'),
        ('certificado_vencido', 'Certificado vencido'),
        ('falha_sincronizacao', 'Falha de sincronização'),
        ('consumo_indevido', 'Bloqueio por consumo indevido'),
        ('indisponibilidade', 'Indisponibilidade governamental'),
        ('inconsistencia', 'Possível inconsistência fiscal'),
    ]

    empresa = models.ForeignKey(
        'empresas.Empresa', null=True, blank=True, on_delete=models.CASCADE, related_name='alertas_fiscais'
    )
    documento = models.ForeignKey(
        DocumentoFiscal, null=True, blank=True, on_delete=models.CASCADE, related_name='alertas'
    )
    tipo = models.CharField(max_length=40, choices=TIPO_CHOICES)
    prioridade = models.CharField(max_length=10, choices=PRIORIDADE_CHOICES, default='normal')
    titulo = models.CharField(max_length=200)
    mensagem = models.TextField(blank=True, default='')
    chave_deduplicacao = models.CharField(max_length=200, unique=True)
    situacao = models.CharField(max_length=20, choices=SITUACAO_CHOICES, default='novo')
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)
    atualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )

    class Meta:
        ordering = ['-criado_em']
        indexes = [models.Index(fields=['situacao', '-criado_em'], name='mf_alerta_sit_idx')]


class PreferenciaAlerta(models.Model):
    """Configuração de alertas por usuário (tipos ativos, frequência e prioridade mínima)."""

    FREQUENCIA_CHOICES = [('imediata', 'Imediata'), ('diaria', 'Resumo diário'), ('desativada', 'Desativada')]

    usuario = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='preferencia_alerta_fiscal')
    tipos_ativos = models.JSONField(default=list, blank=True)  # vazio = todos
    prioridade_minima = models.CharField(max_length=10, default='normal')
    frequencia = models.CharField(max_length=20, choices=FREQUENCIA_CHOICES, default='imediata')
    empresas = models.ManyToManyField('empresas.Empresa', blank=True, related_name='+')


class OcorrenciaAuditoria(models.Model):
    SEVERIDADE_CHOICES = [('informativa', 'Informativa'), ('atencao', 'Atenção'), ('critica', 'Crítica')]
    SITUACAO_CHOICES = [('aberta', 'Aberta'), ('justificada', 'Justificada'), ('resolvida', 'Resolvida')]

    empresa = models.ForeignKey('empresas.Empresa', on_delete=models.CASCADE, related_name='ocorrencias_fiscais')
    documento = models.ForeignKey(
        DocumentoFiscal, null=True, blank=True, on_delete=models.CASCADE, related_name='ocorrencias'
    )
    regra = models.CharField(max_length=60)
    severidade = models.CharField(max_length=20, choices=SEVERIDADE_CHOICES)
    descricao = models.TextField()
    chave_deduplicacao = models.CharField(max_length=200, unique=True)
    situacao = models.CharField(max_length=20, choices=SITUACAO_CHOICES, default='aberta')
    justificativa = models.TextField(blank=True, default='')
    resolvido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    resolvido_em = models.DateTimeField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-criado_em']


class RegistroAuditoria(models.Model):
    """Trilha de auditoria de operações sensíveis. Nunca armazenar segredos aqui."""

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    empresa = models.ForeignKey(
        'empresas.Empresa', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    operacao = models.CharField(max_length=80)
    origem = models.CharField(max_length=80, blank=True, default='')
    resultado = models.CharField(max_length=20, default='sucesso')
    detalhes = models.JSONField(default=dict, blank=True)
    antes = models.JSONField(default=dict, blank=True)
    depois = models.JSONField(default=dict, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-criado_em']
