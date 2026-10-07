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
from reportlab.lib.pagesizes import A4, landscape
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
            self.drawRightString(self._pagesize[0] - 18 * mm, 10 * mm, f"Page {self._pageNumber} of {total}")
            super().showPage()
        super().save()


def _key_values(rows, width):
    table = Table([[_p(label.upper(), "label"), _p(_text(value), "value")] for label, value in rows],
                  colWidths=[width * 0.45, width * 0.55])
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 0.5),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 0.5), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    return table


def _logo_block(rep):
    """`rep` is the (name, phone) printed in the green box under the logo."""
    parts = []
    logo = _logo_bytes()
    if logo:
        parts.append(Image(io.BytesIO(logo), width=30 * mm, height=30 * mm))
    rep = "<br/>".join(_text(v) for v in rep if v)
    if rep:
        box = Table([[_p(rep, "rep")]], colWidths=[40 * mm])
        box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BRAND), ("TOPPADDING", (0, 0), (-1, -1), 2),
                                 ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        parts.append(box)
    table = Table([[p] for p in parts] or [[""]], colWidths=[45 * mm])
    table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 1),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    return table


def _party(caption, name, details, postal, physical, width):
    """`details` are (label, value) lines under the name, e.g. the VAT number."""
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
    rows = [[_p(caption, "label")], [_p(_text(name).upper(), "party")]]
    rows += [[_p(f"<b>{label}</b> {_text(value)}", "small_bold")] for label, value in details]
    rows.append([addresses])
    table = Table(rows, colWidths=[width])
    table.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
    return table


def _lines_table(lines, width):
    """`lines` are dicts: description, quantity, unit_price, discount_percent, vat_percent,
    and optionally `section` - a heading row (a herding program step) above its lines."""
    widths = [0.29, 0.09, 0.12, 0.095, 0.095, 0.155, 0.155]
    header = [_p("Description", "head")] + [_p(h, "head_right") for h in
                                            ("Quantity", "Unit Price", "Disc %", "VAT %", "Excl. Total", "Incl. Total")]
    rows = [header]
    sections = []
    section = None
    for line in lines:
        if line.get("section") and line["section"] != section:
            section = line["section"]
            rows.append([_p(f"<b>{_text(section)}</b>", "cell")] + [""] * 6)
            sections.append(len(rows) - 1)
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
    ] + [cmd for r in sections for cmd in (("SPAN", (0, r), (-1, r)),
                                            ("BACKGROUND", (0, r), (-1, r), colors.HexColor("#ecfdf5")))]))
    return table


def _business_details(business):
    """The FROM block's lines: VAT number (always shown, as on Sage documents),
    then registration number and contact details when they're filled in."""
    optional = [("REG NO:", business.registration_number), ("TEL:", business.phone),
                ("EMAIL:", business.email), ("WEB:", business.website)]
    return [("VAT NO:", business.vat_number)] + [(label, value) for label, value in optional if value]


def _bank_block(business, width):
    rows = [(label, value) for label, value in (
        ("Bank:", business.bank_name), ("Account holder:", business.bank_account_holder),
        ("Account number:", business.bank_account_number), ("Branch code:", business.bank_branch_code),
        ("Account type:", business.bank_account_type),
    ) if value]
    if not rows and not business.payment_note:
        return None
    cells = [[_p("BANKING DETAILS", "small_bold"), ""]]
    cells += [[_p(label, "label"), _p(_text(value))] for label, value in rows]
    if business.payment_note:
        cells.append([_p(_text(business.payment_note)), ""])
    table = Table(cells, colWidths=[width * 0.35, width * 0.65])
    style = [("SPAN", (0, 0), (-1, 0)), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]
    if business.payment_note:
        style.append(("SPAN", (0, -1), (-1, -1)))
    table.setStyle(TableStyle(style))
    return table


