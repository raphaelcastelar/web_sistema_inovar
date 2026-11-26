"""Motor central de sincronização das fontes governamentais.

Regras principais:
- Um controle de NSU independente por empresa + fonte + ambiente.
- O NSU só avança na mesma transação que persiste os documentos do lote.
- Intervalo mínimo de 1 hora quando não há mais documentos (ultNSU == maxNSU
  ou cStat 137), conforme MOC de NF-e, CT-e e MDF-e.
- Consumo indevido (NF-e/CT-e 656, MDF-e 678) bloqueia a fonte; nenhuma
  consulta manual ou automática é feita durante o bloqueio.
- Trava de execução com expiração impede consultas simultâneas da mesma
  empresa/fonte e permite retomada após reinicialização.
"""
import logging
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import close_old_connections, transaction
from django.db.models import Q
from django.utils import timezone

from . import alertas
from . import constantes as c
from .certificados import analisar_certificado, compatibilidade_contribuinte
from .ambiente import ambiente_permitido, ambientes_permitidos, mensagem_bloqueio
from .clientes import adn
from .clientes.sefaz import ClienteDistribuicao, formatar_nsu
from .clientes.transporte import ComunicacaoError, TransporteMTLS
from .models import ConfiguracaoMonitorFiscal, ControleSincronizacao, ExecucaoSincronizacao, RecebimentoDFe
from .processador import processar_conteudo, somente_digitos
from .seguranca import descriptografar

logger = logging.getLogger(__name__)


def _cfg(nome, padrao):
    return getattr(settings, nome, padrao)


def intervalo_sem_documentos():
    return timedelta(minutes=_cfg('MONITOR_FISCAL_INTERVALO_SEM_DOCUMENTOS_MIN', 60))


def duracao_bloqueio():
    return timedelta(minutes=_cfg('MONITOR_FISCAL_BLOQUEIO_CONSUMO_INDEVIDO_MIN', 60))


def duracao_trava():
    return timedelta(minutes=_cfg('MONITOR_FISCAL_TRAVA_EXECUCAO_MIN', 15))


class SincronizacaoNaoPermitidaError(Exception):
    """Consulta impedida por bloqueio, intervalo obrigatório ou configuração."""


class ExecucaoConcorrenteError(SincronizacaoNaoPermitidaError):
    pass


# --- Preparação ---------------------------------------------------------------


def garantir_controles(config: ConfiguracaoMonitorFiscal):
    cnpj = somente_digitos(config.empresa.cnpj)
    controles = []
    for fonte in c.FONTES_DISTRIBUICAO:
        controle, _ = ControleSincronizacao.objects.get_or_create(
            empresa=config.empresa, fonte=fonte, ambiente=config.ambiente,
            defaults={'cnpj_consultado': cnpj},
        )
        habilitada = config.ativo and config.fonte_habilitada(fonte)
        if not habilitada and controle.situacao != ControleSincronizacao.SITUACAO_DESATIVADO:
            if controle.situacao not in (ControleSincronizacao.SITUACAO_BLOQUEADO,):
                controle.situacao = ControleSincronizacao.SITUACAO_DESATIVADO
                controle.save(update_fields=['situacao', 'atualizado_em'])
        elif habilitada and controle.situacao == ControleSincronizacao.SITUACAO_DESATIVADO:
            controle.situacao = ControleSincronizacao.SITUACAO_AGUARDANDO
            controle.save(update_fields=['situacao', 'atualizado_em'])
        controles.append(controle)
    return controles


def verificar_permissao_consulta(controle, agora=None):
    """Levanta SincronizacaoNaoPermitidaError quando a consulta não é permitida agora."""
    agora = agora or timezone.now()
    if controle.bloqueado_ate and controle.bloqueado_ate > agora:
        raise SincronizacaoNaoPermitidaError(
            f'Fonte bloqueada até {timezone.localtime(controle.bloqueado_ate):%d/%m/%Y %H:%M} '
            f'({controle.motivo_bloqueio or "consumo indevido"}). Nenhuma nova consulta será feita antes disso.'
        )
    if controle.proxima_consulta_em and controle.proxima_consulta_em > agora:
        raise SincronizacaoNaoPermitidaError(
            f'Intervalo obrigatório de consulta: próxima consulta permitida em '
            f'{timezone.localtime(controle.proxima_consulta_em):%d/%m/%Y %H:%M}.'
        )
    if controle.executando_desde and controle.executando_desde > agora - duracao_trava():
        raise ExecucaoConcorrenteError('Já existe uma sincronização em andamento para esta empresa e fonte.')


