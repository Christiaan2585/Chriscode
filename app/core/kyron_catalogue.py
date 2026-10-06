"""The supplier's (Kyron's) own catalogue book as the app's catalogue.

The business sells from Kyron's printed catalogue, in English and
Afrikaans, and wants clients to see exactly that. So the uploaded PDFs are
never redrawn: every page keeps its own drawing data byte for byte, the
page is made wider, and a column is added down the right-hand side:
- cover: the business's own name, contact details and the price date;
- each product page: the products on it (from the book's index), with
  this business's pack sizes and prices - and Qty boxes on an order form;
- every other page: a plain strip, so all pages are the same width.
Products in the app that aren't in the book follow on extra pages.

The book's content belongs to the supplier and the repo is public: the
PDFs live only in the data folder (dev: config/catalogue/, gitignored).
"""
import io
import json
import os
import re
from datetime import datetime

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (ArrayObject, BooleanObject, DecodedStreamObject, DictionaryObject, FloatObject,
                           NameObject, NumberObject, RectangleObject, TextStringObject)
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas

from app.core.pdf import (BRAND, INK, MUTED, ORDER_CLIENT_FIELD, ORDER_NOTES_FIELD, ORDER_PICK_PREFIX,
                          ORDER_QTY_PREFIX, money)

LANGUAGES = ("en", "af")
COLUMN_WIDTH = 150  # points (about 53 mm) added to the right of every page
PANEL = colors.HexColor("#f2f7f1")
# Index lines are "• Name  page". The bullet reads back differently depending
# on the PDF's font (a real "•", or a stray \x7f from standard encodings).
_BULLET = re.compile(r"^\s*[•·●▪∙‣\x7f]\s*(.+?)\s+(\d{1,3})\s*$", re.M)
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

LABELS = {
    "en": {"prices": "Prices", "incl": "incl. VAT", "request": "Price on request", "out": "Out of stock",
           "qty": "Qty", "as_at": "Prices as at", "order_for": "Order form for", "supplier": "Your supplier",
           "how": "Tick what you want and type how many in the Qty boxes, then save this PDF and send it back to us.",
           "other": "Other products", "notes": "Notes for your order (delivery, collection, anything else)"},
    "af": {"prices": "Pryse", "incl": "BTW ingesluit", "request": "Prys op aanvraag", "out": "Uit voorraad",
           "qty": "Hoev.", "as_at": "Pryse soos op", "order_for": "Bestelvorm vir", "supplier": "U verskaffer",
           "how": "Merk wat u wil hê en tik hoeveel in die Hoev.-blokkies, stoor dan hierdie PDF en stuur dit terug na ons.",
           "other": "Ander produkte", "notes": "Notas vir u bestelling (aflewering, afhaal, enigiets anders)"},
}


class CatalogueError(ValueError):
    pass


# --- Storing the uploaded books ---

def catalogue_dir() -> str:
    data_dir = os.getenv("SANDVELD_DATA_DIR")
    return os.path.join(data_dir, "catalogue") if data_dir else os.path.join(_PROJECT_ROOT, "config", "catalogue")


def pdf_path(lang: str) -> str:
    return os.path.join(catalogue_dir(), f"supplier-{lang}.pdf")


def _meta_path(lang: str) -> str:
    return os.path.join(catalogue_dir(), f"supplier-{lang}.json")


def tokens(text: str) -> list:
    return re.findall(r"[a-z0-9%]+", (text or "").lower())


def entry_key(name: str) -> str:
    return " ".join(tokens(name))