def _footer(bank, totals, due_label, due_amount, width):
    total_rows = [("Total Discount:", totals["total_discount"]), ("Total Exclusive:", totals["total_exclusive"]),
                  ("Total VAT:", totals["total_vat"]), ("Sub Total:", totals["grand_total"])]
    right = [[_p(label, "body"), _p(money(value), "value")] for label, value in total_rows]
    right += [["", ""], [_p("Grand Total:", "body"), _p(f"<b>{money(totals['grand_total'])}</b>", "value")],
              [_p(due_label.upper(), "due_label"), ""], [_p(money(due_amount), "due"), ""]]
    totals_table = Table(right, colWidths=[width * 0.25, width * 0.2])
    totals_table.setStyle(TableStyle([("SPAN", (0, -2), (-1, -2)), ("SPAN", (0, -1), (-1, -1)),
                                      ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    footer = Table([[bank or "", totals_table]], colWidths=[width * 0.55, width * 0.45])
    footer.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEABOVE", (0, 0), (-1, 0), 0.75, RULE),
                                ("TOPPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (0, 0), 0)]))
    return footer


def _build(title, meta, business, rep, to_party, lines, notes, due_label, paid=False, show_bank=True):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=15 * mm, bottomMargin=18 * mm, title=title)
    width = doc.width - 12  # the page frame keeps 6pt padding each side

    heading = Table([[[_p(_text(title), "title"), Spacer(1, 4), _key_values(meta, width * 0.42)], _logo_block(rep)]],
                    colWidths=[width * 0.55, width * 0.45])
    heading.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                                 ("LEFTPADDING", (0, 0), (0, 0), 0)]))

    half = width * 0.48
    parties = Table([[
        _party("FROM", business.trading_name, _business_details(business),
               business.postal_address, business.physical_address, half),
        _party(*to_party, half),
    ]], colWidths=[width * 0.52, width * 0.48])
    parties.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, 0), 0)]))

    totals = document_totals([line_amounts(l["quantity"], l["unit_price"], l.get("discount_percent"),
                                           l.get("vat_percent")) for l in lines])
    footer = _footer(_bank_block(business, width * 0.5) if show_bank else None, totals, due_label,
                     0.0 if paid else totals["grand_total"], width)

    story = [heading, Spacer(1, 10 * mm), parties, Spacer(1, 8 * mm), _lines_table(lines, width)]
    if notes:
        story += [Spacer(1, 6 * mm), KeepTogether([_p("NOTES:", "small_bold"), _p(_text(notes))])]
    story.append(_AtPageFoot(footer))

    doc.build(story, canvasmaker=_NumberedCanvas)
    buffer.seek(0)
    return buffer


def _client_party(client):
    return ("TO", client.name, [("CUSTOMER VAT NO:", client.vat_number)], client.postal_address or "", client.address)


def _dicts(items):
    return [{"description": i.description, "quantity": i.quantity, "unit_price": i.unit_price,
             "discount_percent": i.discount_percent, "vat_percent": i.vat_percent} for i in items]


def generate_invoice_pdf(business, invoice, client, lines, rep=(None, None)):
    title = "TAX INVOICE" if business.vat_registered else "INVOICE"
    if invoice.status == "cancelled":
        title += " (CANCELLED)"
    meta = [("Number", invoice.number or f"#{invoice.id}"), ("Reference", invoice.reference),
            ("Date", _date(invoice.date)), ("Due date", _date(invoice.due_date)), ("Sales rep", rep[0])]
    return _build(title, meta, business, rep, _client_party(client), lines, invoice.notes, "Balance due",
                  paid=invoice.status in ("paid", "cancelled"))


def generate_quote_pdf(business, quote, client, lines, rep=(None, None)):
    meta = [("Number", quote.number or f"#{quote.id}"), ("Reference", quote.reference),
            ("Date", _date(quote.date)), ("Valid until", _date(quote.expiry_date)), ("Sales rep", rep[0])]
    return _build("QUOTATION", meta, business, rep, _client_party(client), lines, quote.notes, "Quote total")


def generate_purchase_order_pdf(business, po, supplier, items, rep=(None, None)):
    meta = [("Number", po.number or f"#{po.id}"), ("Reference", po.reference),
            ("Date", _date(po.date)), ("Delivery date", _date(po.delivery_date))]
    to_party = ("SUPPLIER", supplier.name, [("SUPPLIER VAT NO:", supplier.vat_number)], None, supplier.address)
    return _build("PURCHASE ORDER", meta, business, rep, to_party, _dicts(items), po.notes, "Total due", show_bank=False)


