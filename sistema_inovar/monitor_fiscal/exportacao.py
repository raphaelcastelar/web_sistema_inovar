"""Exportação de XMLs (ZIP organizado) e relatórios (CSV / XLSX)."""
import csv
import io
import re
import zipfile

from unidecode import unidecode

AVISO_COBERTURA = (
    'Relatório gerado somente com os documentos disponíveis na plataforma. Não representa, '
    'necessariamente, a totalidade da movimentação fiscal da empresa.'
)


def _seguro(texto):
    texto = unidecode(str(texto or '')).strip()
    texto = re.sub(r'[^A-Za-z0-9._ -]+', '_', texto)
    return texto[:80] or 'sem_nome'


def caminho_documento(documento):
    data = documento.data_emissao or documento.capturado_em
    ano = f'{data:%Y}' if data else 'sem_data'
    mes = f'{data:%m}' if data else 'sem_data'
    ambiente = '' if documento.ambiente == 1 else 'HOMOLOGACAO/'
    return (
        f'{ambiente}{_seguro(documento.empresa.nome)}/{ano}/{mes}/{documento.tipo_documento}/'
        f'{_seguro(documento.get_classificacao_display())}'
    )


def nome_arquivo_documento(documento):
    sufixo = '' if documento.xml_completo else '-resumo'
    return f'{documento.tipo_documento}-{documento.chave}{sufixo}.xml'


def gerar_zip(documentos, incluir_eventos=True):
    buffer = io.BytesIO()
    nomes = set()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as arquivo:
        for documento in documentos:
            if not documento.xml_original:
                continue
            base = caminho_documento(documento)
            nome = f'{base}/{nome_arquivo_documento(documento)}'
            if nome in nomes:
                nome = nome.replace('.xml', f'-{documento.pk}.xml')
            nomes.add(nome)
            arquivo.writestr(nome, documento.xml_original)
            if incluir_eventos:
                for evento in documento.eventos.all():
                    if evento.xml:
                        nome_evento = f'{base}/eventos/{documento.chave}-{evento.tipo_evento}-{evento.sequencia:02d}.xml'
                        if nome_evento not in nomes:
                            nomes.add(nome_evento)
                            arquivo.writestr(nome_evento, evento.xml)
        arquivo.writestr('LEIA-ME.txt', AVISO_COBERTURA + '\nO PDF auxiliar não substitui o XML do documento fiscal.\n')
    buffer.seek(0)
    return buffer


def gerar_csv(cabecalhos, linhas):
    buffer = io.StringIO()
    buffer.write('﻿')
    escritor = csv.writer(buffer, delimiter=';')
    escritor.writerow([AVISO_COBERTURA])
    escritor.writerow(cabecalhos)
    for linha in linhas:
        escritor.writerow(['' if v is None else v for v in linha])
    return buffer.getvalue().encode('utf-8')


def gerar_xlsx(titulo, cabecalhos, linhas):
    from empresas.views import _build_xlsx_file  # gerador XLSX já existente na INOVAR

    linhas = [[AVISO_COBERTURA] + [''] * (len(cabecalhos) - 1), [''] * len(cabecalhos)] + [list(l) for l in linhas]
    return _build_xlsx_file(titulo, cabecalhos, linhas).getvalue()
