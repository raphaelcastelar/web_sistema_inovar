"""API do Relatório de Situação Fiscal (Integra Contador - SITFIS)."""
import logging

from django.db import DatabaseError
from django.http import FileResponse, HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .document_storage import (
    SITUACAO_FISCAL_TYPE,
    find_empresa_by_cnpj,
    find_situacao_fiscal_do_dia,
    save_situacao_fiscal,
)
from .models import DocumentoEmpresa
from .sitfis_service import obter_relatorio_situacao_fiscal

logger = logging.getLogger(__name__)


def _arquivo(documento, origem):
    resposta = FileResponse(
        documento.caminho_arquivo.storage.open(documento.caminho_arquivo.name, 'rb'),
        as_attachment=True, filename=documento.nome_arquivo, content_type='application/pdf',
    )
    resposta['X-Sitfis-Origem'] = origem
    return resposta


def _verdadeiro(valor):
    return str(valor).strip().lower() in {'1', 'true', 'sim', 'yes', 'on'}


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def emitir_situacao_fiscal_api(request):
    """Emite o relatório; reaproveita o do dia, salvo quando `forcar` é verdadeiro.

    Respostas: 200 PDF | 202 {"pendente": true, "espera_ms"} | 4xx/5xx {"error"}.
    """
    cnpj = ''.join(filter(str.isdigit, str(request.data.get('cnpj', ''))))
    if len(cnpj) != 14:
        return Response({'error': 'Informe um CNPJ válido com 14 dígitos.'}, status=status.HTTP_400_BAD_REQUEST)
    empresa = find_empresa_by_cnpj(cnpj)
    if not empresa:
        return Response({'error': 'Empresa não cadastrada no sistema.'}, status=status.HTTP_404_NOT_FOUND)

    if not _verdadeiro(request.data.get('forcar')):
        existente = find_situacao_fiscal_do_dia(empresa)
        if existente:
            return _arquivo(existente, 'reaproveitado')

    resultado = obter_relatorio_situacao_fiscal(cnpj)
    if resultado.get('pendente'):
        return Response(
            {'pendente': True, 'espera_ms': resultado['espera_ms'], 'mensagem': resultado.get('mensagem')},
            status=status.HTTP_202_ACCEPTED,
        )
    if not resultado.get('sucesso'):
        return Response(
            {'error': resultado.get('erro') or 'Erro ao emitir o relatório de situação fiscal.',
             'detalhes': resultado.get('detalhes')},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        documento = save_situacao_fiscal(empresa, resultado['file_content'], user=request.user)
    except (DatabaseError, OSError, ValueError, RuntimeError) as exc:
        logger.exception('Não foi possível salvar a situação fiscal de %s: %s', cnpj, exc)
        return Response(
            {'error': 'O relatório foi emitido, mas não pôde ser salvo na pasta da empresa. Tente novamente.'},
            status=status.HTTP_507_INSUFFICIENT_STORAGE,
        )
    resposta = HttpResponse(resultado['file_content'], content_type='application/pdf')
    resposta['Content-Disposition'] = f'attachment; filename="{documento.nome_arquivo}"'
    resposta['X-Sitfis-Origem'] = 'emitido'
    return resposta


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ultimas_situacoes_fiscais_api(request):
    """Último relatório SITFIS salvo de cada empresa: {empresa_id: {id, gerado_em, nome_arquivo}}."""
    documentos = (
        DocumentoEmpresa.objects
        .filter(tipo_documento__codigo=SITUACAO_FISCAL_TYPE['codigo'], status='disponivel')
        .order_by('empresa_id', '-gerado_em', '-criado_em')
        .values('id', 'empresa_id', 'gerado_em', 'criado_em', 'nome_arquivo')
    )
    ultimos = {}
    for doc in documentos:
        if doc['empresa_id'] in ultimos:
            continue
        data = doc['gerado_em'] or doc['criado_em']
        ultimos[doc['empresa_id']] = {
            'id': doc['id'], 'nome_arquivo': doc['nome_arquivo'],
            'gerado_em': data.isoformat() if data else None,
        }
    return Response({'ultimos': ultimos})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def baixar_situacao_fiscal_api(request, documento_id):
    documento = (
        DocumentoEmpresa.objects
        .filter(pk=documento_id, tipo_documento__codigo=SITUACAO_FISCAL_TYPE['codigo'], status='disponivel')
        .first()
    )
    if not documento or not documento.caminho_arquivo:
        return Response({'error': 'Relatório não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
    try:
        if not documento.caminho_arquivo.storage.exists(documento.caminho_arquivo.name):
            return Response({'error': 'O arquivo do relatório não está mais na pasta da empresa.'},
                            status=status.HTTP_404_NOT_FOUND)
    except (OSError, ValueError):
        return Response({'error': 'Não foi possível acessar o arquivo do relatório.'},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    return _arquivo(documento, 'arquivo')
