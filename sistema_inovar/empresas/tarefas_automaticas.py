import calendar
import datetime
import unicodedata
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from .models import Atividade, Empresa, Funcionario


CATALOGO_OBRIGACOES = {
    'DEFIS': {'departamento': 'fiscal', 'periodicidade': 'anual', 'dia': 31, 'mes': 3, 'ordem': 70},
    'NFS-e': {'departamento': 'fiscal', 'periodicidade': 'periodica', 'ordem': 50},
    'PG-DAS': {'departamento': 'fiscal', 'periodicidade': 'mensal', 'dia': 15, 'ordem': 60},
    'Guia DAS': {'departamento': 'fiscal', 'periodicidade': 'mensal', 'dia': 20, 'ordem': 65},
    'Escrituração Contábil': {'departamento': 'contabil', 'periodicidade': 'mensal', 'dia': 30, 'ordem': 90},
    'Balanço Trimestral': {'departamento': 'contabil', 'periodicidade': 'trimestral', 'dia': 31, 'ordem': 95},
    'Balanço Anual': {'departamento': 'contabil', 'periodicidade': 'anual', 'dia': 31, 'mes': 5, 'ordem': 100},
    'DCTF-WEB': {'departamento': 'pessoal', 'periodicidade': 'mensal', 'dia': 15, 'ordem': 30},
    'Guia INSS': {'departamento': 'pessoal', 'periodicidade': 'mensal', 'dia': 20, 'ordem': 38},
    'Guia Unificada MEI': {'departamento': 'pessoal', 'periodicidade': 'mensal', 'dia': 20, 'ordem': 42},
    'Guia FGTS': {'departamento': 'pessoal', 'periodicidade': 'mensal', 'dia': 20, 'ordem': 40},
    'Folha de Pagamento': {'departamento': 'pessoal', 'periodicidade': 'mensal', 'dia': 5, 'ordem': 10},
    'DASN-Mei': {'departamento': 'fiscal', 'periodicidade': 'anual', 'dia': 31, 'mes': 5, 'ordem': 80},
    'INSS 20% (SAL)': {'departamento': 'pessoal', 'periodicidade': 'mensal', 'dia': 15, 'ordem': 35},
    'E-Social': {'departamento': 'pessoal', 'periodicidade': 'mensal', 'dia': 15, 'ordem': 20},
}
FUSO_CIVIL = ZoneInfo('America/Sao_Paulo')


def _texto_normalizado(valor):
    texto = unicodedata.normalize('NFD', str(valor or ''))
    return ''.join(caractere for caractere in texto if unicodedata.category(caractere) != 'Mn').upper()


def _regime(empresa):
    regime = _texto_normalizado(empresa.regime_tributario)
    if not regime and _texto_normalizado(empresa.porte_empresa) == 'MEI':
        return 'MEI'
    return regime


def _presta_servico(empresa):
    grupos = empresa.grupo_atividade or []
    if not isinstance(grupos, list):
        grupos = [grupos]
    return any('SERVICO' in _texto_normalizado(grupo) for grupo in grupos)


def listar_obrigacoes_empresa(empresa):
    if empresa.ativo is False:
        return []

    regime = _regime(empresa)
    empregados = int(empresa.qtd_empregados or 0) > 0
    pro_labore = int(empresa.qtd_pro_labore or 0) > 0
    pelo_sal = bool(empresa.inss_20_sal)
    obrigacoes = set()

    if regime == 'SIMPLES NACIONAL':
        obrigacoes.update(['DEFIS', 'PG-DAS', 'Guia DAS', 'Escrituração Contábil', 'Balanço Anual'])
    elif regime == 'LUCRO REAL':
        obrigacoes.update(['Escrituração Contábil', 'Balanço Trimestral'])
    elif regime == 'MEI':
        obrigacoes.add('DASN-Mei')

    if _presta_servico(empresa):
        obrigacoes.add('NFS-e')

    if pro_labore and not pelo_sal:
        obrigacoes.update(['DCTF-WEB', 'Guia INSS', 'Folha de Pagamento'])
    elif pro_labore and pelo_sal:
        obrigacoes.add('INSS 20% (SAL)')

    if empregados and regime == 'MEI':
        obrigacoes.update(['DCTF-WEB', 'Folha de Pagamento', 'Guia Unificada MEI'])
    elif empregados:
        obrigacoes.update(['DCTF-WEB', 'Guia INSS', 'Guia FGTS', 'Folha de Pagamento'])

    if empregados or (pro_labore and not pelo_sal):
        obrigacoes.add('E-Social')

    return sorted(obrigacoes, key=lambda nome: CATALOGO_OBRIGACOES[nome]['ordem'])


def _data_limitada(ano, mes, dia):
    return datetime.date(ano, mes, min(dia, calendar.monthrange(ano, mes)[1]))