# --- Product catalogue (client-facing: selling prices only, never cost) ---

_CAT = {
    "title": ParagraphStyle("cat_title", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 22, "leading": 26}),
    "sub": ParagraphStyle("cat_sub", **{**_BASE, "fontSize": 9, "textColor": MUTED}),
    "section": ParagraphStyle("cat_section", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 11, "textColor": colors.white}),
    "name": ParagraphStyle("cat_name", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 9.5, "leading": 12}),
    "meta": ParagraphStyle("cat_meta", **{**_BASE, "fontSize": 7.5, "leading": 9.5, "textColor": MUTED}),
    "desc": ParagraphStyle("cat_desc", **{**_BASE, "fontSize": 8, "leading": 10}),
    "price": ParagraphStyle("cat_price", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 12, "leading": 15}),
    "stock": ParagraphStyle("cat_stock", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 7.5, "textColor": colors.HexColor("#b91c1c")}),
    "qty": ParagraphStyle("cat_qty", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 8, "leading": 10}),
    "how": ParagraphStyle("cat_how", **{**_BASE, "fontSize": 9, "leading": 12}),
}

# Field names on the fillable order form, read back by app/core/order_form.py.
ORDER_QTY_PREFIX = "qty_"
ORDER_PICK_PREFIX = "pick_"  # tick box: ticked with no quantity typed = 1
ORDER_CLIENT_FIELD = "order_client"
ORDER_NOTES_FIELD = "order_notes"


class _TickBox(Flowable):
    """A fillable PDF tick box (AcroForm checkbox, on-state /Yes)."""

    def __init__(self, name, size, tooltip=None):
        super().__init__()
        self.name, self.width, self.height, self.tooltip = name, size, size, tooltip

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        self.canv.acroForm.checkbox(
            name=self.name, tooltip=self.tooltip, x=0, y=0, relative=True, size=self.width, buttonStyle="check",
            borderColor=BRAND, fillColor=colors.white, textColor=BRAND, borderWidth=1, forceBorder=True,
            fieldFlags="", annotationFlags="print",
        )


class _FormField(Flowable):
    """A fillable PDF text box (AcroForm) placed like any other flowable."""

    def __init__(self, name, width, height, value="", tooltip=None, multiline=False, hidden=False):
        super().__init__()
        self.name, self.width, self.height = name, width, height
        self.value, self.tooltip, self.multiline, self.hidden = value, tooltip, multiline, hidden

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        self.canv.acroForm.textfield(
            name=self.name, value=self.value, tooltip=self.tooltip, x=0, y=0, relative=True,
            width=self.width, height=self.height, fontName="Helvetica", fontSize=10,
            borderColor=BRAND, fillColor=colors.white, textColor=INK, borderWidth=1, forceBorder=True,
            maxlen=1000 if self.multiline else 10,
            fieldFlags="readOnly" if self.hidden else ("multiline" if self.multiline else ""),
            annotationFlags="hidden" if self.hidden else "print",
        )


def _fit_image(data, box):
    """A reportlab Image scaled to fit a box x box square, keeping its shape."""
    from PIL import Image as PILImage
    with PILImage.open(io.BytesIO(data)) as img:
        w, h = img.size
    scale = box / max(w, h)
    return Image(io.BytesIO(data), width=w * scale, height=h * scale)


