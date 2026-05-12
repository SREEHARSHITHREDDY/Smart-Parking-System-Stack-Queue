"""
core/invoice.py — GST Invoice PDF Generation
MEDIUM #2

Generates a proper GST tax invoice for each parking exit.
Install: pip install reportlab
"""

import io
from datetime import datetime


def generate_gst_invoice(history_record, lot_name='Smart Parking', gst_number=''):
    """
    Generate a GST-compliant PDF invoice for a parking exit.
    Returns bytes of PDF or None if reportlab not installed.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    except ImportError:
        return None

    buf  = io.BytesIO()
    doc  = SimpleDocTemplate(buf, pagesize=A4,
                              rightMargin=2*cm, leftMargin=2*cm,
                              topMargin=2*cm, bottomMargin=2*cm)
    styles   = getSampleStyleSheet()
    title_st = ParagraphStyle('Title', parent=styles['Title'],
                               fontSize=22, textColor=colors.HexColor('#1F3864'),
                               spaceAfter=4, alignment=TA_CENTER)
    sub_st   = ParagraphStyle('Sub', parent=styles['Normal'],
                               fontSize=10, textColor=colors.grey,
                               spaceAfter=4, alignment=TA_CENTER)
    label_st = ParagraphStyle('Label', parent=styles['Normal'],
                               fontSize=9, textColor=colors.HexColor('#555555'))
    val_st   = ParagraphStyle('Val', parent=styles['Normal'],
                               fontSize=10, textColor=colors.black, fontName='Helvetica-Bold')
    total_st = ParagraphStyle('Total', parent=styles['Normal'],
                               fontSize=14, textColor=colors.HexColor('#1F3864'),
                               fontName='Helvetica-Bold', alignment=TA_RIGHT)

    elements = []

    # Header
    elements.append(Paragraph(lot_name, title_st))
    elements.append(Paragraph('TAX INVOICE', sub_st))
    if gst_number:
        elements.append(Paragraph(f'GSTIN: {gst_number}', sub_st))
    elements.append(Spacer(1, 0.3*cm))
    elements.append(HRFlowable(width='100%', thickness=2, color=colors.HexColor('#1F3864')))
    elements.append(Spacer(1, 0.3*cm))

    # Invoice details
    ticket_id  = history_record.get('ticket_id', 'N/A')
    plate      = history_record.get('number_plate', 'N/A')
    vtype      = history_record.get('vehicle_type', 'car').capitalize()
    entry_time = history_record.get('entry_time', '')[:16].replace('T', ' ')
    exit_time  = history_record.get('exit_time', '')[:16].replace('T', ' ')
    duration   = history_record.get('duration_min', 0)
    fee        = history_record.get('fee', 0)
    multiplier = history_record.get('multiplier', 1.0)
    surge_name = history_record.get('surge_name', '')

    hours   = int(duration // 60)
    mins    = int(duration % 60)
    dur_str = f"{hours}h {mins}m" if hours >= 1 else f"{mins} min"

    # GST calculation
    gst_rate   = 0.18
    base_fee   = round(fee / (1 + gst_rate), 2)
    gst_amount = round(fee - base_fee, 2)
    cgst       = round(gst_amount / 2, 2)
    sgst       = round(gst_amount / 2, 2)

    invoice_no   = f'INV-{ticket_id}-{datetime.now().strftime("%Y%m%d")}'
    invoice_date = datetime.now().strftime('%d %b %Y')

    details_data = [
        ['Invoice No.',    invoice_no,   'Invoice Date', invoice_date],
        ['Ticket ID',      ticket_id,    'Vehicle Type', vtype],
        ['Vehicle Number', plate,        'Entry Time',   entry_time],
        ['Exit Time',      exit_time,    'Duration',     dur_str],
    ]

    t_details = Table(details_data, colWidths=[3.5*cm, 5.5*cm, 3.5*cm, 5.5*cm])
    t_details.setStyle(TableStyle([
        ('FONTNAME',  (0,0), (0,-1), 'Helvetica'),
        ('FONTNAME',  (2,0), (2,-1), 'Helvetica'),
        ('FONTNAME',  (1,0), (1,-1), 'Helvetica-Bold'),
        ('FONTNAME',  (3,0), (3,-1), 'Helvetica-Bold'),
        ('FONTSIZE',  (0,0), (-1,-1), 9),
        ('TEXTCOLOR', (0,0), (0,-1), colors.HexColor('#555555')),
        ('TEXTCOLOR', (2,0), (2,-1), colors.HexColor('#555555')),
        ('ROWBACKGROUNDS', (0,0), (-1,-1), [colors.HexColor('#F5F7FA'), colors.white]),
        ('GRID',      (0,0), (-1,-1), 0.3, colors.HexColor('#DDDDDD')),
        ('PADDING',   (0,0), (-1,-1), 6),
    ]))
    elements.append(t_details)
    elements.append(Spacer(1, 0.4*cm))

    # Line items
    elements.append(Paragraph('Charges', styles['Heading3']))
    items_data = [['Description', 'Hours', 'Rate', 'Amount']]

    base_rate = history_record.get('base_rate', 30) or 30
    billing_hours = max(1, round(duration / 60))
    items_data.append([
        f'Parking Charges — {vtype}',
        str(billing_hours),
        f'Rs {base_rate}/hr',
        f'Rs {round(base_rate * billing_hours, 2)}'
    ])

    if multiplier and float(multiplier) > 1.0 and surge_name:
        surge_extra = round(fee - (base_rate * billing_hours), 2)
        items_data.append([
            f'Surge Pricing — {surge_name} ({multiplier}x)',
            '', '', f'Rs {surge_extra}'
        ])

    t_items = Table(items_data, colWidths=[9*cm, 2*cm, 3*cm, 4*cm])
    t_items.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1F3864')),
        ('TEXTCOLOR',  (0,0), (-1,0), colors.white),
        ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE',   (0,0), (-1,-1), 9),
        ('ALIGN',      (1,0), (-1,-1), 'CENTER'),
        ('ALIGN',      (3,0), (3,-1), 'RIGHT'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#F5F7FA'), colors.white]),
        ('GRID',       (0,0), (-1,-1), 0.3, colors.HexColor('#DDDDDD')),
        ('PADDING',    (0,0), (-1,-1), 7),
    ]))
    elements.append(t_items)
    elements.append(Spacer(1, 0.3*cm))

    # Tax summary
    tax_data = [
        ['', 'Taxable Amount', f'Rs {base_fee}'],
        ['', 'CGST @ 9%',      f'Rs {cgst}'],
        ['', 'SGST @ 9%',      f'Rs {sgst}'],
        ['', 'TOTAL GST',      f'Rs {gst_amount}'],
    ]
    t_tax = Table(tax_data, colWidths=[9.5*cm, 4.5*cm, 4*cm])
    t_tax.setStyle(TableStyle([
        ('FONTSIZE',  (0,0), (-1,-1), 9),
        ('ALIGN',     (1,0), (-1,-1), 'RIGHT'),
        ('TEXTCOLOR', (1,3), (2,3), colors.HexColor('#2E75B6')),
        ('FONTNAME',  (1,3), (2,3), 'Helvetica-Bold'),
        ('LINEABOVE', (1,3), (2,3), 0.5, colors.HexColor('#AAAAAA')),
        ('PADDING',   (0,0), (-1,-1), 4),
    ]))
    elements.append(t_tax)
    elements.append(Spacer(1, 0.2*cm))
    elements.append(HRFlowable(width='100%', thickness=1.5, color=colors.HexColor('#1F3864')))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph(f'TOTAL AMOUNT: Rs {fee}', total_st))
    elements.append(Spacer(1, 0.5*cm))
    elements.append(HRFlowable(width='100%', thickness=0.5, color=colors.grey))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph(
        f'This is a computer-generated invoice. Generated on {invoice_date} by Smart Parking System.',
        ParagraphStyle('Footer', parent=styles['Normal'], fontSize=7,
                        textColor=colors.grey, alignment=TA_CENTER)
    ))

    doc.build(elements)
    buf.seek(0)
    return buf.read()