def parse_catalogue(data: bytes) -> dict:
    """The book's index: which products are on which catalogue page. The
    index is the first run of pages (within the first 12) listing
    "• Name  page"; catalogue page 1 is the page right after it."""
    try:
        reader = PdfReader(io.BytesIO(data))
        page_count = len(reader.pages)
    except Exception as exc:
        raise CatalogueError("That file isn't a PDF this app can read") from exc
    entries, index_pages = [], []
    for number in range(min(page_count, 12)):
        try:
            found = _BULLET.findall(reader.pages[number].extract_text() or "")
        except Exception:
            found = []
        if len(found) >= 2:
            index_pages.append(number + 1)
            entries += [(re.sub(r"\s+", " ", name).strip(), int(page)) for name, page in found]
        elif index_pages:
            break
    if not entries:
        raise CatalogueError("Couldn't find the catalogue's index (a page listing \"• Product  page\")")
    offset = index_pages[-1]
    if max(page for _, page in entries) + offset > page_count:
        raise CatalogueError("The index points to pages this PDF doesn't have")
    counts, out = {}, []
    for name, page in entries:
        out.append({"key": entry_key(name), "name": name, "page": page, "order": counts.get(page, 0)})
        counts[page] = counts.get(page, 0) + 1
    return {"pages": page_count, "offset": offset, "entries": out}


def keys_for(meta: dict, english: dict | None) -> list:
    """Link keys come from the English names. The Afrikaans book has the same
    products in the same places, so its entries take the English key of the
    same page and position (their own name only if the books differ)."""
    by_slot = {(e["page"], e["order"]): e["key"] for e in (english or {}).get("entries", [])}
    return [by_slot.get((e["page"], e["order"]), e["key"]) for e in meta["entries"]]


def save_catalogue(lang: str, data: bytes, filename: str | None = None) -> dict:
    meta = parse_catalogue(data)
    meta.update(uploaded_at=datetime.utcnow().isoformat(timespec="seconds"), filename=filename)
    os.makedirs(catalogue_dir(), exist_ok=True)
    with open(pdf_path(lang), "wb") as f:
        f.write(data)
    with open(_meta_path(lang), "w", encoding="utf-8") as f:
        json.dump(meta, f)
    return meta