def _catalogue_card(product, picture, width, price_note, order_form=False):
    box = 24 * mm
    pic = _fit_image(picture, box) if picture else ""
    meta = " · ".join(_text(v) for v in (
        product.code,
        product.packaging,
        f"{product.pack_size:g} {product.unit}" if product.pack_size and not product.packaging else None,
    ) if v)
    text = [Paragraph(_text(product.name), _CAT["name"])]
    if meta:
        text.append(Paragraph(meta, _CAT["meta"]))
    if product.description:
        text.append(Paragraph(_text(product.description), _CAT["desc"]))
    text.append(Paragraph(f"{money(product.price)} <font size=7 color='#6b7280'>{price_note}</font>", _CAT["price"]))
    if product.in_stock is False:
        text.append(Paragraph("Out of stock", _CAT["stock"]))
    if order_form:
        qty = Table([[_TickBox(f"{ORDER_PICK_PREFIX}{product.id}", 5 * mm, tooltip=f"I want {product.name}"),
                      Paragraph("Qty", _CAT["qty"]),
                      _FormField(f"{ORDER_QTY_PREFIX}{product.id}", 16 * mm, 6 * mm, tooltip=f"How many {product.name}")]],
                    colWidths=[7 * mm, 8 * mm, 17 * mm], hAlign="LEFT")
        qty.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                 ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        text.append(qty)
    card = Table([[pic, text]], colWidths=[box + 4, width - box - 4])
    card.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE), ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return card


