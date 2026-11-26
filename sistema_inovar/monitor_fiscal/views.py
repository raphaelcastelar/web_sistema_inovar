import logging
import threading
from datetime import timedelta
from decimal import Decimal

from django.db import close_old_connections, transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from empresas.models import Empresa

from . import alertas as modulo_alertas
from . import constantes as c
from . import exportacao, importacao, manifestacao, sincronizacao
from .ambiente import ambiente_padrao, ambientes_permitidos
from .auditoria import auditar_empresa
from .auditoria_log import registrar
from .certificados import CertificadoInvalidoError, analisar_certificado, compatibilidade_contribuinte, validar_para_uso
from .models import (
    AlertaFiscal, CertificadoDigital, ConfiguracaoMonitorFiscal, ControleSincronizacao, DocumentoFiscal,
    ExecucaoSincronizacao, ImportacaoManual, ItemDocumentoFiscal, Manifestacao, OcorrenciaAuditoria,
    PendenciaVinculo, PreferenciaAlerta, RegistroAuditoria,
)
from .permissoes import empresas_acessiveis, permissoes_do_usuario, requer, tem_permissao
from .processador import somente_digitos
from .seguranca import criptografar
from .serializers import (
    AlertaSerializer, CertificadoSerializer, ConfiguracaoSerializer, ControleSerializer, DocumentoDetalheSerializer,
    DocumentoListaSerializer, ExecucaoSerializer, ImportacaoSerializer, ManifestacaoSerializer, OcorrenciaSerializer,
    PendenciaVinculoSerializer, RegistroAuditoriaSerializer,
)

logger = logging.getLogger(__name__)

TAMANHO_MAXIMO_UPLOAD = 100 * 1024 * 1024


class Paginacao(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 500


def _origem(request):
    return (request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
            or request.META.get('REMOTE_ADDR', ''))[:80]


def _empresa_autorizada(request, empresa_id):
    return get_object_or_404(empresas_acessiveis(request.user), pk=empresa_id)


def _config(empresa):
    config, _ = ConfiguracaoMonitorFiscal.objects.get_or_create(
        empresa=empresa, defaults={'ambiente': ambiente_padrao()},
    )
    return config


# --- Permissões e cobertura -----------------------------------------------------


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def minhas_permissoes(request):
    return Response({
        'permissoes': permissoes_do_usuario(request.user),
        'integracoes': situacao_integracoes(),
        'ambiente_padrao': ambiente_padrao(),
        'ambientes_permitidos': ambientes_permitidos(),
    })


def situacao_integracoes():
    """Estado declarado de cada integração. Atualize somente após validação real."""
    return [
        {'fonte': c.FONTE_AN_NFE, 'nome': 'NF-e (NFeDistribuicaoDFe)', 'implementada': True,
         'homologacao': 'não validada', 'producao': 'não validada',
         'observacao': 'Distribui documentos de interesse por até 90 dias; não inclui NF-e emitidas pela própria empresa.'},
        {'fonte': 'MANIFESTACAO', 'nome': 'Manifestação do destinatário (NFeRecepcaoEvento4 - AN)', 'implementada': True,
         'homologacao': 'não validada', 'producao': 'não validada', 'observacao': ''},
        {'fonte': c.FONTE_AN_CTE, 'nome': 'CT-e (CTeDistribuicaoDFe)', 'implementada': True,
         'homologacao': 'não validada', 'producao': 'não validada',
         'observacao': 'Não distribui CT-e emitidos pela própria empresa.'},
        {'fonte': c.FONTE_ADN_NFSE, 'nome': 'NFS-e (ADN - API de Contribuintes)', 'implementada': True,
         'homologacao': 'não validada', 'producao': 'não validada',
         'observacao': 'Parâmetros e campos JSON pendentes de confirmação no Swagger oficial (exige certificado). '
                       'Cobertura depende da adesão do município ao padrão nacional.'},
        {'fonte': c.FONTE_AN_MDFE, 'nome': 'MDF-e (MDFeDistribuicaoDFe)', 'implementada': True,
         'homologacao': 'não validada', 'producao': 'não validada',
         'observacao': 'Distribui somente a autorizados no XML, contratantes e proprietários de veículos. Opcional.'},
    ]


# --- Empresas e configuração ------------------------------------------------------


def _resumo_empresa(empresa, config, controles):
    return {
        'id': empresa.id, 'nome': empresa.nome, 'razao_social': empresa.razao_social, 'cnpj': empresa.cnpj,
        'uf': empresa.uf, 'cidade': empresa.cidade, 'regime_tributario': empresa.regime_tributario,
        'configuracao': ConfiguracaoSerializer(config).data if config else None,
        'controles': ControleSerializer(controles, many=True).data,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('view_documentofiscal')])
def empresas_monitoradas(request):
    empresas = empresas_acessiveis(request.user).filter(ativo=True).order_by('nome')
    busca = request.query_params.get('busca')
    if busca:
        digitos = somente_digitos(busca)
        filtro = Q(nome__icontains=busca)
        if digitos:
            filtro |= Q(cnpj__icontains=digitos) | Q(cnpj__icontains=busca)
        empresas = empresas.filter(filtro)
    configs = {cfg.empresa_id: cfg for cfg in ConfiguracaoMonitorFiscal.objects.select_related('certificado').filter(
        empresa__in=empresas)}
    controles = {}
    for controle in ControleSincronizacao.objects.filter(empresa__in=empresas):
        cfg = configs.get(controle.empresa_id)
        if cfg and controle.ambiente == cfg.ambiente:
            controles.setdefault(controle.empresa_id, []).append(controle)
    return Response([_resumo_empresa(e, configs.get(e.id), controles.get(e.id, [])) for e in empresas])


_CAMPOS_ATIVACAO = {'ativo', 'ambiente', 'data_inicio', 'monitorar_nfe', 'monitorar_nfse', 'monitorar_cte',
                    'monitorar_mdfe', 'monitorar_eventos'}
_CAMPOS_CIENCIA = {'ciencia_automatica', 'ciencia_autorizacao_descricao'}
_CAMPOS_ALERTA = {'alertas_fiscais', 'alertas_certificado', 'dias_alerta_certificado'}
_CAMPOS_CADASTRO = {'inscricao_estadual', 'inscricao_municipal', 'codigo_ibge_municipio', 'codigo_uf'}


