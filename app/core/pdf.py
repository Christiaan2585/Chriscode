"""Invoice, quote and purchase order PDFs, laid out like the Sage Business
Cloud Accounting documents the business used before: title and details top
left, logo top right, FROM/TO blocks, the line table, then bank details and
totals at the foot of the last page."""
import io
import os
from datetime import datetime
from functools import lru_cache
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import Flowable, Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.documents import document_totals, line_amounts

CURRENCY = "R"  # ZAR

INK = colors.HexColor("#1f2933")
MUTED = colors.HexColor("#6b7280")
RULE = colors.HexColor("#d1d5db")
BRAND = colors.HexColor("#047857")  # the app's emerald

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Packaged backend: bundled by build_and_package.bat's --add-data. Dev: the app's own logo.
_LOGO_CANDIDATES = [
    os.path.join(_ROOT, "assets", "logo.png"),
    os.path.join(_ROOT, "desktop-app", "frontend", "src", "assets", "logo.png"),
]

_BASE = dict(fontName="Helvetica", fontSize=8.5, leading=11, textColor=INK)
STYLES = {
    "title": ParagraphStyle("title", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 20, "leading": 24}),
    "label": ParagraphStyle("label", **{**_BASE, "fontSize": 7.5, "textColor": MUTED}),
    "value": ParagraphStyle("value", **{**_BASE, "alignment": TA_RIGHT}),
    "party": ParagraphStyle("party", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 13, "leading": 16}),
    "small_bold": ParagraphStyle("small_bold", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 7.5}),
    "body": ParagraphStyle("body", **_BASE),
    "cell": ParagraphStyle("cell", **{**_BASE, "fontSize": 8}),
    "cell_right": ParagraphStyle("cell_right", **{**_BASE, "fontSize": 8, "alignment": TA_RIGHT}),
    "head": ParagraphStyle("head", **{**_BASE, "fontName": "Helvetica-Oblique", "fontSize": 7.5, "textColor": MUTED}),
    "head_right": ParagraphStyle("head_right", **{**_BASE, "fontName": "Helvetica-Oblique", "fontSize": 7.5,
                                                   "textColor": MUTED, "alignment": TA_RIGHT}),
    "rep": ParagraphStyle("rep", **{**_BASE, "fontSize": 7.5, "leading": 9, "textColor": colors.white, "alignment": 1}),
    "due_label": ParagraphStyle("due_label", **{**_BASE, "fontSize": 9, "textColor": MUTED, "alignment": TA_RIGHT}),
    "due": ParagraphStyle("due", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 16, "leading": 20, "alignment": TA_RIGHT}),
}


def money(value) -> str:
    return f"{CURRENCY}{value:,.2f}"


def _date(value) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    return value.strftime("%d/%m/%Y")


def _text(value) -> str:
    """User text for a Paragraph: escaped, newlines kept."""
    return escape(value or "").replace("\n", "<br/>")


def _p(text, style="body"):
    return Paragraph(text, STYLES[style])


@lru_cache(maxsize=1)
def _logo_bytes():
    """The logo shrunk to print size once, so each PDF stays small."""
    path = next((p for p in _LOGO_CANDIDATES if os.path.exists(p)), None)
    if path is None:
        return None
    from PIL import Image as PILImage
    with PILImage.open(path) as img:
        img = img.convert("RGBA")
        img.thumbnail((300, 300))
        flat = PILImage.new("RGB", img.size, "white")  # the page is white; JPEG is ~10x smaller than PNG here
        flat.paste(img, mask=img.getchannel("A"))
        out = io.BytesIO()
        flat.save(out, format="JPEG", quality=88)
    return out.getvalue()


class _AtPageFoot(Flowable):
    """Draws its content at the foot of the page (like Sage's totals block).
    Takes the rest of the page when the content fits there; otherwise it
    moves to the next page and sits at the foot of that one."""

    def __init__(self, content):
        super().__init__()
        self.content = content

    def wrap(self, avail_width, avail_height):
        _, content_height = self.content.wrap(avail_width, avail_height)
        self.height = avail_height if content_height <= avail_height else content_height
        return avail_width, self.height

    def draw(self):
        self.content.drawOn(self.canv, 0, 0)