def _validar_certificado(config, controle):
    cert = config.certificado
    if cert is None:
        return 'Empresa sem certificado digital vinculado.'
    if cert.valido_ate < timezone.now():
        return f'Certificado vencido em {cert.valido_ate:%d/%m/%Y}.'
    info = analisar_certificado(descriptografar(cert.arquivo_cifrado),
                                descriptografar(cert.senha_cifrada).decode('utf-8'))
    compativel, motivo = compatibilidade_contribuinte(info, controle.cnpj_consultado)
    if not compativel:
        return motivo
    return ''


# --- Trava -------------------------------------------------------------------


def _adquirir_trava(controle):
    agora = timezone.now()
    token = uuid.uuid4().hex
    atualizados = ControleSincronizacao.objects.filter(pk=controle.pk).filter(
        Q(executando_desde__isnull=True) | Q(executando_desde__lt=agora - duracao_trava())
    ).update(executando_desde=agora, execucao_token=token, situacao=ControleSincronizacao.SITUACAO_EXECUTANDO)
    if not atualizados:
        raise ExecucaoConcorrenteError('Já existe uma sincronização em andamento para esta empresa e fonte.')
    return token


def _liberar_trava(controle, token):
    ControleSincronizacao.objects.filter(pk=controle.pk, execucao_token=token).update(
        executando_desde=None, execucao_token=''
    )


_CAMPOS_ESTADO = [
    'ult_nsu', 'max_nsu', 'lacunas_nsu', 'situacao', 'ultima_consulta_em', 'ultimo_sucesso_em',
    'proxima_consulta_em', 'bloqueado_ate', 'motivo_bloqueio', 'ultimo_cstat', 'ultima_mensagem',
    'documentos_recuperados', 'erros_consecutivos', 'total_erros', 'inconsistencia', 'certificado_fingerprint',
    'consultas_pontuais_janela_inicio', 'consultas_pontuais_na_janela', 'atualizado_em',
]


def _salvar(controle):
    controle.save(update_fields=_CAMPOS_ESTADO)
    token = getattr(controle, '_token_execucao', None)
    if token:
        # Renova a trava a cada lote persistido (execuções longas não são tomadas como abandonadas).
        ControleSincronizacao.objects.filter(pk=controle.pk, execucao_token=token).update(
            executando_desde=timezone.now()
        )


# --- Tratamento de respostas ---------------------------------------------------


def _registrar_erro(controle, situacao, mensagem, cstat='', espera=None, tipo_alerta='falha_sincronizacao'):
    agora = timezone.now()
    controle.situacao = situacao
    controle.ultimo_cstat = cstat
    controle.ultima_mensagem = mensagem[:2000]
    controle.erros_consecutivos += 1
    controle.total_erros += 1
    if espera is None:
        # Retentativa controlada: 15 min, 30, 60, ... até 6 horas.
        espera = timedelta(minutes=min(15 * (2 ** (controle.erros_consecutivos - 1)), 360))
    controle.proxima_consulta_em = agora + espera
    _salvar(controle)
    if controle.erros_consecutivos >= 2 or tipo_alerta != 'falha_sincronizacao':
        alertas.alerta_sincronizacao(controle, tipo_alerta, mensagem)


def _bloquear(controle, cstat, mensagem):
    agora = timezone.now()
    controle.situacao = ControleSincronizacao.SITUACAO_BLOQUEADO
    controle.bloqueado_ate = agora + duracao_bloqueio()
    controle.proxima_consulta_em = controle.bloqueado_ate
    controle.motivo_bloqueio = f'cStat {cstat}: {mensagem}'[:255]
    controle.ultimo_cstat = cstat
    controle.ultima_mensagem = mensagem[:2000]
    controle.total_erros += 1
    _salvar(controle)
    alertas.alerta_sincronizacao(controle, 'consumo_indevido', controle.motivo_bloqueio, prioridade='critica')


