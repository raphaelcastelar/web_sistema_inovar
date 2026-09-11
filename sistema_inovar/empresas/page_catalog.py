PAGE_CATALOG = [
    # Cadastros
    {'chave': 'empresas', 'nome': 'Empresas', 'rota': '/empresas', 'secao': 'Cadastros', 'descricao': 'Cadastro, edição, pastas e documentos de empresas.'},
    {'chave': 'usuarios', 'nome': 'Usuários', 'rota': '/gerenciar-usuarios', 'secao': 'Cadastros', 'descricao': 'Cadastro e manutenção dos usuários.'},

    # Arquivo
    {'chave': 'carteira', 'nome': 'Pastas', 'rota': '/carteira-empresas', 'secao': 'Arquivo', 'descricao': 'Acesso às pastas e documentos das empresas.'},
    {'chave': 'historico_whatsapp', 'nome': 'Histórico de envios', 'rota': '/historico-whatsapp', 'secao': 'Arquivo', 'descricao': 'Histórico de mensagens e envios.'},

    # Fiscal
    {'chave': 'central_das', 'nome': 'Central DAS', 'rota': '/central-simples', 'secao': 'Fiscal', 'descricao': 'Apuração e documentos do Simples Nacional.'},
    {'chave': 'parcelamento_simples', 'nome': 'Central Parcelamento SN', 'rota': '/parcelamento-simples', 'secao': 'Fiscal', 'descricao': 'Consulta e emissão de parcelas do Simples Nacional.'},

    # Pessoal
    {'chave': 'central_dctfweb', 'nome': 'Central DCTF-Web', 'rota': '/central-dctfweb', 'secao': 'Pessoal', 'descricao': 'Guias, recibos e declarações DCTFWeb.'},

    # Financeiro
    {'chave': 'honorarios', 'nome': 'Honorários', 'rota': '/gerenciamento-integrado', 'secao': 'Financeiro', 'descricao': 'Geração, download e envio de honorários.'},
    {'chave': 'boletos_empresa', 'nome': 'Boletos por empresa', 'rota': '/boletos-por-empresa', 'secao': 'Financeiro', 'descricao': 'Consulta dos boletos de cada empresa.'},
    {'chave': 'monitor_boletos', 'nome': 'Monitor de boletos', 'rota': '/monitor-boletos', 'secao': 'Financeiro', 'descricao': 'Acompanhamento de cobranças e pagamentos.'},
    {'chave': 'inadimplencia', 'nome': 'Inadimplência', 'rota': '/inadimplencia-boletos', 'secao': 'Financeiro', 'descricao': 'Cobranças e boletos vencidos.'},
    {'chave': 'calculadora_honorarios', 'nome': 'Calculadora de honorários', 'rota': '/calculadora-honorarios', 'secao': 'Financeiro', 'descricao': 'Cálculo de mensalidades e honorários.'},

    # Documentos
    {'chave': 'relatorios', 'nome': 'Relatórios Excel', 'rota': '/relatorios', 'secao': 'Documentos', 'descricao': 'Exportação de relatórios e planilhas.'},
    {'chave': 'pro_labore', 'nome': 'Pró-labore', 'rota': '/gerar-pro-labore', 'secao': 'Documentos', 'descricao': 'Geração de documentos de pró-labore.'},
    {'chave': 'faturamento', 'nome': 'Relação de faturamento', 'rota': '/relacao-faturamento', 'secao': 'Documentos', 'descricao': 'Relação de faturamento e receitas.'},

    # Controle
    {'chave': 'atribuicoes', 'nome': 'Atribuições', 'rota': '/gerenciar-atribuicoes', 'secao': 'Controle', 'descricao': 'Distribuição de empresas e responsabilidades.'},
    {'chave': 'gerenciar_paginas', 'nome': 'Gerenciar páginas', 'rota': '/gerenciar-paginas', 'secao': 'Controle', 'descricao': 'Disponibilidade e permissões das páginas.', 'gerenciavel': False},

    # Rotas preservadas, mas removidas do navbar atual.
    {'chave': 'dashboard', 'nome': 'Dashboard', 'rota': '/dashboard', 'secao': 'Fora do menu', 'descricao': 'Resumo e indicadores do sistema.'},
    {'chave': 'pendencias', 'nome': 'Pendências', 'rota': '/pendencias', 'secao': 'Fora do menu', 'descricao': 'Alertas, vencimentos e tarefas.'},
    {'chave': 'gerenciamento_simples', 'nome': 'Gerenciamento do Simples', 'rota': '/gerenciamento/simples-nacional', 'secao': 'Fora do menu', 'descricao': 'Configuração do monitoramento do Simples Nacional.'},
]


def sync_page_catalog():
    from .models import PaginaSistema

    for position, item in enumerate(PAGE_CATALOG):
        defaults = {
            'nome': item['nome'],
            'rota': item['rota'],
            'secao': item['secao'],
            'descricao': item['descricao'],
            'ordem': position,
            'gerenciavel': item.get('gerenciavel', True),
        }
        pagina, created = PaginaSistema.objects.get_or_create(chave=item['chave'], defaults=defaults)
        if created:
            continue
        changed_fields = []
        for field, value in defaults.items():
            if getattr(pagina, field) != value:
                setattr(pagina, field, value)
                changed_fields.append(field)
        if changed_fields:
            pagina.save(update_fields=changed_fields)