def calcular_ocorrencia(obrigacao, hoje=None):
    hoje = hoje or timezone.localtime(timezone.now(), FUSO_CIVIL).date()
    especificacao = CATALOGO_OBRIGACOES.get(obrigacao)
    if not especificacao or especificacao['periodicidade'] == 'periodica':
        return None

    periodicidade = especificacao['periodicidade']
    if periodicidade == 'mensal':
        prazo = _data_limitada(hoje.year, hoje.month, especificacao['dia'])
        referencia = prazo.replace(day=1) - datetime.timedelta(days=1)
        competencia = referencia.strftime('%m/%Y')
    elif periodicidade == 'anual':
        prazo = _data_limitada(hoje.year, especificacao['mes'], especificacao['dia'])
        if prazo < hoje:
            prazo = _data_limitada(hoje.year + 1, especificacao['mes'], especificacao['dia'])
        competencia = str(prazo.year - 1)
    elif periodicidade == 'trimestral':
        prazo = None
        for deslocamento in range(13):
            indice_mes = hoje.year * 12 + hoje.month - 1 + deslocamento
            ano, mes_base_zero = divmod(indice_mes, 12)
            mes = mes_base_zero + 1
            if mes not in (1, 4, 7, 10):
                continue
            candidata = _data_limitada(ano, mes, especificacao['dia'])
            if candidata >= hoje:
                prazo = candidata
                break
        if prazo is None:
            return None
        trimestre = (prazo.month - 1) // 3
        competencia = f"4º trim/{prazo.year - 1}" if trimestre == 0 else f"{trimestre}º trim/{prazo.year}"
    else:
        return None

    return {'competencia': competencia, 'prazo': prazo}


def _usuario_valido(usuario, departamento, empresa):
    if not usuario or not usuario.is_active:
        return False
    if usuario.is_staff or usuario.is_superuser or usuario.cargo == 'admin':
        return True
    if usuario.cargo != departamento:
        return False
    return usuario.empresas_gerenciadas.filter(pk=empresa.pk).exists()


def responsavel_principal(empresa, departamento):
    usuario = getattr(empresa, f'responsavel_{departamento}', None)
    return usuario if _usuario_valido(usuario, departamento, empresa) else None


@transaction.atomic
def sincronizar_tarefas_automaticas(empresa, hoje=None):
    if not empresa.pk:
        return {'criadas': 0, 'reatribuidas': 0, 'sem_responsavel': []}

    empresa = Empresa.objects.select_related(
        'responsavel_pessoal', 'responsavel_fiscal', 'responsavel_contabil'
    ).get(pk=empresa.pk)
    criadas = 0
    reatribuidas = 0

    for atividade in Atividade.objects.select_related('responsavel').filter(
        empresa=empresa,
        origem='automatica',
    ).exclude(estado__in=['concluida', 'cancelada']):
        responsavel_atual_valido = _usuario_valido(atividade.responsavel, atividade.departamento, empresa)
        houve_substituicao_manual = (
            responsavel_atual_valido
            and atividade.responsavel_id != atividade.responsavel_automatico_id
        )
        if houve_substituicao_manual:
            continue
        novo_responsavel = responsavel_principal(empresa, atividade.departamento)
        if atividade.responsavel_id != getattr(novo_responsavel, 'id', None):
            atividade.responsavel = novo_responsavel
            atividade.responsavel_automatico = novo_responsavel
            atividade.save(update_fields=['responsavel', 'responsavel_automatico', 'atualizada_em'])
            reatribuidas += 1

    for obrigacao in listar_obrigacoes_empresa(empresa):
        ocorrencia = calcular_ocorrencia(obrigacao, hoje=hoje)
        if not ocorrencia:
            continue
        departamento = CATALOGO_OBRIGACOES[obrigacao]['departamento']
        responsavel = responsavel_principal(empresa, departamento)
        chave = f'{empresa.pk}::{obrigacao}::{ocorrencia["competencia"]}'
        atividade, criada = Atividade.objects.get_or_create(
            empresa=empresa,
            obrigacao=obrigacao,
            competencia=ocorrencia['competencia'],
            origem='automatica',
            defaults={
                'chave_ocorrencia': chave,
                'titulo': obrigacao,
                'tipo': 'tarefa',
                'departamento': departamento,
                'responsavel': responsavel,
                'responsavel_automatico': responsavel,
                'data_planejada': ocorrencia['prazo'],
                'prazo': ocorrencia['prazo'],
                'prioridade': 'normal',
                'estado': 'a_fazer',
                'privada': False,
                'frequencia': 'nenhuma',
            },
        )
        if criada:
            criadas += 1
        elif not atividade.chave_ocorrencia:
            atividade.chave_ocorrencia = chave
            atividade.save(update_fields=['chave_ocorrencia', 'atualizada_em'])

    sem_responsavel = list(
        Atividade.objects.filter(
            empresa=empresa,
            origem='automatica',
            responsavel__isnull=True,
        ).exclude(estado__in=['concluida', 'cancelada']).values_list('id', flat=True)
    )
    return {'criadas': criadas, 'reatribuidas': reatribuidas, 'sem_responsavel': sem_responsavel}


def sincronizar_todas_tarefas_automaticas(hoje=None):
    resultado = {'criadas': 0, 'reatribuidas': 0, 'sem_responsavel': []}
    empresas = Empresa.objects.filter(ativo=True).only('id')
    for empresa in empresas.iterator():
        parcial = sincronizar_tarefas_automaticas(empresa, hoje=hoje)
        resultado['criadas'] += parcial['criadas']
        resultado['reatribuidas'] += parcial['reatribuidas']
        resultado['sem_responsavel'].extend(parcial['sem_responsavel'])
    return resultado