def _detectar_lacunas(controle, ult_anterior, nsus_recebidos, ult_retornado):
    """NSUs do interessado são sequenciais: lacunas indicam falha de distribuição."""
    if not nsus_recebidos:
        return
    esperados = set(range(int(ult_anterior) + 1, int(ult_retornado) + 1))
    faltantes = sorted(esperados - set(nsus_recebidos))
    if faltantes and len(faltantes) <= 500:
        existentes = set(controle.lacunas_nsu or [])
        controle.lacunas_nsu = sorted(existentes | {formatar_nsu(n) for n in faltantes})[:1000]


def _persistir_documentos(controle, documentos, erros, usuario=None):
    """Persiste lote: retorna quantidade nova. Deve ser chamado em transação."""
    novos = 0
    for doc in documentos:
        resultado = processar_conteudo(
            doc['conteudo'], fonte=controle.fonte, ambiente=controle.ambiente, empresa=controle.empresa,
            nsu=formatar_nsu(doc['nsu']), schema=doc.get('schema', ''), usuario=usuario,
        )
        if resultado.status in ('importado', 'atualizado'):
            novos += 1
    for erro in erros:
        # Preserva o conteúdo recebido mesmo quando não foi possível descompactar.
        RecebimentoDFe.objects.get_or_create(
            empresa=controle.empresa, fonte=controle.fonte, ambiente=controle.ambiente,
            nsu=formatar_nsu(erro['nsu']),
            defaults=dict(schema=erro.get('schema', ''), conteudo=erro.get('conteudo_base64', ''),
                          hash_conteudo='', erro=erro['erro'], processado=False, usuario=usuario),
        )
    return novos


