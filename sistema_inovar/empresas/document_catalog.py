import re

import unidecode


DOCUMENT_TYPE_CATALOG = (
    ('cartao_cnpj', 'Cartão CNPJ', 'constitutivo', 'constitutivos_inscricoes', 'sem_periodo'),
    ('contrato_social', 'Contrato social', 'constitutivo', 'constitutivos_societario', 'sem_periodo'),
    ('inscricao_estadual', 'Inscrição estadual', 'constitutivo', 'constitutivos_inscricoes', 'sem_periodo'),
    ('inscricao_municipal', 'Inscrição municipal', 'constitutivo', 'constitutivos_inscricoes', 'sem_periodo'),
    ('ultima_alteracao', 'Última alteração contratual', 'constitutivo', 'constitutivos_societario', 'eventual'),
    ('documento_constitutivo', 'Outro documento constitutivo', 'constitutivo', 'constitutivos_outros', 'eventual'),
    ('folha_pagamento', 'Folha de pagamento', 'pessoal', 'pessoal_folha_pagamento', 'mensal'),
    ('guia_fgts', 'Guia FGTS', 'pessoal', 'pessoal_guias', 'mensal'),
    ('guia_inss', 'Guia INSS', 'pessoal', 'pessoal_guias', 'mensal'),
    ('recibo_dctfweb', 'Recibo DCTFWeb', 'pessoal', 'pessoal_relatorios', 'mensal'),
    ('declaracao_dctfweb', 'Declaração DCTFWeb', 'pessoal', 'pessoal_relatorios', 'mensal'),
    ('documento_pessoal', 'Outro documento pessoal', 'pessoal', 'pessoal_relatorios', 'mensal'),
    ('das_simples', 'DAS - Simples Nacional', 'fiscal', 'fiscal_guias', 'mensal'),
    ('extrato_simples', 'Extrato do Simples Nacional', 'fiscal', 'fiscal_extratos', 'mensal'),
    ('recibo_simples', 'Declaração/recibo do Simples Nacional', 'fiscal', 'fiscal_extratos', 'mensal'),
    ('guia_parcelamento_simples', 'Guia de parcelamento do Simples', 'fiscal', 'fiscal_guias', 'mensal'),
    ('xml_fiscal', 'Arquivo fiscal XML', 'fiscal', 'fiscal_xml', 'mensal'),
    ('documento_fiscal', 'Outro documento fiscal', 'fiscal', 'fiscal_declaracoes', 'anual'),
    ('documento_contabil', 'Documento contábil', 'contabil', 'contabil_documentos', 'mensal'),
    ('honorario', 'Honorário contábil', 'financeiro', 'financeiro_honorarios_mensais', 'mensal'),
    ('outro', 'Outro documento', 'outros', 'outros', 'eventual'),
)


def normalize_document_name(value):
    value = unidecode.unidecode(str(value or '')).upper()
    return re.sub(r'[^A-Z0-9]+', '_', value).strip('_')


def infer_document_type_code(folder_key, filename):
    """Classifica legados de forma determinística; novos uploads devem informar o tipo."""
    name = normalize_document_name(filename)

    prefix_rules = (
        ('GUIA_PARCELAMENTO_SN', 'guia_parcelamento_simples'),
        ('EXTRATO_SIMPLES', 'extrato_simples'),
        ('RECIBO_SIMPLES', 'recibo_simples'),
        ('GUIA_DCTFWEB', 'guia_inss'),
        ('RECIBO_DCTFWEB', 'recibo_dctfweb'),
        ('DECLARACAO_COMPLETA_DCTFWEB', 'declaracao_dctfweb'),
        ('DAS_', 'das_simples'),
    )
    for marker, code in prefix_rules:
        if name.startswith(marker) or marker in name:
            return code

    if folder_key == 'constitutivos_inscricoes':
        if 'INSCRICAO_ESTADUAL' in name:
            return 'inscricao_estadual'
        if 'INSCRICAO_MUNICIPAL' in name:
            return 'inscricao_municipal'
        if 'CNPJ' in name or 'CARTAO' in name:
            return 'cartao_cnpj'
        return 'documento_constitutivo'
    if folder_key == 'constitutivos_societario':
        if 'ALTERACAO' in name:
            return 'ultima_alteracao'
        if 'CONTRATO' in name or 'ESTATUTO' in name:
            return 'contrato_social'
        return 'documento_constitutivo'
    if str(folder_key).startswith('constitutivos_'):
        return 'documento_constitutivo'
    if folder_key == 'pessoal_folha_pagamento':
        return 'folha_pagamento'
    if folder_key == 'pessoal_guias':
        if 'FGTS' in name:
            return 'guia_fgts'
        if 'INSS' in name or 'DCTF' in name or 'DARF' in name:
            return 'guia_inss'
        return 'documento_pessoal'
    if folder_key == 'pessoal_relatorios':
        return 'documento_pessoal'
    if folder_key == 'fiscal_xml':
        return 'xml_fiscal'
    if folder_key == 'fiscal_extratos':
        return 'documento_fiscal'
    if folder_key in ('fiscal_guias', 'fiscal_declaracoes'):
        return 'documento_fiscal'
    if str(folder_key).startswith('contabil_'):
        return 'documento_contabil'
    if folder_key == 'financeiro_honorarios_mensais':
        return 'honorario'
    return 'outro'