def _aplicar_configuracao(request, empresa, dados):
    campos = set(dados)
    if campos & _CAMPOS_ATIVACAO and not tem_permissao(request.user, 'ativar_monitoramento'):
        return None, 'Sem permissão para ativar ou alterar o monitoramento.'
    if campos & _CAMPOS_CIENCIA and not tem_permissao(request.user, 'configurar_ciencia_automatica'):
        return None, 'Sem permissão para configurar a ciência automática.'
    if campos & _CAMPOS_ALERTA and not tem_permissao(request.user, 'gerenciar_alertas'):
        return None, 'Sem permissão para configurar alertas.'
    if campos & _CAMPOS_CADASTRO and not tem_permissao(request.user, 'configurar_integracoes'):
        return None, 'Sem permissão para alterar dados da integração.'
    if 'certificado' in campos and not tem_permissao(request.user, 'gerenciar_certificados'):
        return None, 'Sem permissão para vincular certificados.'

    config = _config(empresa)
    antes = ConfiguracaoSerializer(config).data
    serializer = ConfiguracaoSerializer(config, data=dados, partial=True)
    if not serializer.is_valid():
        return None, serializer.errors
    if dados.get('ciencia_automatica') is True:
        descricao = (dados.get('ciencia_autorizacao_descricao') or config.ciencia_autorizacao_descricao or '').strip()
        if len(descricao) < 10:
            return None, ('A ciência automática exige o registro da autorização do contribuinte '
                          '(identifique quem autorizou e o documento de autorização).')
    if 'certificado' in dados and dados['certificado']:
        cert = CertificadoDigital.objects.filter(pk=dados['certificado'], ativo=True).first()
        if cert is None:
            return None, 'Certificado não encontrado ou inativo.'
        if cert.cnpj[:8] != somente_digitos(empresa.cnpj)[:8]:
            return None, ('O CNPJ raiz do certificado difere do CNPJ da empresa. Os serviços de distribuição '
                          'autenticam pelo CNPJ base; certificado de escritório não consulta clientes.')
    with transaction.atomic():
        config = serializer.save(atualizado_por=request.user)
        if dados.get('ciencia_automatica') is True and not antes.get('ciencia_automatica'):
            config.ciencia_autorizada_por = request.user
            config.ciencia_autorizada_em = timezone.now()
            config.save(update_fields=['ciencia_autorizada_por', 'ciencia_autorizada_em'])
        elif dados.get('ciencia_automatica') is False:
            config.ciencia_autorizada_em = None
            config.ciencia_autorizada_por = None
            config.save(update_fields=['ciencia_autorizada_por', 'ciencia_autorizada_em'])
        if config.ativo and not config.data_inicio:
            config.data_inicio = timezone.localdate()
            config.save(update_fields=['data_inicio'])
        sincronizacao.garantir_controles(config)
    registrar(request.user, empresa, 'configuracao_monitor_fiscal', origem=_origem(request),
              antes=antes, depois=ConfiguracaoSerializer(config).data)
    return config, None


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated, requer('view_documentofiscal')])
def configuracao_empresa(request, empresa_id):
    empresa = _empresa_autorizada(request, empresa_id)
    if request.method == 'GET':
        config = _config(empresa)
        controles = ControleSincronizacao.objects.filter(empresa=empresa, ambiente=config.ambiente)
        return Response(_resumo_empresa(empresa, config, controles))
    config, erro = _aplicar_configuracao(request, empresa, request.data)
    if erro:
        negado = isinstance(erro, str) and erro.startswith('Sem permissão')
        return Response({'erro': erro}, status=status.HTTP_403_FORBIDDEN if negado else status.HTTP_400_BAD_REQUEST)
    controles = ControleSincronizacao.objects.filter(empresa=empresa, ambiente=config.ambiente)
    return Response(_resumo_empresa(empresa, config, controles))


@api_view(['POST'])
@permission_classes([IsAuthenticated, requer('view_documentofiscal')])
def configuracao_lote(request):
    ids = request.data.get('empresa_ids') or []
    dados = request.data.get('configuracao') or {}
    if not isinstance(ids, list) or not ids or not isinstance(dados, dict):
        return Response({'erro': 'Informe empresa_ids e configuracao.'}, status=status.HTTP_400_BAD_REQUEST)
    dados.pop('certificado', None)  # vínculo de certificado é individual (CNPJ raiz)
    resultados = []
    for empresa in empresas_acessiveis(request.user).filter(pk__in=ids):
        config, erro = _aplicar_configuracao(request, empresa, dados)
        resultados.append({'empresa_id': empresa.id, 'nome': empresa.nome, 'sucesso': not erro, 'erro': erro})
    return Response({'resultados': resultados})