def _ciclo_sefaz(controle, cliente, execucao, cuf_autor, usuario):
    max_lotes = _cfg('MONITOR_FISCAL_MAX_LOTES_POR_EXECUCAO', 20)
    codigo_indevido = c.CSTAT_CONSUMO_INDEVIDO.get(controle.fonte)
    for _ in range(max_lotes):
        ult_anterior = controle.ult_nsu
        retorno = cliente.consultar(cnpj=controle.cnpj_consultado, cuf_autor=cuf_autor,
                                    ult_nsu=controle.ult_nsu)
        agora = timezone.now()
        controle.ultima_consulta_em = agora
        controle.ultimo_cstat = retorno.cstat
        controle.ultima_mensagem = retorno.motivo[:2000]
        execucao.lotes += 1
        execucao.cstat = retorno.cstat
        execucao.mensagem = retorno.motivo

        if retorno.cstat == c.CSTAT_DOCUMENTOS_LOCALIZADOS:
            documentos = [{'nsu': d.nsu, 'schema': d.schema, 'conteudo': d.conteudo} for d in retorno.documentos]
            with transaction.atomic():
                novos = _persistir_documentos(controle, documentos, retorno.erros_documentos, usuario)
                nsus = [int(d.nsu) for d in retorno.documentos if d.nsu.isdigit()] + [
                    int(e['nsu']) for e in retorno.erros_documentos if str(e['nsu']).isdigit()
                ]
                ult_retornado = retorno.ult_nsu or (formatar_nsu(max(nsus)) if nsus else controle.ult_nsu)
                _detectar_lacunas(controle, ult_anterior, nsus, ult_retornado)
                if int(ult_retornado) >= int(controle.ult_nsu or 0):
                    controle.ult_nsu = formatar_nsu(ult_retornado)
                controle.max_nsu = formatar_nsu(retorno.max_nsu) if retorno.max_nsu else controle.max_nsu
                controle.documentos_recuperados += len(documentos)
                controle.erros_consecutivos = 0
                controle.ultimo_sucesso_em = agora
                controle.situacao = ControleSincronizacao.SITUACAO_AGUARDANDO
                fim = not retorno.max_nsu or int(controle.ult_nsu) >= int(retorno.max_nsu)
                if fim:
                    controle.situacao = ControleSincronizacao.SITUACAO_SINCRONIZADO
                    controle.proxima_consulta_em = agora + intervalo_sem_documentos()
                _salvar(controle)
            execucao.documentos += novos
            if fim:
                return True
            if int(controle.ult_nsu) <= int(ult_anterior or 0):
                # 138 sem avanço de NSU: não insiste (evita consumo indevido).
                controle.proxima_consulta_em = agora + intervalo_sem_documentos()
                _salvar(controle)
                return True
            continue

        if retorno.cstat == c.CSTAT_NENHUM_DOCUMENTO:
            if retorno.ult_nsu and int(retorno.ult_nsu) > int(controle.ult_nsu or 0):
                controle.ult_nsu = formatar_nsu(retorno.ult_nsu)
            if retorno.max_nsu:
                controle.max_nsu = formatar_nsu(retorno.max_nsu)
            controle.situacao = ControleSincronizacao.SITUACAO_SINCRONIZADO
            controle.proxima_consulta_em = agora + intervalo_sem_documentos()
            controle.erros_consecutivos = 0
            controle.ultimo_sucesso_em = agora
            _salvar(controle)
            return True

        if retorno.cstat == codigo_indevido:
            _bloquear(controle, retorno.cstat, retorno.motivo)
            return False

        if retorno.cstat in (c.CSTAT_PARALISADO_MOMENTANEO, c.CSTAT_PARALISADO_SEM_PREVISAO):
            espera = timedelta(minutes=15 if retorno.cstat == c.CSTAT_PARALISADO_MOMENTANEO else 60)
            _registrar_erro(controle, ControleSincronizacao.SITUACAO_INDISPONIVEL,
                            f'{retorno.cstat} - {retorno.motivo}', retorno.cstat, espera, 'indisponibilidade')
            return False

        if retorno.cstat in c.CSTAT_CERTIFICADO_INCOMPATIVEL:
            _registrar_erro(controle, ControleSincronizacao.SITUACAO_CERTIFICADO,
                            f'{retorno.cstat} - {retorno.motivo}', retorno.cstat, timedelta(hours=24))
            return False

        if retorno.cstat in c.CSTAT_NSU_SUPERIOR:
            controle.inconsistencia = (
                f'NSU local {controle.ult_nsu} superior ao maior NSU do Ambiente Nacional. Possível base '
                'restaurada ou consulta por outro sistema/ambiente. O NSU não foi reiniciado automaticamente.'
            )
            _registrar_erro(controle, ControleSincronizacao.SITUACAO_ERRO,
                            f'{retorno.cstat} - {retorno.motivo}', retorno.cstat, intervalo_sem_documentos())
            return False

        _registrar_erro(controle, ControleSincronizacao.SITUACAO_ERRO, f'{retorno.cstat} - {retorno.motivo}',
                        retorno.cstat, max(intervalo_sem_documentos(), timedelta(minutes=15)))
        return False
    # Limite de lotes por execução atingido: continua na próxima rodada, sem espera obrigatória.
    controle.situacao = ControleSincronizacao.SITUACAO_AGUARDANDO
    controle.proxima_consulta_em = timezone.now()
    _salvar(controle)
    return True


def _ciclo_adn(controle, cliente, execucao, usuario):
    max_lotes = _cfg('MONITOR_FISCAL_MAX_LOTES_POR_EXECUCAO', 20)
    for _ in range(max_lotes):
        retorno = cliente.distribuicao(ult_nsu=controle.ult_nsu, cnpj_consulta=controle.cnpj_consultado)
        agora = timezone.now()
        controle.ultima_consulta_em = agora
        controle.ultimo_cstat = retorno.status[:10] if retorno.status else str(retorno.http_status)
        execucao.lotes += 1
        execucao.cstat = controle.ultimo_cstat

        if retorno.status == 'LIMITE_EXCEDIDO':
            _bloquear(controle, 'HTTP429', 'ADN informou limite de requisições excedido.')
            return False
        if retorno.status == adn.STATUS_REJEICAO:
            mensagem = '; '.join(str(e) for e in retorno.erros)[:1000] or 'Rejeição sem detalhes.'
            _registrar_erro(controle, ControleSincronizacao.SITUACAO_ERRO, f'ADN: {mensagem}', 'REJEICAO',
                            intervalo_sem_documentos())
            return False

        atual = int(controle.ult_nsu or 0)
        novos_docs = [d for d in retorno.documentos if d.nsu.isdigit() and int(d.nsu) > atual]
        erros_novos = [e for e in retorno.erros_documentos if str(e['nsu']).isdigit() and int(e['nsu']) > atual]
        if not novos_docs and not erros_novos:
            controle.situacao = ControleSincronizacao.SITUACAO_SINCRONIZADO
            controle.proxima_consulta_em = agora + intervalo_sem_documentos()
            controle.erros_consecutivos = 0
            controle.ultimo_sucesso_em = agora
            controle.ultima_mensagem = 'Nenhum documento novo localizado no ADN.'
            _salvar(controle)
            return True

        with transaction.atomic():
            documentos = [{'nsu': d.nsu, 'schema': d.tipo_documento, 'conteudo': d.conteudo} for d in novos_docs]
            novos = _persistir_documentos(controle, documentos, erros_novos, usuario)
            maior = max([int(d.nsu) for d in novos_docs] + [int(e['nsu']) for e in erros_novos])
            controle.ult_nsu = formatar_nsu(maior)
            controle.documentos_recuperados += len(documentos)
            controle.erros_consecutivos = 0
            controle.ultimo_sucesso_em = agora
            controle.situacao = ControleSincronizacao.SITUACAO_AGUARDANDO
            controle.ultima_mensagem = f'{len(documentos)} documento(s) recebido(s) do ADN.'
            _salvar(controle)
        execucao.documentos += novos
    controle.proxima_consulta_em = timezone.now()
    _salvar(controle)
    return True