def generate_catalogue_pdf(business, groups, order_for=None):
    """`groups` is [(category, [(product, thumbnail_jpeg_or_None), ...]), ...].
    With `order_for` (a client) it's also a fillable order form: a Qty box on
    every product, a notes box, and the client's id in a hidden field so the
    returned form can be turned into a quote for them."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=14 * mm, bottomMargin=16 * mm, title="Product catalogue")
    width = doc.width - 12
    logo = _logo_bytes()
    contact = " · ".join(_text(v) for v in (business.phone, business.email, business.website) if v)
    header_text = [Paragraph("PRODUCT CATALOGUE", _CAT["title"]),
                   Paragraph(f"<b>{_text(business.trading_name)}</b>", _CAT["sub"])]
    if order_for is not None:
        header_text.append(Paragraph(f"Order form for <b>{_text(order_for.name)}</b>", _CAT["sub"]))
    if contact:
        header_text.append(Paragraph(contact, _CAT["sub"]))
    header_text.append(Paragraph(f"Prices as at {datetime.now().strftime('%d/%m/%Y')} - subject to change.", _CAT["sub"]))
    header = Table([[Image(io.BytesIO(logo), width=24 * mm, height=24 * mm) if logo else "", header_text]],
                   colWidths=[28 * mm, width - 28 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (0, 0), 0)]))

    price_note = "incl. VAT" if business.vat_registered else ""
    story = [header, Spacer(1, 6 * mm)]
    if order_for is not None:
        send_to = " or ".join(v for v in (
            f"WhatsApp ({_text(business.phone)})" if business.phone else None,
            f"email ({_text(business.email)})" if business.email else None,
        ) if v) or "us"
        story += [
            _FormField(ORDER_CLIENT_FIELD, 1, 1, value=str(order_for.id), hidden=True),
            Paragraph("<b>How to order:</b> tick each product you want and type how many in its Qty box, add any notes "
                      f"at the end, then save this PDF and send it back to us on {send_to}.", _CAT["how"]),
            Spacer(1, 5 * mm),
        ]
    if not groups:
        story.append(_p("No products to show yet."))
    half = (width - 6) / 2
    for category, items in groups:
        bar = Table([[Paragraph(_text(category), _CAT["section"])]], colWidths=[width])
        bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BRAND), ("TOPPADDING", (0, 0), (-1, -1), 4),
                                 ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        cards = [_catalogue_card(p, pic, half, price_note, order_for is not None) for p, pic in items]
        rows = [cards[i:i + 2] + [""] * (2 - len(cards[i:i + 2])) for i in range(0, len(cards), 2)]
        grid = Table(rows, colWidths=[half + 3, half + 3])
        grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                  ("RIGHTPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 0), (-1, -1), 3),
                                  ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        # Keeps a heading with its products; a category too long for one page still flows on.
        story += [KeepTogether([bar, Spacer(1, 2 * mm), grid]), Spacer(1, 5 * mm)]
    if order_for is not None:
        story.append(KeepTogether([
            Paragraph("<b>Notes for your order</b> (delivery, collection, anything else)", _CAT["how"]),
            Spacer(1, 2 * mm),
            _FormField(ORDER_NOTES_FIELD, width, 28 * mm, tooltip="Notes for your order", multiline=True),
        ]))
    doc.build(story, canvasmaker=_NumberedCanvas)
    buffer.seek(0)
    return buffer


# --- A client's herding program, laid out like the business's Excel sheet ---

_PROG = {
    "cell": ParagraphStyle("prog_cell", **{**_BASE, "fontSize": 7.5, "leading": 9.5}),
    "head": ParagraphStyle("prog_head", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 8, "textColor": colors.white}),
    "date": ParagraphStyle("prog_date", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 8.5, "leading": 10.5}),
    "products": ParagraphStyle("prog_products", **{**_BASE, "fontSize": 7.5, "leading": 9.5, "textColor": BRAND}),
}
PROGRAM_COLUMNS = [("stage", "Stage"), ("management", "Herd management"), ("vaccinations", "Vaccinations"),
                   ("dosing", "Dosing"), ("vitamins", "Vitamins & trace elements"), ("feeding", "Feeding")]


def _amount(value) -> str:
    return f"{value:g}"


def _product_line(line) -> str:
    who = _text(line["animal_group"] or "all animals")
    text = f"<b>{_text(line['product_name'])}</b>"
    if line.get("fixed_quantity"):
        text += f" x {_amount(line['fixed_quantity'])}"
    elif line["dose"]:
        text += f" - {_amount(line['dose'])} {_text(line['unit'])} per animal ({who})"
        if line["total"]:
            text += f": {line['head']} x {_amount(line['dose'])} = {_amount(line['total'])} {_text(line['unit'])}"
            if line["pack_size"]:
                text += f" ({_amount(line['buy'])} x {_amount(line['pack_size'])} {_text(line['unit'])})"
    if line["note"]:
        text += f" - {_text(line['note'])}"
    return text


def generate_program_pdf(business, client, program, groups, schedule, template):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm,
                            topMargin=12 * mm, bottomMargin=16 * mm, title=program.name)
    width = doc.width
    anchors = schedule["anchors"]
    logo = _logo_bytes()
    who = " - ".join(v for v in (client.name if client else None, client.farm_name if client else None) if v)
    facts = [f"First mating: <b>{anchors['mating_start']:%a %d %b %Y}</b>",
             f"Mating season: <b>{program.mating_weeks or template.mating_weeks} weeks</b>",
             f"Lambing starts: <b>{anchors['lambing_start']:%d %b %Y}</b>",
             f"Weaning: <b>{anchors['weaning']:%d %b %Y}</b>"]
    head_counts = " · ".join(f"{_text(g.animal_type)} {g.group_size}" for g in groups)
    contact = " · ".join(_text(v) for v in (business.trading_name, business.phone, business.email) if v)
    header_text = [Paragraph(_text(template.name.upper()), _CAT["title"]),
                   Paragraph(f"<b>{_text(program.name)}</b>" + (f" for <b>{_text(who)}</b>" if who else ""), _CAT["sub"]),
                   Paragraph(" · ".join(facts), _CAT["sub"])]
    if head_counts:
        header_text.append(Paragraph(f"Animals: {head_counts}", _CAT["sub"]))
    if contact:
        header_text.append(Paragraph(contact, _CAT["sub"]))
    header = Table([[header_text, Image(io.BytesIO(logo), width=22 * mm, height=22 * mm) if logo else ""]],
                   colWidths=[width - 26 * mm, 26 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, 0), 0),
                                ("ALIGN", (1, 0), (1, 0), "RIGHT")]))

    date_w, stage_w = 20 * mm, 32 * mm
    col_w = (width - date_w - stage_w) / (len(PROGRAM_COLUMNS) - 1)
    rows = [[Paragraph("Date", _PROG["head"])] + [Paragraph(label, _PROG["head"]) for _, label in PROGRAM_COLUMNS]]
    style = [("BACKGROUND", (0, 0), (-1, 0), BRAND), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("GRID", (0, 0), (-1, -1), 0.4, RULE), ("TOPPADDING", (0, 0), (-1, -1), 3),
             ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
    for step in schedule["steps"]:
        when = (f"{step['date']:%d %b %Y}" if step["date"] else "Any time") \
            + ("<br/><font color='#047857'>Done</font>" if step["status"] == "done" else "")
        rows.append([Paragraph(when, _PROG["date"])]
                    + [Paragraph(_text(step[key]), _PROG["cell"]) for key, _ in PROGRAM_COLUMNS])
        if step["products"]:
            rows.append(["", Paragraph("Products: " + "<br/>".join(_product_line(l) for l in step["products"]),
                                       _PROG["products"])] + [""] * (len(PROGRAM_COLUMNS) - 1))
            style.append(("SPAN", (1, len(rows) - 1), (-1, len(rows) - 1)))
    table = Table(rows, colWidths=[date_w, stage_w] + [col_w] * (len(PROGRAM_COLUMNS) - 1), repeatRows=1)
    table.setStyle(TableStyle(style))
    story = [header, Spacer(1, 5 * mm), table]
    if not schedule["steps"]:
        story.append(_p("The master herding program has no steps yet."))
    doc.build(story, canvasmaker=_NumberedCanvas)
    buffer.seek(0)
    return buffer


# --- A client's program costs, laid out like the business's cost sheet ---

_COST = {
    "cell": ParagraphStyle("cost_cell", **{**_BASE, "fontSize": 7.5, "leading": 9}),
    "num": ParagraphStyle("cost_num", **{**_BASE, "fontSize": 7.5, "leading": 9, "alignment": TA_RIGHT}),
    "head": ParagraphStyle("cost_head", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 7.5, "leading": 9,
                                           "textColor": colors.white}),
    "step": ParagraphStyle("cost_step", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 8.5, "leading": 10.5}),
    "sum": ParagraphStyle("cost_sum", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 8, "leading": 10,
                                         "alignment": TA_RIGHT}),
}


def _cost_row(line):
    pack = f"{_amount(line['pack_size'])} {_text(line['unit'] or '')}".strip() if line["pack_size"] else ""
    if line["fixed_quantity"]:
        dose, head = f"x {_amount(line['fixed_quantity'])}", ""
    else:
        dose = f"{_amount(line['dose'])} {_text(line['unit'] or '')}".strip() if line["dose"] else "-"
        head = f"{line['head']:,}" + (f"<br/><font size=6 color='#6b7280'>{_text(line['animal_group'])}</font>"
                                    if line["animal_group"] else "")
    used = f"{line['used']:.2f}" + (f" ({_amount(line['buy'])})" if line["buy"] != line["used"] else "")
    return [Paragraph(_text(line["category"]), _COST["cell"]), Paragraph(_text(line["product_name"]), _COST["cell"]),
            Paragraph(pack, _COST["cell"]), Paragraph(money(line["price_excl_vat"]), _COST["num"]),
            Paragraph(dose, _COST["num"]), Paragraph(head, _COST["num"]), Paragraph(used, _COST["num"]),
            Paragraph(money(line["cost_used"]), _COST["num"])]


def generate_program_cost_pdf(business, client, program, groups, schedule, rep=(None, None, None)):
    """Every step's products with pack, price excl VAT, dose, animals, packs
    used (whole packs to buy in brackets) and cost; step subtotals, the
    total and the cost per animal per year - the cost sheet, per client."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=12 * mm, rightMargin=12 * mm,
                            topMargin=12 * mm, bottomMargin=16 * mm, title=f"{program.name} - costs")
    width = doc.width
    totals = schedule["totals"]
    logo = _logo_bytes()
    year = schedule["anchors"]["lambing_start"].year if schedule["anchors"] else ""
    rep_lines = [_text(v) for v in rep if v]
    client_lines = [_text(v) for v in ((client.farm_name, client.name, client.address, client.email, client.phone,
                                        f"VAT no: {client.vat_number}" if client.vat_number else None)
                                       if client else ()) if v]
    counts = [[Paragraph(_text(g.animal_type), _COST["cell"]), Paragraph(f"{g.group_size:,}", _COST["num"])] for g in groups]
    counts.append([Paragraph("<b>Total animals</b>", _COST["cell"]), Paragraph(f"<b>{totals['animals']:,}</b>", _COST["num"])])
    count_table = Table(counts, colWidths=[30 * mm, 18 * mm])
    count_table.setStyle(TableStyle([("LINEABOVE", (0, -1), (-1, -1), 0.6, INK), ("TOPPADDING", (0, 0), (-1, -1), 1),
                                     ("BOTTOMPADDING", (0, 0), (-1, -1), 1), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    title = [Paragraph(f"VACCINATION &amp; DOSING COSTS {year}", _CAT["title"]),
             Paragraph(f"<b>{_text(program.name)}</b> · amounts exclude VAT", _CAT["sub"])]
    if rep_lines:
        title.append(Paragraph("Sales rep: " + " · ".join(rep_lines), _CAT["sub"]))
    header = Table([[title, Image(io.BytesIO(logo), width=22 * mm, height=22 * mm) if logo else ""]],
                   colWidths=[width - 26 * mm, 26 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, 0), 0),
                                ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    who = Table([[Paragraph("<br/>".join(client_lines) or "&nbsp;", _COST["cell"]), count_table]],
                colWidths=[width - 52 * mm, 52 * mm])
    who.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, 0), 0)]))

    widths = [26 * mm, 42 * mm, 16 * mm, 20 * mm, 16 * mm, 27 * mm, 18 * mm]
    widths.append(width - sum(widths))
    heads = ["", "Product", "Pack", "Price excl VAT", "Dose / animal", "Animals", "Packs used", "Total excl VAT"]
    rows = [[Paragraph(h, _COST["head"]) for h in heads]]
    style = [("BACKGROUND", (0, 0), (-1, 0), BRAND), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("LINEBELOW", (0, 1), (-1, -1), 0.3, RULE), ("TOPPADDING", (0, 0), (-1, -1), 2),
             ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]
    steps = {s["id"]: s for s in schedule["steps"]}
    for section in schedule["sections"]:  # the cost sheet's sections, each with its TOTAAL
        rows.append([Paragraph(_text(section["name"].upper()), _COST["head"])] + [""] * 7)
        style += [("SPAN", (0, len(rows) - 1), (-1, len(rows) - 1)), ("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), BRAND)]
        for step in (steps[i] for i in section["step_ids"]):
            when = f"{step['date']:%a %d %b %Y}" if step["date"] else ""
            label = " · ".join(_text(v) for v in (when, step["stage"]) if v) or "&nbsp;"
            rows.append([Paragraph(label, _COST["step"])] + [""] * 7)
            style += [("SPAN", (0, len(rows) - 1), (-1, len(rows) - 1)),
                      ("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), colors.HexColor("#ecfdf5"))]
            rows += [_cost_row(line) for line in step["products"]]
            if len(step["products"]) > 1:
                rows.append([""] * 6 + [Paragraph("Subtotal", _COST["num"]), Paragraph(money(step["subtotal"]), _COST["num"])])
        rows.append([""] * 5 + [Paragraph(f"TOTAAL {_text(section['name'].upper())}", _COST["sum"]), "",
                                Paragraph(money(section["subtotal"]), _COST["sum"])])
        style += [("SPAN", (5, len(rows) - 1), (6, len(rows) - 1)), ("LINEABOVE", (5, len(rows) - 1), (-1, len(rows) - 1), 0.8, INK)]
    table = Table(rows, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle(style))

    summary = Table([
        [Paragraph("Total (what's used)", _COST["sum"]), Paragraph(money(totals["cost_used"]), _COST["sum"])],
        [Paragraph("Total buying whole packs", _COST["num"]), Paragraph(money(totals["cost_buy"]), _COST["num"])],
        [Paragraph("Cost per animal per year", _COST["sum"]), Paragraph(money(totals["per_animal"]), _COST["sum"])],
    ], colWidths=[50 * mm, 30 * mm], hAlign="RIGHT")
    summary.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.8, INK), ("TOPPADDING", (0, 0), (-1, -1), 2)]))
    story = [header, Spacer(1, 3 * mm), who, Spacer(1, 4 * mm), table, Spacer(1, 3 * mm), summary]
    if business.trading_name:
        story += [Spacer(1, 4 * mm), _p(" · ".join(_text(v) for v in (business.trading_name, business.phone,
                                                                        business.email) if v), "label")]
    doc.build(story, canvasmaker=_NumberedCanvas)
    buffer.seek(0)
    return buffer