def load_meta(lang: str) -> dict | None:
    if not os.path.exists(pdf_path(lang)):
        return None
    try:
        with open(_meta_path(lang), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def natural_key(text: str) -> list:
    """Sorts "1 L", "5 L", "20 L" by the numbers, not alphabetically."""
    return [(0, float(part)) if re.fullmatch(r"\d+(?:[.,]\d+)?", part) else (1, part)
            for part in re.findall(r"\d+(?:[.,]\d+)?|[a-z]+", (text or "").lower().replace(",", "."))]


def suggest(name: str, products) -> list:
    """Products whose name has every word of the catalogue name ("Bantik"
    -> "Bantik 1L", "BANTIK 5 L"), smallest pack first."""
    wanted = set(tokens(name))
    matches = [p for p in products if wanted and wanted <= set(tokens(p.name))]
    return [p.id for p in sorted(matches, key=lambda p: natural_key(p.name))]


# --- Building the priced book ---

def _pack_label(product) -> str:
    if product.packaging:
        return product.packaging
    if product.pack_size:
        return f"{product.pack_size:g} {product.unit}"
    return product.name


class _Column:
    """Draws the added column on one overlay page and remembers where the
    form fields go (they're added with pypdf afterwards)."""

    def __init__(self, c, x, width, height, labels):
        self.c, self.x, self.w, self.h, self.L = c, x, width, height, labels
        self.fields = []  # (name, rect, kind, value)

    def panel(self):
        self.c.setFillColor(PANEL)
        self.c.rect(self.x, 0, self.w, self.h, stroke=0, fill=1)

    def header(self, title, subtitle=None):
        self.c.setFillColor(BRAND)
        self.c.rect(self.x, self.h - 30, self.w, 30, stroke=0, fill=1)
        self.c.setFillColor(colors.white)
        self.c.setFont("Helvetica-Bold", 12)
        self.c.drawString(self.x + 10, self.h - 20, title)
        if subtitle:
            self.c.setFillColor(MUTED)
            self.c.setFont("Helvetica", 7)
            self.c.drawString(self.x + 10, self.h - 41, subtitle)

    def lines(self, y, text, font="Helvetica", size=8, color=INK, leading=None):
        leading = leading or size + 2
        self.c.setFillColor(color)
        self.c.setFont(font, size)
        for line in simpleSplit(text, font, size, self.w - 20):
            self.c.drawString(self.x + 10, y, line)
            y -= leading
        return y

    def tick_box(self, x, y, name):
        """A tick box (drawn here; the field itself is added by pypdf)."""
        size = TICK_SIZE
        self.c.setStrokeColor(BRAND)
        self.c.setFillColor(colors.white)
        self.c.rect(x, y - 1.5, size, size, stroke=1, fill=1)
        self.fields.append((name, [x, y - 1.5, x + size, y - 1.5 + size], "check", ""))

    def qty_box(self, y, name):
        box_w, box_h = 42, 13
        left = self.x + self.w - 10 - box_w
        self.c.setFillColor(MUTED)
        self.c.setFont("Helvetica", 7)
        self.c.drawRightString(left - 4, y + 3, self.L["qty"])
        self.c.setStrokeColor(BRAND)
        self.c.setFillColor(colors.white)
        self.c.rect(left, y - 1, box_w, box_h, stroke=1, fill=1)
        self.fields.append((name, [left, y - 1, left + box_w, y - 1 + box_h], "qty", ""))


QTY_LINE = 17  # the Qty box sits on its own line under the price
TICK_SIZE = 9


def _entry_height(products, order_form, name_lines):
    h = name_lines * 11 + 4
    for p in products:
        h += 11 + (9 if p.in_stock is False else 0) + (QTY_LINE if order_form else 0)
    return h + (11 if not products else 0)


def _draw_entry(col, y, name, products, order_form):
    y = col.lines(y, name, "Helvetica-Bold", 8.5, INK, 11) - 2
    if not products:
        return col.lines(y, col.L["request"], "Helvetica-Oblique", 7.5, MUTED)
    for p in products:
        label_x = col.x + 10
        if order_form:
            col.tick_box(label_x, y, f"{ORDER_PICK_PREFIX}{p.id}")
            label_x += TICK_SIZE + 4
        col.c.setFillColor(INK)
        col.c.setFont("Helvetica", 7.5)
        col.c.drawString(label_x, y, _pack_label(p)[:26])
        col.c.setFont("Helvetica-Bold", 8.5)
        col.c.drawRightString(col.x + col.w - 10, y, money(p.price))
        y -= 11
        if p.in_stock is False:
            col.c.setFillColor(colors.HexColor("#b91c1c"))
            col.c.setFont("Helvetica-Bold", 6.5)
            col.c.drawString(col.x + 10, y + 2, col.L["out"])
            y -= 9
        if order_form:
            col.qty_box(y - 4, f"{ORDER_QTY_PREFIX}{p.id}")  # box top stays clear of the price above
            y -= QTY_LINE
    return y


def _cover(col, business, logo, order_for, today):
    y = col.h - 24
    if logo:
        size = 64
        col.c.drawImage(ImageReader(io.BytesIO(logo)), col.x + (col.w - size) / 2, y - size, size, size, mask="auto")
        y -= size + 14
    y = col.lines(y, col.L["supplier"].upper(), "Helvetica-Bold", 7, MUTED)
    y = col.lines(y - 2, business.trading_name or "", "Helvetica-Bold", 10.5, BRAND, 13)
    for value in (business.phone, business.email, business.website):
        if value:
            y = col.lines(y, value, "Helvetica", 8)
    y = col.lines(y - 8, f"{col.L['as_at']} {today}", "Helvetica", 7.5, MUTED)
    if business.vat_registered:
        y = col.lines(y, col.L["incl"], "Helvetica", 7.5, MUTED)
    if order_for is not None:
        y = col.lines(y - 10, f"{col.L['order_for']}:", "Helvetica", 8, MUTED)
        y = col.lines(y, order_for.name, "Helvetica-Bold", 10, INK, 12)
        col.lines(y - 6, col.L["how"], "Helvetica", 7.5, INK, 10)
        col.fields.append((ORDER_CLIENT_FIELD, [col.x + 2, 2, col.x + 4, 4], "hidden", str(order_for.id)))


def _footer(col, business):
    text = " · ".join(v for v in (business.trading_name, business.phone) if v)
    if text:
        col.lines(18, text, "Helvetica", 6.5, MUTED, 8)


def _extra_pages(c, size, labels, business, others, order_form, fields_out):
    """Products not in the book, then (order form) the notes box."""
    width, height = size
    margin, y = 36, height - 40
    fields = []

    def new_page():
        nonlocal y, fields
        if fields or y < height - 40:
            fields_out.append(fields)
            c.showPage()
        fields, y = [], height - 40

    def heading(text):
        nonlocal y
        c.setFillColor(BRAND)
        c.rect(margin, y - 6, width - 2 * margin, 22, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(margin + 8, y + 1, text)
        y -= 30

    if others:
        heading(labels["other"])
        category = None
        for p in others:
            needed = 16 + (14 if (p.category or "") != category else 0)
            if y - needed < 50:
                new_page()
                heading(labels["other"])
                category = None
            if (p.category or "") != category:
                category = p.category or ""
                c.setFillColor(MUTED)
                c.setFont("Helvetica-Bold", 8)
                c.drawString(margin, y, category.upper() or "-")
                y -= 14
            name_x = margin
            if order_form:
                c.setStrokeColor(BRAND)
                c.setFillColor(colors.white)
                c.rect(margin, y - 1.5, TICK_SIZE, TICK_SIZE, stroke=1, fill=1)
                fields.append((f"{ORDER_PICK_PREFIX}{p.id}", [margin, y - 1.5, margin + TICK_SIZE, y - 1.5 + TICK_SIZE],
                               "check", ""))
                name_x += TICK_SIZE + 5
            c.setFillColor(INK)
            c.setFont("Helvetica", 9)
            c.drawString(name_x, y, p.name[:60])
            c.setFont("Helvetica", 8)
            c.drawString(width * 0.55, y, _pack_label(p)[:24] if (p.packaging or p.pack_size) else "")
            c.setFont("Helvetica-Bold", 9)
            c.drawRightString(width * 0.78, y, money(p.price))
            if p.in_stock is False:
                c.setFillColor(colors.HexColor("#b91c1c"))
                c.setFont("Helvetica-Bold", 6.5)
                c.drawString(width * 0.55, y - 8, labels["out"])
            if order_form:
                left, box_w = width - margin - 42, 42
                c.setFillColor(MUTED)
                c.setFont("Helvetica", 7)
                c.drawRightString(left - 4, y, labels["qty"])
                c.setStrokeColor(BRAND)
                c.setFillColor(colors.white)
                c.rect(left, y - 3, box_w, 13, stroke=1, fill=1)
                fields.append((f"{ORDER_QTY_PREFIX}{p.id}", [left, y - 3, left + box_w, y + 10], "qty", ""))
            y -= 16
        y -= 10
    if order_form:
        if y < 160:
            new_page()
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin, y, labels["notes"])
        y -= 8
        c.setStrokeColor(BRAND)
        c.setFillColor(colors.white)
        c.rect(margin, y - 90, width - 2 * margin, 90, stroke=1, fill=1)
        fields.append((ORDER_NOTES_FIELD, [margin, y - 90, width - margin, y], "notes", ""))
        y -= 110
    if others or order_form:
        fields_out.append(fields)
        c.showPage()


def _stack_overlay(writer, page, overlay):
    """Adds the overlay's drawing on top of the page WITHOUT touching the
    page's own content streams (pypdf's merge_page rewrites them, which grew
    the supplier's book by half). Overlay resources get an "Sv" prefix so
    they can't clash with the page's own names."""
    resources = page.get("/Resources")
    resources = resources.get_object() if resources is not None else None
    if resources is None:
        resources = DictionaryObject()
        page[NameObject("/Resources")] = resources
    overlay_resources = overlay["/Resources"].get_object()
    renames = {}
    for category in ("/Font", "/XObject", "/ExtGState"):
        if category not in overlay_resources:
            continue
        target = resources.get(category)
        if target is None:
            target = DictionaryObject()
            resources[NameObject(category)] = target
        target = target.get_object()
        for name, value in overlay_resources[category].get_object().items():
            new = NameObject("/Sv" + name[1:])
            target[new] = value.clone(writer)
            renames[name] = new
    data = overlay.get_contents().get_data()
    for old in sorted(renames, key=len, reverse=True):
        data = re.sub(re.escape(old.encode("latin-1")) + rb"(?![A-Za-z0-9_.\-])", renames[old].encode("latin-1"), data)
    before, after = DecodedStreamObject(), DecodedStreamObject()
    before.set_data(b"q\n")
    after.set_data(b"\nQ\n" + data)
    contents = page.get("/Contents")
    existing = []
    if contents is not None:
        resolved = contents.get_object()
        existing = list(resolved) if isinstance(resolved, ArrayObject) else [contents]
    page[NameObject("/Contents")] = ArrayObject(
        [writer._add_object(before), *existing, writer._add_object(after.flate_encode())])


def _tick_appearance(writer, zapf):
    """Ticked / empty looks for the tick boxes (phone PDF apps draw these
    rather than inventing their own): a green ZapfDingbats tick, or nothing."""
    def form(content):
        stream = DecodedStreamObject()
        stream.set_data(content)
        stream.update({
            NameObject("/Type"): NameObject("/XObject"), NameObject("/Subtype"): NameObject("/Form"),
            NameObject("/BBox"): ArrayObject([FloatObject(0), FloatObject(0), FloatObject(TICK_SIZE), FloatObject(TICK_SIZE)]),
            NameObject("/Resources"): DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/ZaDb"): zapf})}),
        })
        return writer._add_object(stream)

    tick = f"q 0.016 0.471 0.341 rg BT /ZaDb {TICK_SIZE * 0.85:.2f} Tf 1.2 1.6 Td (4) Tj ET Q".encode()
    return form(tick), form(b"")


def _add_fields(writer, page, specs, acro_fields, tick_on, tick_off):
    annots = page.get("/Annots")
    annots = annots.get_object() if annots is not None else ArrayObject()
    page[NameObject("/Annots")] = annots
    for name, rect, kind, value in specs:
        field = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"), NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Tx"), NameObject("/T"): TextStringObject(name),
            NameObject("/Rect"): ArrayObject([FloatObject(v) for v in rect]),
            NameObject("/F"): NumberObject(2 if kind == "hidden" else 4),
            NameObject("/DA"): TextStringObject("/Helv 10 Tf 0 g"), NameObject("/V"): TextStringObject(value),
            NameObject("/P"): page.indirect_reference,
        })
        if kind == "check":
            field.update({
                NameObject("/FT"): NameObject("/Btn"), NameObject("/V"): NameObject("/Off"),
                NameObject("/AS"): NameObject("/Off"), NameObject("/DA"): TextStringObject("/ZaDb 0 Tf 0 g"),
                NameObject("/MK"): DictionaryObject({NameObject("/CA"): TextStringObject("4")}),
                NameObject("/AP"): DictionaryObject({NameObject("/N"): DictionaryObject(
                    {NameObject("/Yes"): tick_on, NameObject("/Off"): tick_off})}),
            })
        elif kind == "notes":
            field[NameObject("/Ff")] = NumberObject(4096)  # multiline
        elif kind == "hidden":
            field[NameObject("/Ff")] = NumberObject(1)  # read-only
        elif kind == "qty":
            field[NameObject("/MaxLen")] = NumberObject(10)
        ref = writer._add_object(field)
        annots.append(ref)
        acro_fields.append(ref)