# --- Execução -------------------------------------------------------------------


def codigo_uf_autor(config):
    """cUFAutor: código configurado no Monitor ou, na falta, a UF do cadastro da empresa."""
    codigo = somente_digitos(config.codigo_uf or '')
    if codigo:
        return codigo
    sigla = (getattr(config.empresa, 'uf', '') or '').strip().upper()
    return c.CODIGO_UF_POR_SIGLA.get(sigla, '')


def _exigir_uf(config, controle):
    if controle.fonte == c.FONTE_ADN_NFSE:
        return ''
    codigo = codigo_uf_autor(config)
    if not codigo:
        raise SincronizacaoNaoPermitidaError(
            'Informe a UF da empresa (cadastro ou configuração do Monitor Fiscal) para consultar a SEFAZ.'
        )
    return codigo


def sincronizar(controle, origem='automatica', usuario=None, transporte=None):
    """Executa a sincronização de um controle. Retorna ExecucaoSincronizacao."""
    controle.refresh_from_db()
    config = ConfiguracaoMonitorFiscal.objects.select_related('certificado', 'empresa').get(empresa=controle.empresa)
    if not config.ativo or not config.fonte_habilitada(controle.fonte):
        raise SincronizacaoNaoPermitidaError('Monitoramento desta fonte está desabilitado para a empresa.')
    if config.ambiente != controle.ambiente:
        raise SincronizacaoNaoPermitidaError('Controle pertence a outro ambiente fiscal.')
    if not ambiente_permitido(controle.ambiente):
        raise SincronizacaoNaoPermitidaError(mensagem_bloqueio(controle.ambiente))
    verificar_permissao_consulta(controle)
    cuf_autor = _exigir_uf(config, controle)

    erro_certificado = _validar_certificado(config, controle)
    if erro_certificado:
        controle.situacao = ControleSincronizacao.SITUACAO_CERTIFICADO
        controle.ultima_mensagem = erro_certificado
        controle.save(update_fields=['situacao', 'ultima_mensagem', 'atualizado_em'])
        raise SincronizacaoNaoPermitidaError(erro_certificado)

    token = _adquirir_trava(controle)
    controle.refresh_from_db()
    controle._token_execucao = token
    execucao = ExecucaoSincronizacao.objects.create(
        controle=controle, origem=origem, usuario=usuario, nsu_inicial=controle.ult_nsu,
    )
    try:
        if controle.certificado_fingerprint != config.certificado.fingerprint_sha256:
            # A sequência de NSU pertence ao contribuinte; trocar o certificado não a reinicia.
            controle.certificado_fingerprint = config.certificado.fingerprint_sha256
        transporte = transporte or TransporteMTLS(config.certificado)
        if controle.fonte == c.FONTE_ADN_NFSE:
            sucesso = _ciclo_adn(controle, adn.ClienteADN(transporte, controle.ambiente), execucao, usuario)
        else:
            cliente = ClienteDistribuicao(controle.fonte, transporte, controle.ambiente)
            sucesso = _ciclo_sefaz(controle, cliente, execucao, cuf_autor, usuario)
        execucao.sucesso = sucesso
    except ComunicacaoError as exc:
        _registrar_erro(controle, ControleSincronizacao.SITUACAO_INDISPONIVEL, str(exc), '', None, 'indisponibilidade'
                        if controle.erros_consecutivos >= 1 else 'falha_sincronizacao')
        execucao.mensagem = str(exc)
        execucao.sucesso = False
    except Exception as exc:  # noqa: BLE001 - falha inesperada não pode deixar a trava presa
        logger.exception('Falha na sincronização do controle %s', controle.pk)
        _registrar_erro(controle, ControleSincronizacao.SITUACAO_ERRO, f'Erro interno: {type(exc).__name__}: {exc}')
        execucao.mensagem = f'Erro interno: {type(exc).__name__}'
        execucao.sucesso = False
    finally:
        controle.refresh_from_db(fields=['ult_nsu'])
        execucao.nsu_final = controle.ult_nsu
        execucao.finalizado_em = timezone.now()
        execucao.save()
        _liberar_trava(controle, token)
        ControleSincronizacao.objects.filter(pk=controle.pk, situacao=ControleSincronizacao.SITUACAO_EXECUTANDO).update(
            situacao=ControleSincronizacao.SITUACAO_AGUARDANDO
        )
    if controle.fonte == c.FONTE_AN_NFE:
        transmitir_ciencias_pendentes(config)
    return execucao


