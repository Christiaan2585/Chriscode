from reportlab.lib.pagesizes import LETTER
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
import io

CURRENCY = "R"  # ZAR - see Settings page / CLAUDE.md business configuration


def _document_pdf(title, document_data, items_data, client_data, extra_lines=None):
    """Shared layout for both invoices and quotes - same header/client block/
    items table/total, just a different title and an optional list of extra
    (label, value) lines (e.g. an invoice's status and notes)."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=LETTER)
    elements = []
    styles = getSampleStyleSheet()

    elements.append(Paragraph("<b>SANDVELD VEE DIENSTE</b>", styles["Title"]))
    elements.append(Paragraph(f"{title} #{document_data['id']}", styles["Heading2"]))
    elements.append(Spacer(1, 12))

    elements.append(Paragraph(f"<b>Client:</b> {client_data['name']}", styles["Normal"]))
    elements.append(Paragraph(f"<b>Date:</b> {document_data['date']}", styles["Normal"]))
    for label, value in extra_lines or []:
        elements.append(Paragraph(f"<b>{label}:</b> {value}", styles["Normal"]))
    elements.append(Spacer(1, 20))

    data = [["Product", "Qty", "Unit Price", "Subtotal"]]
    total = 0
    for item in items_data:
        name = item.get("product_name", "Unknown Product")
        row = [name, item["quantity"], f"{CURRENCY} {item['unit_price']:.2f}", f"{CURRENCY} {item['subtotal']:.2f}"]
        data.append(row)
        total += item["subtotal"]

    data.append(["", "", "TOTAL", f"{CURRENCY} {total:.2f}"])

    table = Table(data, colWidths=[200, 50, 100, 100])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
        ("BACKGROUND", (0, -1), (-1, -1), colors.beige),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 1, colors.black),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 20))

    if document_data.get("notes"):
        elements.append(Paragraph(f"<b>Notes:</b> {document_data['notes']}", styles["Normal"]))

    doc.build(elements)
    buffer.seek(0)
    return buffer


def generate_invoice_pdf(invoice_data, items_data, client_data):
    return _document_pdf(
        "Invoice",
        invoice_data,
        items_data,
        client_data,
        extra_lines=[("Status", invoice_data["status"].upper())],
    )


def generate_quote_pdf(quote_data, items_data, client_data):
    return _document_pdf(
        "Quotation",
        quote_data,
        items_data,
        client_data,
        extra_lines=[("Status", quote_data["status"].upper())],
    )
