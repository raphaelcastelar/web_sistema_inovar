"""Constantes oficiais dos serviços governamentais usados pelo Monitor Fiscal.

Cada endereço abaixo foi conferido em fonte oficial em 24/11/2026. A coluna
"fonte" registra onde a informação foi confirmada, para que a revisão futura
seja objetiva. Endereços não confirmados ficam com valor vazio e o serviço
correspondente recusa a execução até que sejam configurados.
"""

PRODUCAO = 1
HOMOLOGACAO = 2

AMBIENTE_CHOICES = [
    (PRODUCAO, 'Produção'),
    (HOMOLOGACAO, 'Homologação'),
]

# --- Fontes de captura ------------------------------------------------------
FONTE_AN_NFE = 'AN_NFE'
FONTE_AN_CTE = 'AN_CTE'
FONTE_ADN_NFSE = 'ADN_NFSE'
FONTE_AN_MDFE = 'AN_MDFE'
FONTE_IMPORTACAO = 'IMPORTACAO_MANUAL'

FONTE_CHOICES = [
    (FONTE_AN_NFE, 'Ambiente Nacional NF-e (NFeDistribuicaoDFe)'),
    (FONTE_AN_CTE, 'Ambiente Nacional CT-e (CTeDistribuicaoDFe)'),
    (FONTE_ADN_NFSE, 'Ambiente de Dados Nacional NFS-e (ADN)'),
    (FONTE_AN_MDFE, 'Distribuição MDF-e (MDFeDistribuicaoDFe)'),
    (FONTE_IMPORTACAO, 'Importação manual'),
    # Fontes futuras já reconhecidas pelo modelo de dados.
    ('COLETOR', 'Coletor instalado no cliente'),
    ('ERP', 'Integração com ERP'),
    ('PREFEITURA', 'Integração municipal'),
    ('EMAIL', 'Captura por e-mail'),
]

FONTES_DISTRIBUICAO = (FONTE_AN_NFE, FONTE_AN_CTE, FONTE_ADN_NFSE, FONTE_AN_MDFE)

# --- Tipos de documento -----------------------------------------------------
TIPO_NFE = 'NFE'
TIPO_CTE = 'CTE'
TIPO_NFSE = 'NFSE'
TIPO_MDFE = 'MDFE'

TIPO_DOCUMENTO_CHOICES = [
    (TIPO_NFE, 'NF-e'),
    (TIPO_CTE, 'CT-e'),
    (TIPO_NFSE, 'NFS-e'),
    (TIPO_MDFE, 'MDF-e'),
]

FONTE_POR_TIPO = {
    TIPO_NFE: FONTE_AN_NFE,
    TIPO_CTE: FONTE_AN_CTE,
    TIPO_NFSE: FONTE_ADN_NFSE,
    TIPO_MDFE: FONTE_AN_MDFE,
}

# --- Endereços oficiais -----------------------------------------------------
# NFeDistribuicaoDFe (AN): relação de Web Services do AN publicada pela SEFAZ-SP
# (portal.fazenda.sp.gov.br/servicos/nfe/Paginas/URL-WEBSERVICES.aspx).
# NFeRecepcaoEvento4 (AN): mesma relação.
# CTeDistribuicaoDFe: Portal Nacional do CT-e (www.cte.fazenda.gov.br/portal/webServices.aspx)
#   e Portal de Homologação do CT-e (hom.cte.fazenda.gov.br/portal/webServices.aspx).
# MDFeDistribuicaoDFe: MOC MDF-e, item 11 (moc.sped.fazenda.pr.gov.br/MDFe/MDFeDistribuicaoDFe.html).
# ADN NFS-e: Manual dos Contribuintes v1.0 (12/02/2026) e relação de APIs gov.br/nfse.
ENDPOINTS = {
    'NFE_DISTRIBUICAO': {
        PRODUCAO: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
        HOMOLOGACAO: 'https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
    },
    'NFE_RECEPCAO_EVENTO_AN': {
        PRODUCAO: 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
        HOMOLOGACAO: 'https://hom.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
    },
    'CTE_DISTRIBUICAO': {
        PRODUCAO: 'https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
        # Portal de Homologação do CT-e (hom.cte.fazenda.gov.br/portal/webServices.aspx), conferido em 26/11/2026.
        HOMOLOGACAO: 'https://hom1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
    },
    'MDFE_DISTRIBUICAO': {
        PRODUCAO: 'https://mdfe.svrs.rs.gov.br/WS/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx',
        HOMOLOGACAO: 'https://mdfe-homologacao.svrs.rs.gov.br/WS/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx',
    },
    'ADN_CONTRIBUINTES': {
        PRODUCAO: 'https://adn.nfse.gov.br/contribuintes',
        HOMOLOGACAO: 'https://adn.producaorestrita.nfse.gov.br/contribuintes',
    },
}