def transmitir_ciencias_pendentes(config, limite=20):
    """Transmite ciências automáticas pendentes (somente com autorização registrada)."""
    from .manifestacao import transmitir
    from .models import Manifestacao

    if not (config.ciencia_automatica and config.ciencia_autorizada_em):
        return 0
    pendentes = Manifestacao.objects.filter(
        documento__empresa=config.empresa, documento__ambiente=config.ambiente,
        tipo_evento=c.EVENTO_CIENCIA, automatica=True, situacao='pendente',
    )[:limite]
    total = 0
    for manifestacao in pendentes:
        transmitir(manifestacao)
        total += 1
    return total


def consulta_pontual(controle, *, nsu=None, chave=None, usuario=None, transporte=None):
    """consNSU / consChNFe com limite próprio, sem substituir a distribuição sequencial."""
    if controle.fonte == c.FONTE_ADN_NFSE:
        raise SincronizacaoNaoPermitidaError('Consulta pontual por NSU não confirmada na API do ADN.')
    if chave and controle.fonte != c.FONTE_AN_NFE:
        raise SincronizacaoNaoPermitidaError('Consulta por chave disponível somente para NF-e (consChNFe).')
    agora = timezone.now()
    if not ambiente_permitido(controle.ambiente):
        raise SincronizacaoNaoPermitidaError(mensagem_bloqueio(controle.ambiente))
    if controle.bloqueado_ate and controle.bloqueado_ate > agora:
        raise SincronizacaoNaoPermitidaError('Fonte bloqueada por consumo indevido.')
    limite = _cfg('MONITOR_FISCAL_CONSULTAS_PONTUAIS_POR_HORA', 20)
    with transaction.atomic():
        bloqueado = ControleSincronizacao.objects.select_for_update().get(pk=controle.pk)
        if not bloqueado.consultas_pontuais_janela_inicio or agora - bloqueado.consultas_pontuais_janela_inicio > timedelta(hours=1):
            bloqueado.consultas_pontuais_janela_inicio = agora
            bloqueado.consultas_pontuais_na_janela = 0
        if bloqueado.consultas_pontuais_na_janela >= limite:
            raise SincronizacaoNaoPermitidaError(f'Limite de {limite} consultas pontuais por hora atingido.')
        bloqueado.consultas_pontuais_na_janela += 1
        bloqueado.save(update_fields=['consultas_pontuais_janela_inicio', 'consultas_pontuais_na_janela'])
    controle.refresh_from_db()
    config = ConfiguracaoMonitorFiscal.objects.select_related('certificado', 'empresa').get(empresa=controle.empresa)
    cuf_autor = _exigir_uf(config, controle)
    erro_certificado = _validar_certificado(config, controle)
    if erro_certificado:
        raise SincronizacaoNaoPermitidaError(erro_certificado)
    cliente = ClienteDistribuicao(controle.fonte, transporte or TransporteMTLS(config.certificado), controle.ambiente)
    retorno = cliente.consultar(cnpj=controle.cnpj_consultado, cuf_autor=cuf_autor, nsu=nsu, chave=chave)
    controle.ultima_consulta_em = agora
    controle.ultimo_cstat = retorno.cstat
    controle.ultima_mensagem = f'Consulta pontual: {retorno.motivo}'[:2000]
    if retorno.cstat == c.CSTAT_CONSUMO_INDEVIDO.get(controle.fonte):
        _bloquear(controle, retorno.cstat, retorno.motivo)
        return retorno, 0
    novos = 0
    if retorno.cstat == c.CSTAT_DOCUMENTOS_LOCALIZADOS:
        with transaction.atomic():
            documentos = [{'nsu': d.nsu, 'schema': d.schema, 'conteudo': d.conteudo} for d in retorno.documentos]
            if chave:
                # consChNFe não faz parte da sequência de NSU: registra sem NSU para não colidir.
                for doc in documentos:
                    resultado = processar_conteudo(doc['conteudo'], fonte=controle.fonte, ambiente=controle.ambiente,
                                                   empresa=controle.empresa, schema=doc['schema'], usuario=usuario)
                    novos += resultado.status in ('importado', 'atualizado')
            else:
                novos = _persistir_documentos(controle, documentos, retorno.erros_documentos, usuario)
    if nsu is not None and retorno.cstat in (c.CSTAT_DOCUMENTOS_LOCALIZADOS, c.CSTAT_NENHUM_DOCUMENTO):
        controle.lacunas_nsu = [n for n in (controle.lacunas_nsu or []) if n != formatar_nsu(nsu)]
    _salvar(controle)
    return retorno, novos