# --- Certificados -------------------------------------------------------------------


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, requer('gerenciar_certificados')])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def certificados(request):
    if request.method == 'GET':
        acessiveis = empresas_acessiveis(request.user)
        raizes = {somente_digitos(e.cnpj)[:8] for e in acessiveis}
        lista = [cert for cert in CertificadoDigital.objects.all() if cert.cnpj[:8] in raizes or cert.criado_por_id == request.user.id]
        return Response(CertificadoSerializer(lista, many=True).data)

    arquivo = request.FILES.get('arquivo')
    senha = request.data.get('senha') or ''
    if not arquivo:
        return Response({'erro': 'Envie o arquivo PFX/P12.'}, status=status.HTTP_400_BAD_REQUEST)
    if not arquivo.name.lower().endswith(('.pfx', '.p12')):
        return Response({'erro': 'Formato não suportado. Envie PFX ou P12.'}, status=status.HTTP_400_BAD_REQUEST)
    conteudo = arquivo.read(64 * 1024 + 1)
    try:
        info = analisar_certificado(conteudo, senha)
    except CertificadoInvalidoError as exc:
        registrar(request.user, None, 'certificado_upload', origem=_origem(request), resultado='rejeitado',
                  detalhes={'arquivo': arquivo.name, 'motivo': str(exc)})
        return Response({'erro': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    erros = validar_para_uso(info)
    if erros:
        return Response({'erro': ' '.join(erros), 'alertas': info.alertas}, status=status.HTTP_400_BAD_REQUEST)

    empresa_ids = request.data.getlist('empresa_ids') if hasattr(request.data, 'getlist') else request.data.get('empresa_ids', [])
    empresas = list(empresas_acessiveis(request.user).filter(pk__in=[i for i in empresa_ids if str(i).isdigit()]))
    incompativeis = []
    for empresa in empresas:
        compativel, motivo = compatibilidade_contribuinte(info, empresa.cnpj)
        if not compativel:
            incompativeis.append({'empresa': empresa.nome, 'motivo': motivo})
    if incompativeis:
        return Response({'erro': 'Certificado incompatível com empresa(s) selecionada(s).',
                         'incompatibilidades': incompativeis}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        cert = CertificadoDigital.objects.create(
            titular=info.titular[:255], cnpj=info.cnpj, cpf=info.cpf, emissor=info.emissor[:255],
            numero_serie=info.numero_serie, fingerprint_sha256=info.fingerprint_sha256,
            valido_de=info.valido_de, valido_ate=info.valido_ate, autenticacao_cliente=info.autenticacao_cliente,
            cadeia_icp_brasil=info.cadeia_icp_brasil, alertas_validacao=info.alertas,
            arquivo_cifrado=criptografar(conteudo), senha_cifrada=criptografar(senha.encode('utf-8')),
            nome_arquivo=arquivo.name[:255], criado_por=request.user,
        )
        for empresa in empresas:
            config = _config(empresa)
            anterior = config.certificado
            config.certificado = cert
            config.atualizado_por = request.user
            config.save(update_fields=['certificado', 'atualizado_por', 'atualizado_em'])
            if anterior and anterior.pk != cert.pk and not anterior.configuracoes.exists():
                anterior.substituido_por = cert
                anterior.save(update_fields=['substituido_por'])
            # Controles de NSU são preservados: a sequência pertence ao contribuinte.
            ControleSincronizacao.objects.filter(
                empresa=empresa, situacao=ControleSincronizacao.SITUACAO_CERTIFICADO,
            ).update(situacao=ControleSincronizacao.SITUACAO_AGUARDANDO, proxima_consulta_em=None)
    registrar(request.user, None, 'certificado_upload', origem=_origem(request),
              detalhes={'certificado': cert.pk, 'titular': cert.titular, 'cnpj': cert.cnpj,
                        'valido_ate': cert.valido_ate.isoformat(), 'empresas': [e.pk for e in empresas]})
    return Response(CertificadoSerializer(cert).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated, requer('gerenciar_certificados')])
def vincular_certificado(request, certificado_id):
    cert = get_object_or_404(CertificadoDigital, pk=certificado_id, ativo=True)
    ids = request.data.get('empresa_ids') or []
    resultados = []
    for empresa in empresas_acessiveis(request.user).filter(pk__in=ids):
        _, erro = _aplicar_configuracao(request, empresa, {'certificado': cert.pk})
        if not erro:
            ControleSincronizacao.objects.filter(
                empresa=empresa, situacao=ControleSincronizacao.SITUACAO_CERTIFICADO,
            ).update(situacao=ControleSincronizacao.SITUACAO_AGUARDANDO, proxima_consulta_em=None)
        resultados.append({'empresa_id': empresa.pk, 'nome': empresa.nome, 'sucesso': not erro, 'erro': erro})
    return Response({'resultados': resultados})


@api_view(['POST'])
@permission_classes([IsAuthenticated, requer('gerenciar_certificados')])
def desativar_certificado(request, certificado_id):
    cert = get_object_or_404(CertificadoDigital, pk=certificado_id)
    cert.ativo = False
    cert.save(update_fields=['ativo'])
    ConfiguracaoMonitorFiscal.objects.filter(certificado=cert).update(certificado=None)
    registrar(request.user, None, 'certificado_desativar', origem=_origem(request), detalhes={'certificado': cert.pk})
    return Response({'mensagem': 'Certificado desativado. Os documentos e os controles de NSU foram preservados.'})


# --- Sincronização ------------------------------------------------------------------


@api_view(['POST'])
@permission_classes([IsAuthenticated, requer('solicitar_sincronizacao')])
def sincronizar_empresa(request, empresa_id):
    empresa = _empresa_autorizada(request, empresa_id)
    config = _config(empresa)
    if not config.ativo:
        return Response({'erro': 'Monitoramento desativado para esta empresa.'}, status=status.HTTP_400_BAD_REQUEST)
    fontes = request.data.get('fontes') or [f for f in c.FONTES_DISTRIBUICAO if config.fonte_habilitada(f)]
    resultados = []
    for controle in sincronizacao.garantir_controles(config):
        if controle.fonte not in fontes or not config.fonte_habilitada(controle.fonte):
            continue
        try:
            execucao = sincronizacao.sincronizar(controle, origem='manual', usuario=request.user)
            controle.refresh_from_db()
            resultados.append({'fonte': controle.fonte, 'executado': True, 'sucesso': execucao.sucesso,
                               'documentos': execucao.documentos, 'mensagem': controle.ultima_mensagem})
        except sincronizacao.SincronizacaoNaoPermitidaError as exc:
            resultados.append({'fonte': controle.fonte, 'executado': False, 'sucesso': False, 'mensagem': str(exc)})
    registrar(request.user, empresa, 'sincronizacao_manual', origem=_origem(request), detalhes={'resultados': resultados})
    return Response({'resultados': resultados})


@api_view(['POST'])
@permission_classes([IsAuthenticated, requer('solicitar_sincronizacao')])
def sincronizar_lote(request):
    ids = [e.pk for e in empresas_acessiveis(request.user).filter(pk__in=request.data.get('empresa_ids') or [])]
    if not ids:
        return Response({'erro': 'Nenhuma empresa autorizada informada.'}, status=status.HTTP_400_BAD_REQUEST)

    def _executar():
        close_old_connections()
        try:
            sincronizacao.executar_rodada(empresa_ids=ids)
        finally:
            close_old_connections()

    threading.Thread(target=_executar, daemon=True, name='monitor-fiscal-lote').start()
    registrar(request.user, None, 'sincronizacao_lote', origem=_origem(request), detalhes={'empresas': ids})
    return Response({'mensagem': 'Sincronização em lote iniciada. Empresas em intervalo obrigatório ou bloqueadas '
                                 'serão consultadas somente quando permitido.', 'empresas': ids},
                    status=status.HTTP_202_ACCEPTED)


@api_view(['POST'])
@permission_classes([IsAuthenticated, requer('solicitar_sincronizacao')])
def consulta_pontual(request, controle_id):
    controle = get_object_or_404(ControleSincronizacao, pk=controle_id,
                                 empresa__in=empresas_acessiveis(request.user))
    nsu = request.data.get('nsu')
    chave = somente_digitos(request.data.get('chave') or '')
    if not nsu and not chave:
        return Response({'erro': 'Informe nsu ou chave.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        retorno, novos = sincronizacao.consulta_pontual(controle, nsu=nsu if nsu else None, chave=chave or None,
                                                        usuario=request.user)
    except sincronizacao.SincronizacaoNaoPermitidaError as exc:
        return Response({'erro': str(exc)}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    except Exception as exc:  # noqa: BLE001
        return Response({'erro': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
    registrar(request.user, controle.empresa, 'consulta_pontual', origem=_origem(request),
              detalhes={'nsu': nsu, 'chave': chave, 'cstat': retorno.cstat})
    return Response({'cstat': retorno.cstat, 'motivo': retorno.motivo, 'documentos': novos})


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('view_documentofiscal')])
def execucoes(request, controle_id):
    controle = get_object_or_404(ControleSincronizacao, pk=controle_id,
                                 empresa__in=empresas_acessiveis(request.user))
    return Response(ExecucaoSerializer(controle.execucoes.all()[:100], many=True).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('view_documentofiscal')])
def painel_monitoramento(request):
    empresas = empresas_acessiveis(request.user).filter(ativo=True)
    agora = timezone.now()
    configs = ConfiguracaoMonitorFiscal.objects.filter(empresa__in=empresas).select_related('certificado')
    ativas = configs.filter(ativo=True)
    controles = ControleSincronizacao.objects.filter(empresa__in=ativas.values('empresa'))
    ambiente = int(request.query_params.get('ambiente') or ambiente_padrao())
    docs = DocumentoFiscal.objects.filter(empresa__in=empresas, ambiente=ambiente)
    hoje = timezone.localdate()
    S = ControleSincronizacao
    return Response({
        'total_empresas': empresas.count(),
        'monitoramento_ativo': ativas.count(),
        'sem_certificado': ativas.filter(certificado__isnull=True).count(),
        'certificados_vencidos': ativas.filter(certificado__valido_ate__lt=agora).count(),
        'certificados_vencendo': ativas.filter(certificado__valido_ate__gte=agora,
                                               certificado__valido_ate__lte=agora + timedelta(days=30)).count(),
        'empresas_sincronizadas': controles.filter(situacao=S.SITUACAO_SINCRONIZADO).values('empresa').distinct().count(),
        'empresas_aguardando': controles.filter(situacao=S.SITUACAO_AGUARDANDO).values('empresa').distinct().count(),
        'empresas_com_erro': controles.filter(situacao__in=[S.SITUACAO_ERRO, S.SITUACAO_CERTIFICADO, S.SITUACAO_INDISPONIVEL]).values('empresa').distinct().count(),
        'empresas_bloqueadas': controles.filter(bloqueado_ate__gt=agora).values('empresa').distinct().count(),
        'documentos_hoje': docs.filter(capturado_em__date=hoje).count(),
        'documentos_mes': docs.filter(capturado_em__year=hoje.year, capturado_em__month=hoje.month).count(),
        'xmls_pendentes': docs.filter(situacao_xml='resumo').count(),
        'manifestacoes_pendentes': docs.filter(situacao_manifestacao__in=['nao_manifestada', 'ciencia']).exclude(situacao_fiscal='cancelado').count(),
        'integracoes': situacao_integracoes(),
        'ambiente': ambiente,
    })


# --- Documentos ---------------------------------------------------------------------------


def _filtrar_documentos(request):
    p = request.query_params
    qs = DocumentoFiscal.objects.filter(empresa__in=empresas_acessiveis(request.user)).select_related('empresa')
    qs = qs.filter(ambiente=int(p.get('ambiente') or ambiente_padrao()))
    if p.get('empresa'):
        qs = qs.filter(empresa_id=p['empresa'])
    if p.get('estabelecimento'):
        qs = qs.filter(cnpj_estabelecimento=somente_digitos(p['estabelecimento']))
    for campo, filtro in (('tipo_documento', 'tipo_documento__in'), ('classificacao', 'classificacao__in'),
                          ('situacao_fiscal', 'situacao_fiscal__in'), ('situacao_xml', 'situacao_xml__in'),
                          ('situacao_manifestacao', 'situacao_manifestacao__in'),
                          ('situacao_conferencia', 'situacao_conferencia__in')):
        if p.get(campo):
            qs = qs.filter(**{filtro: p[campo].split(',')})
    if p.get('origem'):
        qs = qs.filter(fontes__icontains=p['origem'])
    for campo, filtro in (('emissao_inicio', 'data_emissao__date__gte'), ('emissao_fim', 'data_emissao__date__lte'),
                          ('captura_inicio', 'capturado_em__date__gte'), ('captura_fim', 'capturado_em__date__lte')):
        if p.get(campo) and parse_date(p[campo]):
            qs = qs.filter(**{filtro: parse_date(p[campo])})
    if p.get('competencia'):  # AAAA-MM
        try:
            ano, mes = p['competencia'].split('-')[:2]
            qs = qs.filter(competencia__year=int(ano), competencia__month=int(mes))
        except ValueError:
            pass
    if p.get('chave'):
        qs = qs.filter(chave__icontains=somente_digitos(p['chave']))
    if p.get('numero'):
        qs = qs.filter(numero=p['numero'].lstrip('0') or '0')
    if p.get('serie'):
        qs = qs.filter(serie=p['serie'])
    if p.get('emitente'):
        qs = qs.filter(Q(emitente_nome__icontains=p['emitente']) | Q(emitente_documento__icontains=somente_digitos(p['emitente']) or p['emitente']))
    if p.get('destinatario'):
        qs = qs.filter(Q(destinatario_nome__icontains=p['destinatario']) | Q(destinatario_documento__icontains=somente_digitos(p['destinatario']) or p['destinatario']))
    if p.get('documento'):
        d = somente_digitos(p['documento'])
        qs = qs.filter(Q(emitente_documento=d) | Q(destinatario_documento=d))
    if p.get('municipio'):
        qs = qs.filter(Q(municipio_nome__icontains=p['municipio']) | Q(municipio_codigo=p['municipio']))
    if p.get('valor_min'):
        qs = qs.filter(valor_total__gte=Decimal(p['valor_min']))
    if p.get('valor_max'):
        qs = qs.filter(valor_total__lte=Decimal(p['valor_max']))
    if p.get('ids'):
        qs = qs.filter(pk__in=[i for i in p['ids'].split(',') if i.isdigit()])
    ordenacao = p.get('ordenacao') or '-data_emissao'
    permitidas = {'data_emissao', 'valor_total', 'numero', 'capturado_em', 'emitente_nome', 'empresa__nome'}
    if ordenacao.lstrip('-') in permitidas:
        qs = qs.order_by(ordenacao, '-id')
    return qs


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('view_documentofiscal')])
def documentos(request):
    paginador = Paginacao()
    pagina = paginador.paginate_queryset(_filtrar_documentos(request), request)
    return paginador.get_paginated_response(DocumentoListaSerializer(pagina, many=True).data)


def _documento_autorizado(request, documento_id):
    return get_object_or_404(
        DocumentoFiscal.objects.select_related('empresa'),
        pk=documento_id, empresa__in=empresas_acessiveis(request.user),
    )


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated, requer('view_documentofiscal')])
def documento_detalhe(request, documento_id):
    documento = _documento_autorizado(request, documento_id)
    if request.method == 'PATCH':
        permitidos = {k: v for k, v in request.data.items() if k in ('situacao_conferencia', 'observacao_interna')}
        validos = dict(DocumentoFiscal.SITUACAO_CONFERENCIA_CHOICES)
        if 'situacao_conferencia' in permitidos and permitidos['situacao_conferencia'] not in validos:
            return Response({'erro': 'Situação de conferência inválida.'}, status=status.HTTP_400_BAD_REQUEST)
        antes = {k: getattr(documento, k) for k in permitidos}
        for k, v in permitidos.items():
            setattr(documento, k, v)
        documento.save(update_fields=list(permitidos) + ['atualizado_em'])
        registrar(request.user, documento.empresa, 'documento_conferencia', origem=_origem(request),
                  antes=antes, depois=permitidos, detalhes={'documento': documento.pk})
    return Response(DocumentoDetalheSerializer(documento, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('baixar_documentos')])