# --- Namespaces --------------------------------------------------------------
NS_NFE = 'http://www.portalfiscal.inf.br/nfe'
NS_CTE = 'http://www.portalfiscal.inf.br/cte'
NS_MDFE = 'http://www.portalfiscal.inf.br/mdfe'
NS_NFSE = 'http://www.sped.fazenda.gov.br/nfse'
NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#'
NS_SOAP12 = 'http://www.w3.org/2003/05/soap-envelope'

NS_WSDL_NFE_DIST = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe'
NS_WSDL_NFE_EVENTO = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4'
NS_WSDL_CTE_DIST = 'http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe'
NS_WSDL_MDFE_DIST = 'http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe'

# --- Códigos de retorno (MOC NF-e / CT-e / MDF-e) ----------------------------
CSTAT_NENHUM_DOCUMENTO = '137'
CSTAT_DOCUMENTOS_LOCALIZADOS = '138'
CSTAT_PARALISADO_MOMENTANEO = '108'
CSTAT_PARALISADO_SEM_PREVISAO = '109'
CSTAT_LOTE_EVENTO_PROCESSADO = '128'
CSTAT_EVENTO_VINCULADO = '135'
CSTAT_EVENTO_NAO_VINCULADO = '136'
CSTAT_DUPLICIDADE_EVENTO = '573'

# Consumo indevido é específico por serviço (MOC): NF-e e CT-e = 656; MDF-e = 678.
CSTAT_CONSUMO_INDEVIDO = {
    FONTE_AN_NFE: '656',
    FONTE_AN_CTE: '656',
    FONTE_AN_MDFE: '678',
}

# Rejeições que indicam incompatibilidade entre certificado e contribuinte.
CSTAT_CERTIFICADO_INCOMPATIVEL = {'593', '472', '491', '492', '280', '281', '283', '284', '285', '286', '287'}
# NSU informado superior ao maior NSU (NF-e/CT-e = 589; MDF-e = 493).
CSTAT_NSU_SUPERIOR = {'589', '493'}

# --- Manifestação do destinatário (MOC NF-e, Recepção de Evento) ------------
EVENTO_CONFIRMACAO = '210200'
EVENTO_CIENCIA = '210210'
EVENTO_DESCONHECIMENTO = '210220'
EVENTO_NAO_REALIZADA = '210240'

EVENTOS_MANIFESTACAO = {
    EVENTO_CONFIRMACAO: 'Confirmacao da Operacao',
    EVENTO_CIENCIA: 'Ciencia da Operacao',
    EVENTO_DESCONHECIMENTO: 'Desconhecimento da Operacao',
    EVENTO_NAO_REALIZADA: 'Operacao nao Realizada',
}
EVENTOS_MANIFESTACAO_CONCLUSIVA = {EVENTO_CONFIRMACAO, EVENTO_DESCONHECIMENTO, EVENTO_NAO_REALIZADA}
C_ORGAO_AMBIENTE_NACIONAL = '91'
# Regra H03 do MOC: prazo de recepção de 6 meses a partir da autorização da NF-e.
PRAZO_MANIFESTACAO_DIAS = 180

# --- Eventos conhecidos -----------------------------------------------------
EVENTOS_NFE = {
    '110110': 'Carta de Correção',
    '110111': 'Cancelamento',
    '110112': 'Cancelamento por substituição',
    '110140': 'EPEC',
    EVENTO_CONFIRMACAO: 'Confirmação da Operação',
    EVENTO_CIENCIA: 'Ciência da Operação',
    EVENTO_DESCONHECIMENTO: 'Desconhecimento da Operação',
    EVENTO_NAO_REALIZADA: 'Operação não Realizada',
}
EVENTOS_CANCELAMENTO_NFE = {'110111', '110112'}
EVENTOS_CANCELAMENTO_CTE = {'110111'}
EVENTOS_CANCELAMENTO_MDFE = {'110111'}

# Eventos da NFS-e Nacional (leiaute do Sistema Nacional NFS-e).
EVENTOS_NFSE = {
    '101101': 'Cancelamento de NFS-e',
    '105102': 'Cancelamento de NFS-e por Substituição',
    '101103': 'Solicitação de Análise Fiscal para Cancelamento',
    '105104': 'Cancelamento Deferido por Análise Fiscal',
    '105105': 'Cancelamento Indeferido por Análise Fiscal',
}
EVENTOS_CANCELAMENTO_NFSE = {'101101', '105104'}
EVENTOS_SUBSTITUICAO_NFSE = {'105102'}