def controles_pendentes(agora=None):
    agora = agora or timezone.now()
    for config in ConfiguracaoMonitorFiscal.objects.select_related('empresa').filter(ativo=True):
        garantir_controles(config)
    return ControleSincronizacao.objects.select_related('empresa').filter(
        empresa__monitor_fiscal__ativo=True,
    ).exclude(situacao=ControleSincronizacao.SITUACAO_DESATIVADO).filter(
        Q(bloqueado_ate__isnull=True) | Q(bloqueado_ate__lte=agora),
        Q(proxima_consulta_em__isnull=True) | Q(proxima_consulta_em__lte=agora),
        Q(executando_desde__isnull=True) | Q(executando_desde__lt=agora - duracao_trava()),
    ).filter(ambiente=models_ambiente_config(), ambiente__in=ambientes_permitidos()).order_by('proxima_consulta_em')


def models_ambiente_config():
    from django.db.models import F
    return F('empresa__monitor_fiscal__ambiente')


def executar_rodada(max_workers=None, empresa_ids=None, fontes=None):
    """Executa todos os controles com consulta permitida, em paralelo por empresa."""
    from concurrent.futures import ThreadPoolExecutor

    controles = list(controles_pendentes())
    if empresa_ids:
        controles = [ct for ct in controles if ct.empresa_id in set(empresa_ids)]
    if fontes:
        controles = [ct for ct in controles if ct.fonte in set(fontes)]
    controles = [ct for ct in controles
                 if ct.empresa.monitor_fiscal.fonte_habilitada(ct.fonte)]
    resultados = []

    def _executar(controle_id):
        close_old_connections()
        try:
            controle = ControleSincronizacao.objects.select_related('empresa').get(pk=controle_id)
            execucao = sincronizar(controle)
            return controle_id, execucao.sucesso, execucao.mensagem or execucao.cstat
        except SincronizacaoNaoPermitidaError as exc:
            return controle_id, False, str(exc)
        except Exception as exc:  # noqa: BLE001
            logger.exception('Falha ao executar controle %s', controle_id)
            return controle_id, False, f'{type(exc).__name__}'
        finally:
            close_old_connections()

    workers = max_workers or _cfg('MONITOR_FISCAL_EXECUCOES_PARALELAS', 4)
    if workers <= 1:
        for controle in controles:
            resultados.append(_executar(controle.pk))
    else:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            resultados = list(executor.map(_executar, [ct.pk for ct in controles]))
    return resultados