class _NumberedCanvas(pdf_canvas.Canvas):
    """Adds "Page x of y" once the total page count is known."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pages = []

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._pages)
        for state in self._pages:
            self.__dict__.update(state)
            self.setFont("Helvetica", 7.5)
            self.setFillColor(MUTED)
            self.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {self._pageNumber} of {total}")
            super().showPage()
        super().save()


def _key_values(rows, width):
    table = Table([[_p(label.upper(), "label"), _p(_text(value), "value")] for label, value in rows],
                  colWidths=[width * 0.45, width * 0.55])
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 0.5),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 0.5), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    return table


def _logo_block(business):
    parts = []
    logo = _logo_bytes()
    if logo:
        parts.append(Image(io.BytesIO(logo), width=30 * mm, height=30 * mm))
    rep = "<br/>".join(_text(v) for v in (business.sales_rep, business.sales_rep_phone) if v)
    if rep:
        box = Table([[_p(rep, "rep")]], colWidths=[40 * mm])
        box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BRAND), ("TOPPADDING", (0, 0), (-1, -1), 2),
                                 ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        parts.append(box)
    table = Table([[p] for p in parts] or [[""]], colWidths=[45 * mm])
    table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 1),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    return table


def _party(caption, name, vat_label, vat_number, postal, physical, width):
    if postal is None:  # suppliers have one address
        addresses = Table([[_p("ADDRESS:", "small_bold")], [_p(_text(physical))]], colWidths=[width])
    else:
        addresses = Table(
            [[_p("POSTAL ADDRESS:", "small_bold"), _p("PHYSICAL ADDRESS:", "small_bold")],
             [_p(_text(postal)), _p(_text(physical))]],
            colWidths=[width / 2, width / 2],
        )
    addresses.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                   ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    rows = [[_p(caption, "label")], [_p(_text(name).upper(), "party")],
            [_p(f"<b>{vat_label}</b> {_text(vat_number)}", "small_bold")], [addresses]]
    table = Table(rows, colWidths=[width])
    table.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
    return table


def _lines_table(lines, width):
    """`lines` are dicts: description, quantity, unit_price, discount_percent, vat_percent."""
    widths = [0.29, 0.09, 0.12, 0.095, 0.095, 0.155, 0.155]
    header = [_p("Description", "head")] + [_p(h, "head_right") for h in
                                            ("Quantity", "Unit Price", "Disc %", "VAT %", "Excl. Total", "Incl. Total")]
    rows = [header]
    for line in lines:
        amounts = line_amounts(line["quantity"], line["unit_price"], line.get("discount_percent"), line.get("vat_percent"))
        rows.append([
            _p(_text(line["description"]), "cell"),
            _p(f"{line['quantity']:g}", "cell_right"),
            _p(money(line["unit_price"]), "cell_right"),
            _p(f"{line.get('discount_percent') or 0:.2f}%", "cell_right"),
            _p(f"{line.get('vat_percent') or 0:.2f}%", "cell_right"),
            _p(money(amounts["exclusive"]), "cell_right"),
            _p(f"<b>{money(amounts['inclusive'])}</b>", "cell_right"),
        ])
    table = Table(rows, colWidths=[width * w for w in widths], repeatRows=1)
    table.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, RULE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def _footer(bank_details, totals, due_label, due_amount, width):
    total_rows = [("Total Discount:", totals["total_discount"]), ("Total Exclusive:", totals["total_exclusive"]),
                  ("Total VAT:", totals["total_vat"]), ("Sub Total:", totals["grand_total"])]
    right = [[_p(label, "body"), _p(money(value), "value")] for label, value in total_rows]
    right += [["", ""], [_p("Grand Total:", "body"), _p(f"<b>{money(totals['grand_total'])}</b>", "value")],
              [_p(due_label.upper(), "due_label"), ""], [_p(money(due_amount), "due"), ""]]
    totals_table = Table(right, colWidths=[width * 0.25, width * 0.2])
    totals_table.setStyle(TableStyle([("SPAN", (0, -2), (-1, -2)), ("SPAN", (0, -1), (-1, -1)),
                                      ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    footer = Table([[_p(_text(bank_details)), totals_table]], colWidths=[width * 0.55, width * 0.45])
    footer.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEABOVE", (0, 0), (-1, 0), 0.75, RULE),
                                ("TOPPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (0, 0), 0)]))
    return footer


def _build(title, meta, business, to_party, lines, notes, due_label, paid=False, show_bank=True):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=15 * mm, bottomMargin=18 * mm, title=title)
    width = doc.width - 12  # the page frame keeps 6pt padding each side

    heading = Table([[[_p(_text(title), "title"), Spacer(1, 4), _key_values(meta, width * 0.42)], _logo_block(business)]],
                    colWidths=[width * 0.55, width * 0.45])
    heading.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                                 ("LEFTPADDING", (0, 0), (0, 0), 0)]))

    half = width * 0.48
    parties = Table([[
        _party("FROM", business.trading_name, "VAT NO:", business.vat_number,
               business.postal_address, business.physical_address, half),
        _party(*to_party, half),
    ]], colWidths=[width * 0.52, width * 0.48])
    parties.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, 0), 0)]))

    totals = document_totals([line_amounts(l["quantity"], l["unit_price"], l.get("discount_percent"),
                                           l.get("vat_percent")) for l in lines])
    footer = _footer(business.bank_details if show_bank else None, totals, due_label,
                     0.0 if paid else totals["grand_total"], width)

    story = [heading, Spacer(1, 10 * mm), parties, Spacer(1, 8 * mm), _lines_table(lines, width)]
    if notes:
        story += [Spacer(1, 6 * mm), KeepTogether([_p("NOTES:", "small_bold"), _p(_text(notes))])]
    story.append(_AtPageFoot(footer))

    doc.build(story, canvasmaker=_NumberedCanvas)
    buffer.seek(0)
    return buffer


def _client_party(client):
    return ("TO", client.name, "CUSTOMER VAT NO:", client.vat_number, client.postal_address or "", client.address)


def _dicts(items):
    return [{"description": i.description, "quantity": i.quantity, "unit_price": i.unit_price,
             "discount_percent": i.discount_percent, "vat_percent": i.vat_percent} for i in items]


def generate_invoice_pdf(business, invoice, client, lines):
    title = "TAX INVOICE" if business.vat_registered else "INVOICE"
    if invoice.status == "cancelled":
        title += " (CANCELLED)"
    meta = [("Number", invoice.number or f"#{invoice.id}"), ("Reference", invoice.reference),
            ("Date", _date(invoice.date)), ("Due date", _date(invoice.due_date)), ("Sales rep", business.sales_rep)]
    return _build(title, meta, business, _client_party(client), lines, invoice.notes, "Balance due",
                  paid=invoice.status in ("paid", "cancelled"))


def generate_quote_pdf(business, quote, client, lines):
    meta = [("Number", quote.number or f"#{quote.id}"), ("Reference", quote.reference),
            ("Date", _date(quote.date)), ("Valid until", _date(quote.expiry_date)), ("Sales rep", business.sales_rep)]
    return _build("QUOTATION", meta, business, _client_party(client), lines, quote.notes, "Quote total")


def generate_purchase_order_pdf(business, po, supplier, items):
    meta = [("Number", po.number or f"#{po.id}"), ("Reference", po.reference),
            ("Date", _date(po.date)), ("Delivery date", _date(po.delivery_date))]
    to_party = ("SUPPLIER", supplier.name, "SUPPLIER VAT NO:", supplier.vat_number, None, supplier.address)
    return _build("PURCHASE ORDER", meta, business, to_party, _dicts(items), po.notes, "Total due", show_bank=False)