def documento_xml(request, documento_id):
    documento = _documento_autorizado(request, documento_id)
    if not documento.xml_original:
        return Response({'erro': 'XML não disponível.'}, status=status.HTTP_404_NOT_FOUND)
    if request.query_params.get('visualizar') == '1':
        return Response({'xml': documento.xml_original, 'completo': bool(documento.xml_completo)})
    resposta = HttpResponse(documento.xml_original.encode('utf-8'), content_type='application/xml; charset=utf-8')
    resposta['Content-Disposition'] = f'attachment; filename="{exportacao.nome_arquivo_documento(documento)}"'
    registrar(request.user, documento.empresa, 'download_xml', origem=_origem(request), detalhes={'documento': documento.pk})
    return resposta


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('baixar_documentos')])
def evento_xml(request, documento_id, evento_id):
    documento = _documento_autorizado(request, documento_id)
    evento = get_object_or_404(documento.eventos, pk=evento_id)
    resposta = HttpResponse(evento.xml.encode('utf-8'), content_type='application/xml; charset=utf-8')
    resposta['Content-Disposition'] = (
        f'attachment; filename="{documento.chave}-evento-{evento.tipo_evento}-{evento.sequencia:02d}.xml"'
    )
    return resposta


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('baixar_documentos')])
def documento_pdf(request, documento_id):
    from .documento_auxiliar import DocumentoAuxiliarIndisponivel, gerar_pdf

    documento = _documento_autorizado(request, documento_id)
    try:
        pdf = gerar_pdf(documento)
    except DocumentoAuxiliarIndisponivel as exc:
        return Response({'erro': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    resposta = HttpResponse(pdf, content_type='application/pdf')
    resposta['Content-Disposition'] = f'attachment; filename="{documento.tipo_documento}-{documento.chave}.pdf"'
    return resposta


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('baixar_documentos')])
def exportar_documentos(request):
    qs = _filtrar_documentos(request).prefetch_related('eventos')
    limite = 20000
    total = qs.count()
    if total > limite:
        return Response({'erro': f'Exportação limitada a {limite} documentos por arquivo ({total} selecionados). '
                                 'Refine os filtros (empresa, competência ou tipo).'}, status=status.HTTP_400_BAD_REQUEST)
    buffer = exportacao.gerar_zip(qs)
    registrar(request.user, None, 'exportacao_lote', origem=_origem(request),
              detalhes={'quantidade': total, 'filtros': dict(request.query_params)})
    resposta = HttpResponse(buffer.getvalue(), content_type='application/zip')
    resposta['Content-Disposition'] = f'attachment; filename="documentos-fiscais-{timezone.localdate():%Y%m%d}.zip"'
    return resposta


