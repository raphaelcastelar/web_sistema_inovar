"""Importação manual de XML individual, múltiplos XMLs e ZIP.

Usa exatamente o mesmo processamento da captura automática.
"""
from django.db import transaction

from . import constantes as c
from . import parsers
from .models import ConfiguracaoMonitorFiscal, ImportacaoManual, PendenciaVinculo
from .processador import processar_conteudo, somente_digitos
from .seguranca import (
    XMLInseguroError, XMLMalformadoError, ZipInseguroError, extrair_xmls_zip, parse_xml_seguro,
)
from .auditoria_log import registrar


def _documentos_participantes(interpretado):
    campos = interpretado.campos
    docs = {campos.get('emitente_documento'), campos.get('destinatario_documento')}
    participantes = campos.get('participantes') or {}
    for item in participantes.get('lista', []):
        if item:
            docs.add(item.get('documento'))
    docs.add(participantes.get('tomador_documento'))
    docs.add(participantes.get('intermediario_documento'))
    if interpretado.categoria == 'evento':
        docs.add(interpretado.evento.get('autor_documento'))
    return {somente_digitos(d) for d in docs if d}


def _empresas_relacionadas(interpretado, empresas_por_cnpj, empresa_escolhida=None):
    """Empresas autorizadas ao usuário que participam do documento."""
    participantes = _documentos_participantes(interpretado)
    if interpretado.categoria == 'evento' and not (participantes & set(empresas_por_cnpj)):
        # Evento cujo autor é terceiro: vincula às empresas que já possuem o documento.
        from .models import DocumentoFiscal
        ids = DocumentoFiscal.objects.filter(
            chave=interpretado.chave, empresa_id__in=[e.pk for e in empresas_por_cnpj.values()]
        ).values_list('empresa_id', flat=True)
        relacionadas = [e for e in empresas_por_cnpj.values() if e.pk in set(ids)]
    else:
        relacionadas = [empresas_por_cnpj[d] for d in participantes if d in empresas_por_cnpj]
    if interpretado.tipo_conteudo == 'resumo' and empresa_escolhida is not None:
        # Resumos não identificam o destinatário: aceita a empresa escolhida pelo usuário.
        relacionadas = [empresa_escolhida]
    if empresa_escolhida is not None:
        relacionadas = [e for e in relacionadas if e.pk == empresa_escolhida.pk]
    return relacionadas


def importar(arquivos, *, usuario, empresas_queryset, empresa_escolhida=None):
    """arquivos: lista de (nome, bytes). Retorna ImportacaoManual com o resumo."""
    importacao = ImportacaoManual.objects.create(
        usuario=usuario, empresa=empresa_escolhida, arquivos=[nome for nome, _ in arquivos][:500],
    )
    empresas_por_cnpj = {somente_digitos(e.cnpj): e for e in empresas_queryset}
    ambientes = dict(ConfiguracaoMonitorFiscal.objects.filter(
        empresa_id__in=[e.pk for e in empresas_por_cnpj.values()]
    ).values_list('empresa_id', 'ambiente'))
    totais = {'processados': 0, 'importados': 0, 'atualizados': 0, 'duplicados': 0, 'rejeitados': 0,
              'pendentes_vinculo': 0}
    resultados = []

    def rejeitar(nome, motivo):
        totais['rejeitados'] += 1
        resultados.append({'arquivo': nome, 'status': 'rejeitado', 'motivo': motivo})

    def processar_xml(nome, conteudo):
        totais['processados'] += 1
        try:
            raiz = parse_xml_seguro(conteudo)
            interpretado = parsers.interpretar(raiz)
        except XMLInseguroError as exc:
            return rejeitar(nome, f'XML potencialmente malicioso: {exc}')
        except (XMLMalformadoError, parsers.LeiauteNaoReconhecidoError) as exc:
            return rejeitar(nome, str(exc))
        if interpretado.tipo_documento in (c.TIPO_NFE, c.TIPO_CTE, c.TIPO_MDFE) and interpretado.categoria == 'documento':
            if interpretado.tipo_conteudo != 'resumo' and not interpretado.campos.get('protocolo'):
                return rejeitar(nome, 'Documento sem protocolo de autorização (XML não autorizado).')
            if len(interpretado.chave) == 44 and not parsers.validar_chave_44(interpretado.chave):
                return rejeitar(nome, 'Chave de acesso com dígito verificador inválido.')

        empresas = _empresas_relacionadas(interpretado, empresas_por_cnpj, empresa_escolhida)
        if not empresas:
            PendenciaVinculo.objects.create(
                importacao=importacao, nome_arquivo=nome[:255], conteudo=conteudo.decode('utf-8', 'replace'),
                chave=interpretado.chave, participantes=sorted(_documentos_participantes(interpretado)),
            )
            totais['pendentes_vinculo'] += 1
            resultados.append({'arquivo': nome, 'status': 'pendente_vinculo', 'chave': interpretado.chave,
                               'motivo': 'Nenhuma empresa autorizada participa do documento; requer análise manual.'})
            return
        for empresa in empresas:
            ambiente = interpretado.ambiente or ambientes.get(empresa.pk, c.PRODUCAO)
            with transaction.atomic():
                resultado = processar_conteudo(
                    conteudo, fonte=c.FONTE_IMPORTACAO, ambiente=ambiente, empresa=empresa, usuario=usuario,
                    importacao=importacao, raiz=raiz, interpretado=interpretado,
                )
            chave_total = {'importado': 'importados', 'atualizado': 'atualizados', 'duplicado': 'duplicados',
                           'rejeitado': 'rejeitados'}[resultado.status]
            totais[chave_total] += 1
            resultados.append({
                'arquivo': nome, 'status': resultado.status, 'empresa': empresa.nome, 'chave': interpretado.chave,
                'tipo': interpretado.tipo_documento, 'motivo': resultado.mensagem,
            })

    for nome, conteudo in arquivos:
        if nome.lower().endswith('.zip'):
            try:
                for nome_interno, dados, erro in extrair_xmls_zip(conteudo):
                    if erro:
                        totais['processados'] += 1
                        rejeitar(f'{nome}/{nome_interno}', erro)
                    else:
                        processar_xml(f'{nome}/{nome_interno}', dados)
            except ZipInseguroError as exc:
                totais['processados'] += 1
                rejeitar(nome, str(exc))
        elif nome.lower().endswith('.xml'):
            processar_xml(nome, conteudo)
        else:
            totais['processados'] += 1
            rejeitar(nome, 'Formato não suportado: envie XML ou ZIP.')

    importacao.totais = totais
    importacao.resultados = resultados[:5000]
    importacao.save(update_fields=['totais', 'resultados'])
    registrar(usuario, empresa_escolhida, 'importacao_manual', detalhes={'importacao': importacao.pk, **totais})
    return importacao
