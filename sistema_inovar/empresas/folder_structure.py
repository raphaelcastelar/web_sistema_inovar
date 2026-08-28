import os


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