# --- Manifestação --------------------------------------------------------------------------


@api_view(['POST'])
@permission_classes([IsAuthenticated, requer('realizar_manifestacao')])
def manifestar(request, documento_id):
    documento = _documento_autorizado(request, documento_id)
    tipo = str(request.data.get('tipo_evento') or '')
    justificativa = request.data.get('justificativa') or ''
    if request.data.get('confirmacao') is not True:
        return Response({'erro': 'Confirme explicitamente a manifestação (confirmacao=true).'},
                        status=status.HTTP_400_BAD_REQUEST)
    try:
        registro = manifestacao.solicitar(documento, tipo, usuario=request.user, justificativa=justificativa)
    except manifestacao.ManifestacaoNaoPermitidaError as exc:
        return Response({'erro': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    registro = manifestacao.transmitir(registro)
    registrar(request.user, documento.empresa, 'manifestacao_solicitar', origem=_origem(request),
              resultado=registro.situacao, detalhes={'documento': documento.pk, 'tipo_evento': tipo,
                                                     'cstat': registro.cstat})
    codigo = status.HTTP_201_CREATED if registro.situacao == 'registrada' else status.HTTP_422_UNPROCESSABLE_ENTITY
    return Response(ManifestacaoSerializer(registro).data, status=codigo)


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('view_documentofiscal')])
def manifestacoes(request):
    qs = Manifestacao.objects.filter(documento__empresa__in=empresas_acessiveis(request.user)).select_related(
        'documento', 'solicitado_por')
    if request.query_params.get('empresa'):
        qs = qs.filter(documento__empresa_id=request.query_params['empresa'])
    paginador = Paginacao()
    pagina = paginador.paginate_queryset(qs, request)
    dados = ManifestacaoSerializer(pagina, many=True).data
    for item, obj in zip(dados, pagina):
        item['documento_chave'] = obj.documento.chave
        item['documento_numero'] = obj.documento.numero
        item['emitente_nome'] = obj.documento.emitente_nome
    return paginador.get_paginated_response(dados)


# --- Importação ------------------------------------------------------------------------------


@api_view(['POST'])
@permission_classes([IsAuthenticated, requer('importar_xml')])
@parser_classes([MultiPartParser, FormParser])
def importar(request):
    arquivos = request.FILES.getlist('arquivos')
    if not arquivos:
        return Response({'erro': 'Envie ao menos um arquivo XML ou ZIP.'}, status=status.HTTP_400_BAD_REQUEST)
    total = sum(a.size for a in arquivos)
    if total > TAMANHO_MAXIMO_UPLOAD:
        return Response({'erro': 'Tamanho total excede 100 MB.'}, status=status.HTTP_400_BAD_REQUEST)
    empresa = None
    if request.data.get('empresa_id'):
        empresa = _empresa_autorizada(request, request.data['empresa_id'])
    lista = [(a.name, a.read()) for a in arquivos]
    resultado = importacao.importar(lista, usuario=request.user, empresas_queryset=empresas_acessiveis(request.user),
                                    empresa_escolhida=empresa)
    return Response(ImportacaoSerializer(resultado).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('importar_xml')])
def pendencias_vinculo(request):
    qs = PendenciaVinculo.objects.filter(resolvida=False, importacao__usuario=request.user)
    if tem_permissao(request.user, 'configurar_integracoes'):
        qs = PendenciaVinculo.objects.filter(resolvida=False)
    return Response(PendenciaVinculoSerializer(qs[:500], many=True).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated, requer('importar_xml')])
def resolver_pendencia(request, pendencia_id):
    pendencia = get_object_or_404(PendenciaVinculo, pk=pendencia_id, resolvida=False)
    if request.data.get('descartar'):
        pendencia.resolvida = True
        pendencia.save(update_fields=['resolvida'])
        return Response({'mensagem': 'Pendência descartada.'})
    empresa = _empresa_autorizada(request, request.data.get('empresa_id'))
    resultado = importacao.importar([(pendencia.nome_arquivo if pendencia.nome_arquivo.endswith('.xml') else 'documento.xml',
                                      pendencia.conteudo.encode('utf-8'))],
                                    usuario=request.user, empresas_queryset=Empresa.objects.filter(pk=empresa.pk),
                                    empresa_escolhida=empresa)
    if resultado.totais.get('pendentes_vinculo'):
        return Response({'erro': 'A empresa escolhida não participa do documento.'}, status=status.HTTP_400_BAD_REQUEST)
    pendencia.resolvida = True
    pendencia.save(update_fields=['resolvida'])
    return Response(ImportacaoSerializer(resultado).data)