def build_pdf(lang, business, entries, linked, others, logo=None, order_for=None) -> bytes:
    """`entries`: the book's index for `lang` (page/order/name); `linked`:
    {(page, order): [products to price]}; `others`: products not in the book."""
    labels = LABELS[lang]
    meta = load_meta(lang)
    writer = PdfWriter(clone_from=pdf_path(lang))
    order_form = order_for is not None
    today = datetime.now().strftime("%d/%m/%Y")
    by_page = {}
    for e in entries:
        by_page.setdefault(e["page"], []).append(e)

    overlay_buf = io.BytesIO()
    c = canvas.Canvas(overlay_buf)
    page_fields = []
    for index, page in enumerate(writer.pages):
        width, height = float(page.mediabox.width), float(page.mediabox.height)
        c.setPageSize((width + COLUMN_WIDTH, height))
        col = _Column(c, width, COLUMN_WIDTH, height, labels)
        col.panel()
        catalogue_page = index + 1 - meta["offset"]
        if index == 0:
            _cover(col, business, logo, order_for, today)
        elif catalogue_page in by_page:
            col.header(labels["prices"], labels["incl"] if business.vat_registered else None)
            _footer(col, business)
            top, bottom = height - 52, 34
            items = [(e, linked.get((e["page"], e["order"]), [])) for e in by_page[catalogue_page]]
            heights = [_entry_height(p, order_form, len(simpleSplit(e["name"], "Helvetica-Bold", 8.5, COLUMN_WIDTH - 20)))
                       for e, p in items]
            slot = (top - bottom) / len(items)
            spread = sum(heights) <= top - bottom
            y = top
            for k, (e, products) in enumerate(items):
                if spread:
                    y = min(top - k * slot, y)  # line up with the book's product blocks where there's room
                y = _draw_entry(col, y, e["name"], products, order_form) - 10
        else:
            _footer(col, business)
        page_fields.append(col.fields)
        c.showPage()
    first = writer.pages[0]
    extra_fields = []
    _extra_pages(c, (float(first.mediabox.width) + COLUMN_WIDTH, float(first.mediabox.height)),
                 labels, business, others, order_form, extra_fields)
    c.save()
    overlay = PdfReader(io.BytesIO(overlay_buf.getvalue()))

    book_pages = len(writer.pages)
    for index in range(book_pages):
        page = writer.pages[index]
        width, height = float(page.mediabox.width), float(page.mediabox.height)
        box = RectangleObject([0, 0, width + COLUMN_WIDTH, height])
        for name in ("/MediaBox", "/CropBox", "/BleedBox", "/TrimBox", "/ArtBox"):
            if name in page:
                page[NameObject(name)] = box
        _stack_overlay(writer, page, overlay.pages[index])
    for extra in overlay.pages[book_pages:]:
        writer.add_page(extra)
    page_fields += extra_fields

    if order_form:
        root = writer._root_object
        form = root.get("/AcroForm")
        form = form.get_object() if form is not None else DictionaryObject()
        fields = form.get("/Fields")
        fields = fields.get_object() if fields is not None else ArrayObject()
        helv = writer._add_object(DictionaryObject({
            NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"), NameObject("/Encoding"): NameObject("/WinAnsiEncoding")}))
        zapf = writer._add_object(DictionaryObject({
            NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/ZapfDingbats")}))
        tick_on, tick_off = _tick_appearance(writer, zapf)
        for index, specs in enumerate(page_fields):
            if specs:
                _add_fields(writer, writer.pages[index], specs, fields, tick_on, tick_off)
        form.update({NameObject("/Fields"): fields, NameObject("/NeedAppearances"): BooleanObject(True),
                     NameObject("/DA"): TextStringObject("/Helv 0 Tf 0 g"),
                     NameObject("/DR"): DictionaryObject({NameObject("/Font"): DictionaryObject(
                         {NameObject("/Helv"): helv, NameObject("/ZaDb"): zapf})})})
        root[NameObject("/AcroForm")] = form
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
