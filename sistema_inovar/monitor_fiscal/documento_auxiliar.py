"""Representação auxiliar simplificada em PDF.

IMPORTANTE: este PDF NÃO segue o leiaute oficial do DANFE/DACTE/DANFSE/DAMDFE.
É uma representação de consulta, identificada como tal no próprio documento,
gerada a partir do XML preservado. O XML continua sendo o documento fiscal.
"""
import io

from reportlab.graphics.barcode import code128
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


class DocumentoAuxiliarIndisponivel(ValueError):
    pass


def _moeda(valor):
    if valor in (None, ''):
        return '-'
    try:
        return f'R$ {float(valor):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    except (TypeError, ValueError):
        return str(valor)


def gerar_pdf(documento) -> bytes:
    if not documento.xml_completo:
        raise DocumentoAuxiliarIndisponivel(
            'Somente o resumo está disponível. O documento auxiliar exige o XML completo.'
        )
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    largura, altura = A4
    margem = 12 * mm
    y = altura - margem

    pdf.setFont('Helvetica-Bold', 13)
    pdf.drawString(margem, y, f'{documento.get_tipo_documento_display()} - Representação auxiliar simplificada')
    y -= 5 * mm
    pdf.setFont('Helvetica', 7.5)
    pdf.setFillColor(colors.HexColor('#9b1c1c'))
    pdf.drawString(margem, y, 'Não é o leiaute oficial do documento auxiliar. Não substitui o XML do documento fiscal eletrônico.')
    pdf.setFillColor(colors.black)
    y -= 8 * mm

    if len(documento.chave) in (44, 50) and documento.chave.isdigit():
        barra = code128.Code128(documento.chave, barHeight=12 * mm, barWidth=0.28 * mm)
        barra.drawOn(pdf, margem, y - 12 * mm)
        y -= 16 * mm
    pdf.setFont('Helvetica', 8)
    pdf.drawString(margem, y, f'Chave de acesso: {documento.chave}')
    y -= 6 * mm

    def bloco(titulo, linhas):
        nonlocal y
        if y < 40 * mm:
            pdf.showPage()
            y = altura - margem
        pdf.setFont('Helvetica-Bold', 9)
        pdf.drawString(margem, y, titulo)
        y -= 1.5 * mm
        pdf.line(margem, y, largura - margem, y)
        y -= 4 * mm
        pdf.setFont('Helvetica', 8)
        for rotulo, valor in linhas:
            pdf.drawString(margem, y, f'{rotulo}: {str(valor or "-")[:110]}')
            y -= 4.2 * mm
        y -= 2 * mm

    emissao = documento.data_emissao.strftime('%d/%m/%Y %H:%M') if documento.data_emissao else '-'
    bloco('Identificação', [
        ('Número / Série', f'{documento.numero} / {documento.serie or "-"}'),
        ('Emissão', emissao),
        ('Protocolo', documento.protocolo),
        ('Situação fiscal', documento.get_situacao_fiscal_display()),
        ('Ambiente', documento.get_ambiente_display()),
    ])
    bloco('Emitente / Prestador', [('Nome', documento.emitente_nome), ('CNPJ/CPF', documento.emitente_documento),
                                   ('IE', documento.emitente_ie)])
    bloco('Destinatário / Tomador', [('Nome', documento.destinatario_nome),
                                     ('CNPJ/CPF', documento.destinatario_documento)])
    dados = documento.dados or {}
    if documento.tipo_documento == 'NFSE':
        bloco('Serviço', [('Código', dados.get('codigo_servico')), ('Descrição', dados.get('descricao_servico')),
                          ('Município de incidência', dados.get('municipio_incidencia'))])
    if documento.tipo_documento == 'CTE':
        bloco('Prestação', [('Modal', dados.get('modal')), ('Origem', dados.get('municipio_origem')),
                            ('Destino', dados.get('municipio_destino')), ('CFOP', dados.get('cfop'))])

    itens = list(documento.itens.all()[:200])
    if itens:
        if y < 50 * mm:
            pdf.showPage()
            y = altura - margem
        pdf.setFont('Helvetica-Bold', 9)
        pdf.drawString(margem, y, 'Produtos')
        y -= 5 * mm
        pdf.setFont('Helvetica-Bold', 7)
        colunas = [(0, 'Cód.'), (22, 'Descrição'), (105, 'NCM'), (122, 'CFOP'), (135, 'Qtd'), (155, 'Valor')]
        for x, titulo in colunas:
            pdf.drawString(margem + x * mm, y, titulo)
        y -= 4 * mm
        pdf.setFont('Helvetica', 7)
        for item in itens:
            if y < 20 * mm:
                pdf.showPage()
                y = altura - margem
                pdf.setFont('Helvetica', 7)
            valores = [item.codigo[:14], item.descricao[:55], item.ncm, item.cfop,
                       f'{item.quantidade or 0:.2f} {item.unidade}', _moeda(item.valor_total)]
            for (x, _), valor in zip(colunas, valores):
                pdf.drawString(margem + x * mm, y, str(valor))
            y -= 3.8 * mm
        y -= 3 * mm
    bloco('Totais', [('Valor total', _moeda(documento.valor_total))])
    pdf.setFont('Helvetica', 6.5)
    pdf.drawString(margem, 8 * mm, 'Gerado pelo Monitor Fiscal INOVAR a partir do XML armazenado.')
    pdf.save()
    return buffer.getvalue()