# --- Dashboard, relatórios, alertas e auditoria ---------------------------------------------


def _periodo(request):
    hoje = timezone.localdate()
    padrao = (hoje.replace(day=1) - timedelta(days=330)).replace(day=1)  # últimos 12 meses
    inicio = parse_date(request.query_params.get('inicio') or '') or padrao
    fim = parse_date(request.query_params.get('fim') or '') or hoje
    return inicio, fim


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('consultar_relatorios')])
def dashboard(request):
    inicio, fim = _periodo(request)
    empresas = empresas_acessiveis(request.user)
    if request.query_params.get('empresa'):
        empresas = empresas.filter(pk=request.query_params['empresa'])
    ambiente = int(request.query_params.get('ambiente') or ambiente_padrao())
    base = DocumentoFiscal.objects.filter(empresa__in=empresas, ambiente=ambiente,
                                          data_emissao__date__gte=inicio, data_emissao__date__lte=fim)
    validos = base.filter(situacao_fiscal__in=['autorizado', 'encerrado', 'desconhecida'], substituido_por__isnull=True)

    def soma(qs):
        return qs.aggregate(t=Sum('valor_total'))['t'] or Decimal('0')

    por_tipo = {i['tipo_documento']: i['qtd'] for i in base.values('tipo_documento').annotate(qtd=Count('id'))}
    mensal = {}
    for linha in validos.annotate(mes=TruncMonth('data_emissao')).values('mes', 'classificacao').annotate(
            total=Sum('valor_total'), qtd=Count('id')).order_by('mes'):
        chave = linha['mes'].strftime('%Y-%m') if linha['mes'] else 'sem_data'
        mensal.setdefault(chave, {})[linha['classificacao']] = {'total': linha['total'] or 0, 'qtd': linha['qtd']}

    def ranking(qs, campo_doc, campo_nome):
        return list(qs.values(campo_doc, campo_nome).annotate(total=Sum('valor_total'), qtd=Count('id'))
                    .order_by('-total')[:10])

    itens = ItemDocumentoFiscal.objects.filter(documento__in=validos)
    empresas_ativas = ConfiguracaoMonitorFiscal.objects.filter(empresa__in=empresas, ativo=True)
    sem_mov = empresas_ativas.exclude(empresa__in=base.values('empresa')).count()
    return Response({
        'periodo': {'inicio': inicio, 'fim': fim},
        'ambiente': ambiente,
        'aviso_cobertura': exportacao.AVISO_COBERTURA + ' Valores representam movimentação documentada, não '
                           'faturamento fiscal apurado. Ausência de documentos não significa ausência de movimentação.',
        'totais': {
            'documentos': base.count(),
            'nfe': por_tipo.get(c.TIPO_NFE, 0), 'nfse': por_tipo.get(c.TIPO_NFSE, 0),
            'cte': por_tipo.get(c.TIPO_CTE, 0), 'mdfe': por_tipo.get(c.TIPO_MDFE, 0),
            'compras_documentadas': soma(validos.filter(classificacao='entrada')),
            'vendas_documentadas': soma(validos.filter(classificacao='saida')),
            'servicos_prestados': soma(validos.filter(classificacao='servico_prestado')),
            'servicos_tomados': soma(validos.filter(classificacao='servico_tomado')),
            'transportes': soma(validos.filter(classificacao__in=['transporte_contratado', 'transporte_prestado'])),
            'receita_estimada_documentada': soma(validos.filter(classificacao__in=['saida', 'servico_prestado', 'transporte_prestado'])),
            'cancelados': base.filter(situacao_fiscal='cancelado').count(),
            'substituidos': base.filter(situacao_fiscal='substituido').count(),
            'xmls_pendentes': base.filter(situacao_xml='resumo').count(),
            'manifestacoes_pendentes': base.filter(situacao_manifestacao__in=['nao_manifestada', 'ciencia']).exclude(situacao_fiscal='cancelado').count(),
            'empresas_com_erro': ControleSincronizacao.objects.filter(
                empresa__in=empresas_ativas.values('empresa'),
                situacao__in=['erro', 'certificado_invalido', 'indisponivel', 'bloqueado']).values('empresa').distinct().count(),
            'certificados_vencidos': empresas_ativas.filter(certificado__valido_ate__lt=timezone.now()).count(),
            'empresas_sem_movimentacao_capturada': sem_mov,
        },
        'mensal': mensal,
        'distribuicao_tipo': por_tipo,
        'principais_clientes': ranking(validos.filter(classificacao__in=['saida', 'servico_prestado']),
                                       'destinatario_documento', 'destinatario_nome'),
        'principais_fornecedores': ranking(validos.filter(classificacao__in=['entrada', 'servico_tomado', 'transporte_contratado']),
                                           'emitente_documento', 'emitente_nome'),
        'cfop': list(itens.values('cfop').annotate(total=Sum('valor_total'), qtd=Count('id')).order_by('-total')[:15]),
        'ncm': list(itens.values('ncm').annotate(total=Sum('valor_total'), qtd=Count('id')).order_by('-total')[:15]),
    })


RELATORIOS = {
    'documentos': ('Documentos', None),
    'compras_vendas': ('Compras e vendas', ['entrada', 'saida']),
    'servicos_prestados': ('Serviços prestados', ['servico_prestado']),
    'servicos_tomados': ('Serviços tomados', ['servico_tomado']),
    'transportes': ('Transportes', ['transporte_contratado', 'transporte_prestado']),
    'cancelados': ('Documentos cancelados', None),
    'substituidos': ('Documentos substituídos', None),
    'xmls_indisponiveis': ('XMLs indisponíveis', None),
    'manifestacoes': ('Manifestações', None),
    'fornecedores': ('Fornecedores', None),
    'clientes': ('Clientes', None),
    'produtos': ('Produtos', None),
    'ncm': ('NCM', None),
    'cfop': ('CFOP', None),
    'tributos': ('Tributos destacados', None),
    'certificados': ('Certificados', None),
    'sincronizacoes': ('Sincronizações', None),
    'cobertura': ('Cobertura de captura por fonte', None),
}


