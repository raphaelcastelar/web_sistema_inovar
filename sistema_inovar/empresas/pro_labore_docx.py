from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO


INSS_ALIQUOTA = Decimal("0.11")
INSS_TETO_BASE = Decimal("8475.55")
IR_FAIXA_ISENCAO_TOTAL = Decimal("5000.00")
IR_FAIXA_REDUCAO = Decimal("7350.00")
IR_REDUCAO_INTERCEPT = Decimal("978.62")
IR_REDUCAO_SLOPE = Decimal("0.133145")

PDF_PAGE_WIDTH = 595.28
PDF_PAGE_HEIGHT = 841.89
PDF_MARGIN_X = 50


def _round_currency(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _to_decimal(value, field_name: str, required: bool = True) -> Decimal:
    if value in (None, ""):
        if required:
            raise ValueError(f"O campo '{field_name}' e obrigatorio.")
        return Decimal("0.00")

    normalized = str(value).strip()
    if "," in normalized:
        normalized = normalized.replace(".", "").replace(",", ".")
    else:
        normalized = normalized.replace(",", "")
    try:
        return Decimal(normalized)
    except (InvalidOperation, ValueError):
        raise ValueError(f"O campo '{field_name}' deve ser numerico.")


def _calc_irrf_sem_reducao(base_calculo: Decimal) -> Decimal:
    if base_calculo <= Decimal("2428.80"):
        return Decimal("0.00")
    if base_calculo <= Decimal("2826.65"):
        return _round_currency((base_calculo * Decimal("0.075")) - Decimal("182.16"))
    if base_calculo <= Decimal("3751.05"):
        return _round_currency((base_calculo * Decimal("0.15")) - Decimal("394.16"))
    if base_calculo <= Decimal("4664.68"):
        return _round_currency((base_calculo * Decimal("0.225")) - Decimal("675.49"))
    return _round_currency((base_calculo * Decimal("0.275")) - Decimal("908.73"))


def _calcular_impostos_pro_labore(valor_bruto: Decimal) -> tuple[Decimal, Decimal, Decimal]:
    bruto = max(valor_bruto, Decimal("0.00"))

    base_inss = min(bruto, INSS_TETO_BASE)
    valor_inss = _round_currency(base_inss * INSS_ALIQUOTA)

    base_irrf = max(Decimal("0.00"), bruto - valor_inss)
    irrf_sem_reducao = max(Decimal("0.00"), _calc_irrf_sem_reducao(base_irrf))

    if base_irrf <= IR_FAIXA_ISENCAO_TOTAL:
        valor_irrf = Decimal("0.00")
    elif base_irrf <= IR_FAIXA_REDUCAO:
        reducao = max(
            Decimal("0.00"),
            IR_REDUCAO_INTERCEPT - (IR_REDUCAO_SLOPE * base_irrf),
        )
        valor_irrf = max(Decimal("0.00"), irrf_sem_reducao - reducao)
    else:
        valor_irrf = irrf_sem_reducao

    valor_irrf = _round_currency(valor_irrf)
    valor_liquido = _round_currency(max(Decimal("0.00"), bruto - valor_inss - valor_irrf))
    return valor_inss, valor_irrf, valor_liquido


def _format_currency_br(value: Decimal) -> str:
    value = _round_currency(value)
    inteiro, decimal = f"{value:.2f}".split(".")
    inteiro = f"{int(inteiro):,}".replace(",", ".")
    return f"R$ {inteiro},{decimal}"


def _required_text(data: dict, key: str, label: str) -> str:
    value = str(data.get(key, "")).strip()
    if not value:
        raise ValueError(f"O campo '{label}' e obrigatorio.")
    return value


def _optional_text(data: dict, key: str, default: str = "") -> str:
    return str(data.get(key, default)).strip() or default


def _default_filename(nome_colaborador: str, referencia: str) -> str:
    safe_name = re.sub(r"[^a-zA-Z0-9]+", "_", nome_colaborador.strip()).strip("_").lower()
    safe_ref = re.sub(r"[^0-9]+", "_", referencia).strip("_")
    if not safe_name:
        safe_name = "colaborador"
    if not safe_ref:
        safe_ref = datetime.now().strftime("%m_%Y")
    return f"recibo_pro_labore_{safe_name}_{safe_ref}.pdf"


def _pdf_escape(value: str) -> bytes:
    return (
        str(value)
        .encode("cp1252", errors="replace")
        .replace(b"\\", b"\\\\")
        .replace(b"(", b"\\(")
        .replace(b")", b"\\)")
    )


def _text_width(text: str, size: int, bold: bool = False) -> float:
    multiplier = 0.56 if bold else 0.52
    return len(str(text)) * size * multiplier


def _wrap_text(text: str, max_width: float, size: int = 11, bold: bool = False) -> list[str]:
    words = str(text).split()
    if not words:
        return [""]

    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if _text_width(candidate, size, bold) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _pdf_text_line(
    commands: list[bytes],
    x: float,
    y: float,
    text: str,
    size: int = 11,
    bold: bool = False,
    align: str = "left",
) -> None:
    font = "F2" if bold else "F1"
    draw_x = x
    if align == "center":
        draw_x = x - (_text_width(text, size, bold) / 2)
    elif align == "right":
        draw_x = x - _text_width(text, size, bold)

    commands.append(
        f"BT /{font} {size} Tf 1 0 0 1 {draw_x:.2f} {y:.2f} Tm (".encode("ascii")
        + _pdf_escape(text)
        + b") Tj ET\n"
    )


def _pdf_wrapped_text(
    commands: list[bytes],
    x: float,
    y: float,
    text: str,
    max_width: float,
    size: int = 11,
    leading: int = 15,
) -> float:
    current_y = y
    for line in _wrap_text(text, max_width, size):
        _pdf_text_line(commands, x, current_y, line, size=size)
        current_y -= leading
    return current_y


def _draw_table_cell(
    commands: list[bytes],
    x: float,
    y: float,
    width: float,
    height: float,
    text: str,
    size: int = 9,
    bold: bool = False,
    align: str = "left",
) -> None:
    commands.append(f"{x:.2f} {y - height:.2f} {width:.2f} {height:.2f} re S\n".encode("ascii"))
    text_x = x + 6
    if align == "center":
        text_x = x + (width / 2)
    elif align == "right":
        text_x = x + width - 6
    _pdf_text_line(commands, text_x, y - 16, text, size=size, bold=bold, align=align)


def _build_simple_pdf(commands: list[bytes]) -> bytes:
    stream = b"".join(commands)
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] "
            b"/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"endstream",
    ]

    output = BytesIO()
    output.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: list[int] = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(output.tell())
        output.write(f"{index} 0 obj\n".encode("ascii"))
        output.write(obj)
        output.write(b"\nendobj\n")

    xref_offset = output.tell()
    output.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.write(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.write(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode("ascii")
    )
    return output.getvalue()


def build_pro_labore_pdf(payload: dict) -> tuple[bytes, str]:
    empresa_nome = _required_text(payload, "empresa_nome", "empresa_nome")
    empresa_endereco = _required_text(payload, "empresa_endereco", "empresa_endereco")
    empresa_numero = _required_text(payload, "empresa_numero", "empresa_numero")
    empresa_bairro = _required_text(payload, "empresa_bairro", "empresa_bairro")
    empresa_municipio = _required_text(payload, "empresa_municipio", "empresa_municipio")
    empresa_estado = _required_text(payload, "empresa_estado", "empresa_estado")
    empresa_cep = _required_text(payload, "empresa_cep", "empresa_cep")
    empresa_cnpj = _required_text(payload, "empresa_cnpj", "empresa_cnpj")

    colaborador_nome = _required_text(payload, "colaborador_nome", "colaborador_nome")
    colaborador_cpf = _required_text(payload, "colaborador_cpf", "colaborador_cpf")
    referencia_mes_ano = _required_text(payload, "referencia_mes_ano", "referencia_mes_ano")
    data_assinatura = _required_text(payload, "data_assinatura", "data_assinatura")
    local_assinatura = _required_text(payload, "local_assinatura", "local_assinatura")
    valor_liquido_extenso = _required_text(payload, "valor_liquido_extenso", "valor_liquido_extenso")

    valor_bruto = _to_decimal(payload.get("valor_bruto"), "valor_bruto")
    valor_inss_calculado, valor_irrf_calculado, valor_liquido_calculado = _calcular_impostos_pro_labore(valor_bruto)
    valor_inss_payload = payload.get("valor_inss")
    valor_irrf_payload = payload.get("valor_irrf")
    valor_liquido_payload = payload.get("valor_liquido")
    valor_inss = (
        _to_decimal(valor_inss_payload, "valor_inss", required=False)
        if valor_inss_payload not in (None, "")
        else valor_inss_calculado
    )
    valor_irrf = (
        _to_decimal(valor_irrf_payload, "valor_irrf", required=False)
        if valor_irrf_payload not in (None, "")
        else valor_irrf_calculado
    )
    valor_liquido = (
        _to_decimal(valor_liquido_payload, "valor_liquido", required=False)
        if valor_liquido_payload not in (None, "")
        else valor_liquido_calculado
    )

    commands: list[bytes] = [b"0 0 0 RG 0 0 0 rg 0.8 w\n"]
    y = PDF_PAGE_HEIGHT - 72

    _pdf_text_line(commands, PDF_PAGE_WIDTH / 2, y, "RECIBO DE PRO-LABORE", size=16, bold=True, align="center")
    y -= 42

    table_x = PDF_MARGIN_X
    table_y = y
    row_h = 28
    widths = [205, 75, 105, 105]
    headers = ["Verba", "Referencia", "Vencimentos", "Descontos"]
    rows = [
        ["0702 - Retirada Pro-Labore Diretor", referencia_mes_ano, _format_currency_br(valor_bruto), "-"],
        ["0526 - INSS Contribuinte Individual", referencia_mes_ano, "-", _format_currency_br(valor_inss)],
        ["0530 - Desconto de IRRF", referencia_mes_ano, "-", _format_currency_br(valor_irrf)],
    ]

    current_y = table_y
    current_x = table_x
    for index, header in enumerate(headers):
        _draw_table_cell(commands, current_x, current_y, widths[index], row_h, header, size=9, bold=True, align="center")
        current_x += widths[index]

    for row in rows:
        current_y -= row_h
        current_x = table_x
        for index, value in enumerate(row):
            align = "left" if index == 0 else "center"
            _draw_table_cell(commands, current_x, current_y, widths[index], row_h, value, size=9, align=align)
            current_x += widths[index]

    y = current_y - 44
    _pdf_text_line(commands, PDF_MARGIN_X, y, f"Liquido Recebido: {_format_currency_br(valor_liquido)}", size=11, bold=True)
    y -= 34

    texto = (
        f"Recebi de {empresa_nome}, sediada no {empresa_endereco}, n. {empresa_numero}, "
        f"bairro {empresa_bairro}, municipio de {empresa_municipio}, estado {empresa_estado}, "
        f"CEP {empresa_cep}, CNPJ {empresa_cnpj}, a importancia supra de "
        f"{_format_currency_br(valor_liquido)} ({valor_liquido_extenso}) referente ao meu "
        f"Pro-Labore do mes {referencia_mes_ano}, com os descontos exigidos em lei. "
        "Para maior clareza e devidos fins de direito, firmo o presente."
    )
    y = _pdf_wrapped_text(commands, PDF_MARGIN_X, y, texto, PDF_PAGE_WIDTH - (PDF_MARGIN_X * 2), size=11, leading=16)
    y -= 44

    _pdf_text_line(
        commands,
        PDF_PAGE_WIDTH / 2,
        y,
        f"{local_assinatura}, {data_assinatura}.",
        size=11,
        align="center",
    )
    y -= 70
    _pdf_text_line(commands, PDF_PAGE_WIDTH / 2, y, "________________________________________", size=11, align="center")
    y -= 18
    _pdf_text_line(commands, PDF_PAGE_WIDTH / 2, y, colaborador_nome, size=11, align="center")
    y -= 16
    _pdf_text_line(commands, PDF_PAGE_WIDTH / 2, y, f"CPF: {colaborador_cpf}", size=11, align="center")

    filename = _optional_text(payload, "nome_arquivo")
    if not filename:
        filename = _default_filename(colaborador_nome, referencia_mes_ano)
    filename = re.sub(r"\.docx$", "", filename, flags=re.IGNORECASE)
    if not filename.lower().endswith(".pdf"):
        filename = f"{filename}.pdf"

    return _build_simple_pdf(commands), filename
