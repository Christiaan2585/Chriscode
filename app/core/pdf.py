from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
import io

def generate_invoice_pdf(invoice_data, items_data, client_data):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=LETTER)
    elements = []
    styles = getSampleStyleSheet()

    # Header
    elements.append(Paragraph("<b>KYRON AGRI CRM</b>", styles['Title']))
    elements.append(Paragraph(f"Invoice #{invoice_data['id']}", styles['Heading2']))
    elements.append(Spacer(1, 12))

    # Client Info
    elements.append(Paragraph(f"<b>Client:</b> {client_data['name']}", styles['Normal']))
    elements.append(Paragraph(f"<b>Date:</b> {invoice_data['date']}", styles['Normal']))
    elements.append(Paragraph(f"<b>Status:</b> {invoice_data['status'].upper()}", styles['Normal']))
    elements.append(Spacer(1, 20))

    # Items Table
    data = [["Product", "Qty", "Unit Price", "Subtotal"]]
    total = 0
    for item in items_data:
        # We need product name here, so we'll assume items_data contains it
        name = item.get('product_name', 'Unknown Product')
        row = [name, item['quantity'], f"${item['unit_price']:.2f}", f"${item['subtotal']:.2f}"]
        data.append(row)
        total += item['subtotal']

    data.append(["", "", "TOTAL", f"${total:.2f}"])

    table = Table(data, colWidths=[200, 50, 100, 100])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, -1), (-1, -1), colors.beige),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 20))

    # Notes
    if invoice_data.get('notes'):
        elements.append(Paragraph(f"<b>Notes:</b> {invoice_data['notes']}", styles['Normal']))

    doc.build(elements)
    buffer.seek(0)
    return buffer