def _linhas_relatorio(request, tipo):
    qs = _filtrar_documentos(request)
    fmt = lambda d: timezone.localtime(d).strftime('%d/%m/%Y') if d else ''  # noqa: E731
    cab_doc = ['Empresa', 'Tipo', 'Número', 'Série', 'Chave', 'Emissão', 'Emitente', 'CNPJ/CPF emitente',
               'Destinatário/Tomador', 'CNPJ/CPF destinatário', 'Valor', 'Classificação', 'Situação fiscal',
               'XML', 'Manifestação', 'Conferência', 'Origens']

    def linha_doc(d):
        return [d.empresa.nome, d.get_tipo_documento_display(), d.numero, d.serie, d.chave, fmt(d.data_emissao),
                d.emitente_nome, d.emitente_documento, d.destinatario_nome, d.destinatario_documento,
                d.valor_total, d.get_classificacao_display(), d.get_situacao_fiscal_display(),
                d.get_situacao_xml_display(), d.get_situacao_manifestacao_display(),
                d.get_situacao_conferencia_display(), ', '.join(d.fontes or [])]

    classificacoes = RELATORIOS[tipo][1]
    if classificacoes:
        return cab_doc, [linha_doc(d) for d in qs.filter(classificacao__in=classificacoes)]
    if tipo == 'documentos':
        return cab_doc, [linha_doc(d) for d in qs]
    if tipo == 'cancelados':
        return cab_doc, [linha_doc(d) for d in qs.filter(situacao_fiscal='cancelado')]
    if tipo == 'substituidos':
        return cab_doc + ['Chave substituta'], [linha_doc(d) + [d.chave_substituta] for d in qs.filter(situacao_fiscal='substituido')]
    if tipo == 'xmls_indisponiveis':
        return cab_doc, [linha_doc(d) for d in qs.filter(situacao_xml__in=['resumo', 'pendente', 'erro'])]
    validos = qs.filter(situacao_fiscal__in=['autorizado', 'encerrado', 'desconhecida'], substituido_por__isnull=True)
    if tipo == 'manifestacoes':
        ms = Manifestacao.objects.filter(documento__in=qs).select_related('documento', 'documento__empresa')
        return (['Empresa', 'Chave', 'Evento', 'Situação', 'cStat', 'Motivo', 'Protocolo', 'Solicitado em', 'Automática'],
                [[m.documento.empresa.nome, m.documento.chave, c.EVENTOS_NFE.get(m.tipo_evento, m.tipo_evento),
                  m.get_situacao_display(), m.cstat, m.motivo, m.protocolo, fmt(m.criado_em),
                  'Sim' if m.automatica else 'Não'] for m in ms])
    if tipo in ('fornecedores', 'clientes'):
        if tipo == 'fornecedores':
            grupo = validos.filter(classificacao__in=['entrada', 'servico_tomado', 'transporte_contratado']).values(
                'emitente_documento', 'emitente_nome')
        else:
            grupo = validos.filter(classificacao__in=['saida', 'servico_prestado', 'transporte_prestado']).values(
                'destinatario_documento', 'destinatario_nome')
        dados = grupo.annotate(qtd=Count('id'), total=Sum('valor_total')).order_by('-total')
        return ['CNPJ/CPF', 'Nome', 'Quantidade', 'Valor documentado'], [list(d.values())[:2] + [d['qtd'], d['total']] for d in dados]
    itens = ItemDocumentoFiscal.objects.filter(documento__in=validos)
    if tipo == 'produtos':
        dados = itens.values('codigo', 'descricao', 'ncm').annotate(qtd=Sum('quantidade'), total=Sum('valor_total')).order_by('-total')
        return ['Código', 'Descrição', 'NCM', 'Quantidade', 'Valor'], [[d['codigo'], d['descricao'], d['ncm'], d['qtd'], d['total']] for d in dados[:5000]]
    if tipo in ('ncm', 'cfop'):
        dados = itens.values(tipo).annotate(qtd=Count('id'), total=Sum('valor_total')).order_by('-total')
        return [tipo.upper(), 'Itens', 'Valor'], [[d[tipo], d['qtd'], d['total']] for d in dados]
    if tipo == 'tributos':
        if not tem_permissao(request.user, 'visualizar_tributos'):
            return ['Aviso'], [['Sem permissão para visualizar tributos.']]
        campos = ['vBC', 'vICMS', 'vST', 'vIPI', 'vPIS', 'vCOFINS', 'vFCP', 'vTotTrib']
        return (['Empresa', 'Chave', 'Número', 'Emissão'] + campos + ['ISS NFS-e', 'IBS/CBS'],
                [[d.empresa.nome, d.chave, d.numero, fmt(d.data_emissao)] +
                 [(d.valores_tributarios or {}).get(k, '') for k in campos] +
                 [(d.valores_tributarios or {}).get('iss', ''), str((d.valores_tributarios or {}).get('IBSCBSTot') or (d.valores_tributarios or {}).get('ibs_cbs') or '')]
                 for d in validos])
    empresas = empresas_acessiveis(request.user)
    if tipo == 'certificados':
        cfgs = ConfiguracaoMonitorFiscal.objects.filter(empresa__in=empresas).select_related('empresa', 'certificado')
        return (['Empresa', 'CNPJ', 'Monitoramento', 'Titular certificado', 'CNPJ certificado', 'Válido até', 'Situação'],
                [[cf.empresa.nome, cf.empresa.cnpj, 'Ativo' if cf.ativo else 'Inativo',
                  cf.certificado.titular if cf.certificado else '', cf.certificado.cnpj if cf.certificado else '',
                  fmt(cf.certificado.valido_ate) if cf.certificado else '',
                  ('Vencido' if cf.certificado.vencido else 'Vigente') if cf.certificado else 'Sem certificado']
                 for cf in cfgs])
    if tipo == 'sincronizacoes':
        ex = ExecucaoSincronizacao.objects.filter(controle__empresa__in=empresas).select_related('controle__empresa')[:5000]
        return (['Empresa', 'Fonte', 'Origem', 'Início', 'Fim', 'NSU inicial', 'NSU final', 'Lotes', 'Documentos', 'cStat', 'Mensagem', 'Sucesso'],
                [[e.controle.empresa.nome, e.controle.get_fonte_display(), e.origem, fmt(e.iniciado_em), fmt(e.finalizado_em),
                  e.nsu_inicial, e.nsu_final, e.lotes, e.documentos, e.cstat, e.mensagem, 'Sim' if e.sucesso else 'Não'] for e in ex])
    if tipo == 'cobertura':
        linhas = []
        for ct in ControleSincronizacao.objects.filter(empresa__in=empresas).select_related('empresa'):
            linhas.append([ct.empresa.nome, ct.get_fonte_display(), ct.get_ambiente_display(), ct.get_situacao_display(),
                           ct.ult_nsu, ct.max_nsu, ct.documentos_recuperados, fmt(ct.ultimo_sucesso_em),
                           len(ct.lacunas_nsu or []), ct.ultima_mensagem])
        return (['Empresa', 'Fonte', 'Ambiente', 'Situação', 'Último NSU', 'Maior NSU', 'Documentos', 'Último sucesso',
                 'Lacunas NSU', 'Última mensagem'], linhas)
    return ['Aviso'], [['Relatório não disponível.']]


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('consultar_relatorios')])
def relatorio(request, tipo):
    if tipo not in RELATORIOS:
        return Response({'erro': 'Relatório inexistente.', 'disponiveis': list(RELATORIOS)}, status=status.HTTP_404_NOT_FOUND)
    cabecalhos, linhas = _linhas_relatorio(request, tipo)
    formato = request.query_params.get('formato', 'json')
    titulo = RELATORIOS[tipo][0]
    if formato == 'csv':
        resposta = HttpResponse(exportacao.gerar_csv(cabecalhos, linhas), content_type='text/csv; charset=utf-8')
        resposta['Content-Disposition'] = f'attachment; filename="monitor-fiscal-{tipo}.csv"'
        return resposta
    if formato == 'xlsx':
        resposta = HttpResponse(exportacao.gerar_xlsx(titulo, cabecalhos, linhas),
                                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        resposta['Content-Disposition'] = f'attachment; filename="monitor-fiscal-{tipo}.xlsx"'
        return resposta
    return Response({'titulo': titulo, 'aviso': exportacao.AVISO_COBERTURA, 'cabecalhos': cabecalhos,
                     'linhas': linhas[:1000], 'total': len(linhas)})


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('view_documentofiscal')])
def alertas(request):
    qs = AlertaFiscal.objects.filter(Q(empresa__in=empresas_acessiveis(request.user)) | Q(empresa__isnull=True))
    if request.query_params.get('situacao'):
        qs = qs.filter(situacao__in=request.query_params['situacao'].split(','))
    if request.query_params.get('empresa'):
        qs = qs.filter(empresa_id=request.query_params['empresa'])
    if request.query_params.get('tipo'):
        qs = qs.filter(tipo__in=request.query_params['tipo'].split(','))
    if request.query_params.get('prioridade'):
        qs = qs.filter(prioridade__in=request.query_params['prioridade'].split(','))
    paginador = Paginacao()
    pagina = paginador.paginate_queryset(qs.select_related('empresa'), request)
    return paginador.get_paginated_response(AlertaSerializer(pagina, many=True).data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated, requer('gerenciar_alertas')])
