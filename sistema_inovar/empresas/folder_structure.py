import os


FOLDER_DEFINITIONS = {
    'constitutivos_societario': {'label': 'Societário', 'parts': ('CONSTITUTIVOS', 'SOCIETARIO'), 'period': 'none'},
    'constitutivos_inscricoes': {'label': 'Inscrições', 'parts': ('CONSTITUTIVOS', 'INSCRICOES'), 'period': 'none'},
    'constitutivos_outros': {'label': 'Outros', 'parts': ('CONSTITUTIVOS', 'OUTROS'), 'period': 'none'},
    'pessoal_guias': {'label': 'Guias', 'parts': ('PESSOAL', 'GUIAS'), 'period': 'monthly'},
    'pessoal_folha_pagamento': {'label': 'Folha de Pagamento', 'parts': ('PESSOAL', 'FOLHA DE PAGAMENTO'), 'period': 'monthly'},
    'pessoal_relatorios': {'label': 'Relatórios', 'parts': ('PESSOAL', 'RELATORIOS'), 'period': 'monthly'},
    'fiscal_xml': {'label': 'XML', 'parts': ('FISCAL', 'XML'), 'period': 'monthly'},
    'fiscal_guias': {'label': 'Guias', 'parts': ('FISCAL', 'GUIAS'), 'period': 'monthly'},
    'fiscal_extratos': {'label': 'Extratos', 'parts': ('FISCAL', 'EXTRATOS'), 'period': 'monthly'},
    'fiscal_declaracoes': {'label': 'Declarações', 'parts': ('FISCAL', 'DECLARACOES'), 'period': 'annual'},
    'contabil_balanco_anual': {'label': 'Balanço Anual', 'parts': ('CONTABIL', 'BALANCO ANUAL'), 'period': 'annual'},
    'contabil_documentos': {'label': 'Documentos', 'parts': ('CONTABIL', 'DOCUMENTOS'), 'period': 'monthly'},
    'financeiro_honorarios_mensais': {'label': 'Honorários Mensais', 'parts': ('FINANCEIRO', 'HONORARIOS MENSAIS'), 'period': 'monthly'},
    'outros': {'label': 'Outros', 'parts': ('OUTROS',), 'period': 'none'},
}


MONTHLY_FOLDERS = (
    ('PESSOAL', 'GUIAS'),
    ('PESSOAL', 'FOLHA DE PAGAMENTO'),
    ('PESSOAL', 'RELATORIOS'),
    ('FISCAL', 'XML'),
    ('FISCAL', 'GUIAS'),
    ('FISCAL', 'EXTRATOS'),
    ('CONTABIL', 'DOCUMENTOS'),
    ('FINANCEIRO', 'HONORARIOS MENSAIS'),
)

ANNUAL_FOLDERS = (
    ('FISCAL', 'DECLARACOES'),
    ('CONTABIL', 'BALANCO ANUAL'),
)

PLAIN_FOLDERS = (
    ('CONSTITUTIVOS', 'SOCIETARIO'),
    ('CONSTITUTIVOS', 'INSCRICOES'),
    ('CONSTITUTIVOS', 'OUTROS'),
    ('OUTROS',),
)


def create_company_folder_structure(company_path, years=()):
    """Cria a árvore canônica; meses são sempre pastas 01 a 12."""
    for relative_parts in PLAIN_FOLDERS:
        os.makedirs(os.path.join(company_path, *relative_parts), exist_ok=True)

    normalized_years = sorted({str(year) for year in years if str(year).isdigit()})
    for relative_parts in MONTHLY_FOLDERS:
        base_path = os.path.join(company_path, *relative_parts)
        os.makedirs(base_path, exist_ok=True)
        for year in normalized_years:
            year_path = os.path.join(base_path, year)
            for month in range(1, 13):
                os.makedirs(os.path.join(year_path, f'{month:02d}'), exist_ok=True)

    for relative_parts in ANNUAL_FOLDERS:
        base_path = os.path.join(company_path, *relative_parts)
        os.makedirs(base_path, exist_ok=True)
        for year in normalized_years:
            os.makedirs(os.path.join(base_path, year), exist_ok=True)
