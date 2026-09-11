PAGE_CATALOG = [
    {'chave': 'dashboard', 'nome': 'Dashboard', 'rota': '/', 'secao': 'Operação', 'descricao': 'Resumo e indicadores do sistema.'},
    {'chave': 'carteira', 'nome': 'Carteira', 'rota': '/carteira-empresas', 'secao': 'Operação', 'descricao': 'Carteira de empresas e operação mensal.'},
    {'chave': 'honorarios', 'nome': 'Honorários', 'rota': '/gerenciamento-integrado', 'secao': 'Operação', 'descricao': 'Geração, download e envio de honorários.'},
    {'chave': 'pendencias', 'nome': 'Pendências', 'rota': '/pendencias', 'secao': 'Operação', 'descricao': 'Alertas, vencimentos e tarefas.'},
    {'chave': 'empresas', 'nome': 'Empresas', 'rota': '/empresas', 'secao': 'Operação', 'descricao': 'Cadastro, edição, pastas e documentos de empresas.'},
    {'chave': 'central_das', 'nome': 'Central DAS', 'rota': '/central-simples', 'secao': 'Fiscal', 'descricao': 'Apuração e documentos do Simples Nacional.'},
    {'chave': 'central_dctfweb', 'nome': 'Central DCTFWeb', 'rota': '/central-dctfweb', 'secao': 'Fiscal', 'descricao': 'Guias, recibos e declarações DCTFWeb.'},
    {'chave': 'parcelamento_simples', 'nome': 'Parcelamento SN', 'rota': '/parcelamento-simples', 'secao': 'Fiscal', 'descricao': 'Consulta e emissão de parcelas do Simples Nacional.'},
    {'chave': 'gerenciamento_simples', 'nome': 'Gerenciamento do Simples', 'rota': '/gerenciamento/simples-nacional', 'secao': 'Fiscal', 'descricao': 'Configuração do monitoramento do Simples Nacional.'},
    {'chave': 'monitor_boletos', 'nome': 'Monitor boletos', 'rota': '/monitor-boletos', 'secao': 'Financeiro', 'descricao': 'Acompanhamento de cobranças e pagamentos.'},
    {'chave': 'boletos_empresa', 'nome': 'Boletos por empresa', 'rota': '/boletos-por-empresa', 'secao': 'Financeiro', 'descricao': 'Consulta dos boletos de cada empresa.'},
    {'chave': 'inadimplencia', 'nome': 'Inadimplência', 'rota': '/inadimplencia-boletos', 'secao': 'Financeiro', 'descricao': 'Cobranças e boletos vencidos.'},
    {'chave': 'calculadora_honorarios', 'nome': 'Calculadora de honorários', 'rota': '/calculadora-honorarios', 'secao': 'Financeiro', 'descricao': 'Cálculo de mensalidades e honorários.'},
    {'chave': 'faturamento', 'nome': 'Faturamento', 'rota': '/relacao-faturamento', 'secao': 'Financeiro', 'descricao': 'Relação de faturamento e receitas.'},
    {'chave': 'relatorios', 'nome': 'Relatórios Excel', 'rota': '/relatorios', 'secao': 'Financeiro', 'descricao': 'Exportação de relatórios e planilhas.'},
    {'chave': 'pro_labore', 'nome': 'Pró-labore PDF', 'rota': '/gerar-pro-labore', 'secao': 'Financeiro', 'descricao': 'Geração de documentos de pró-labore.'},
    {'chave': 'usuarios', 'nome': 'Usuários', 'rota': '/gerenciar-usuarios', 'secao': 'Administração', 'descricao': 'Cadastro e manutenção dos usuários.'},
    {'chave': 'atribuicoes', 'nome': 'Atribuições', 'rota': '/gerenciar-atribuicoes', 'secao': 'Administração', 'descricao': 'Distribuição de empresas e responsabilidades.'},
    {'chave': 'historico_whatsapp', 'nome': 'Histórico WhatsApp', 'rota': '/historico-whatsapp', 'secao': 'Administração', 'descricao': 'Histórico de mensagens e envios.'},
    {'chave': 'gerenciar_paginas', 'nome': 'Gerenciar páginas', 'rota': '/gerenciar-paginas', 'secao': 'Administração', 'descricao': 'Disponibilidade e permissões das páginas.', 'gerenciavel': False},
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