def alerta_atualizar(request, alerta_id):
    alerta = get_object_or_404(AlertaFiscal.objects.filter(
        Q(empresa__in=empresas_acessiveis(request.user)) | Q(empresa__isnull=True)), pk=alerta_id)
    situacao = request.data.get('situacao')
    if situacao not in dict(AlertaFiscal.SITUACAO_CHOICES):
        return Response({'erro': 'Situação inválida.'}, status=status.HTTP_400_BAD_REQUEST)
    alerta.situacao = situacao
    alerta.atualizado_por = request.user
    alerta.save(update_fields=['situacao', 'atualizado_por', 'atualizado_em'])
    return Response(AlertaSerializer(alerta).data)


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated, requer('gerenciar_alertas')])
def preferencias_alerta(request):
    pref, _ = PreferenciaAlerta.objects.get_or_create(usuario=request.user)
    if request.method == 'PUT':
        tipos_validos = dict(AlertaFiscal.TIPO_CHOICES)
        tipos = [t for t in request.data.get('tipos_ativos', []) if t in tipos_validos]
        pref.tipos_ativos = tipos
        if request.data.get('prioridade_minima') in modulo_alertas.PRIORIDADE_ORDEM:
            pref.prioridade_minima = request.data['prioridade_minima']
        if request.data.get('frequencia') in dict(PreferenciaAlerta.FREQUENCIA_CHOICES):
            pref.frequencia = request.data['frequencia']
        pref.save()
        if 'empresas' in request.data:
            pref.empresas.set(empresas_acessiveis(request.user).filter(pk__in=request.data.get('empresas') or []))
    return Response({'tipos_ativos': pref.tipos_ativos, 'prioridade_minima': pref.prioridade_minima,
                     'frequencia': pref.frequencia, 'empresas': list(pref.empresas.values_list('id', flat=True)),
                     'tipos_disponiveis': AlertaFiscal.TIPO_CHOICES})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, requer('consultar_relatorios')])
def ocorrencias(request):
    empresas = empresas_acessiveis(request.user)
    if request.method == 'POST':
        alvo = empresas.filter(pk=request.data['empresa_id']) if request.data.get('empresa_id') else empresas.filter(monitor_fiscal__ativo=True)
        total = sum(auditar_empresa(e) for e in alvo[:500])
        return Response({'ocorrencias_criadas': total})
    qs = OcorrenciaAuditoria.objects.filter(empresa__in=empresas).select_related('empresa', 'documento')
    for campo in ('severidade', 'situacao', 'regra'):
        if request.query_params.get(campo):
            qs = qs.filter(**{f'{campo}__in': request.query_params[campo].split(',')})
    if request.query_params.get('empresa'):
        qs = qs.filter(empresa_id=request.query_params['empresa'])
    paginador = Paginacao()
    pagina = paginador.paginate_queryset(qs, request)
    return paginador.get_paginated_response(OcorrenciaSerializer(pagina, many=True).data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated, requer('consultar_relatorios')])
def ocorrencia_atualizar(request, ocorrencia_id):
    ocorrencia = get_object_or_404(OcorrenciaAuditoria, pk=ocorrencia_id, empresa__in=empresas_acessiveis(request.user))
    situacao = request.data.get('situacao')
    justificativa = (request.data.get('justificativa') or '').strip()
    if situacao not in ('justificada', 'resolvida', 'aberta'):
        return Response({'erro': 'Situação inválida.'}, status=status.HTTP_400_BAD_REQUEST)
    if situacao == 'justificada' and len(justificativa) < 5:
        return Response({'erro': 'Informe a justificativa.'}, status=status.HTTP_400_BAD_REQUEST)
    ocorrencia.situacao = situacao
    ocorrencia.justificativa = justificativa or ocorrencia.justificativa
    ocorrencia.resolvido_por = request.user if situacao != 'aberta' else None
    ocorrencia.resolvido_em = timezone.now() if situacao != 'aberta' else None
    ocorrencia.save()
    registrar(request.user, ocorrencia.empresa, 'auditoria_ocorrencia', origem=_origem(request),
              detalhes={'ocorrencia': ocorrencia.pk, 'situacao': situacao})
    return Response(OcorrenciaSerializer(ocorrencia).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, requer('acessar_logs')])
def logs(request):
    qs = RegistroAuditoria.objects.filter(
        Q(empresa__in=empresas_acessiveis(request.user)) | Q(empresa__isnull=True)
    ).select_related('usuario', 'empresa')
    if request.query_params.get('operacao'):
        qs = qs.filter(operacao=request.query_params['operacao'])
    paginador = Paginacao()
    pagina = paginador.paginate_queryset(qs, request)
    return paginador.get_paginated_response(RegistroAuditoriaSerializer(pagina, many=True).data)
