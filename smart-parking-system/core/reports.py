"""
core/reports.py — PDF Report Generation
LOW #5: Monthly revenue report
LOW #4: Analytics PDF export
Uses reportlab for PDF generation.
"""

import io
from datetime import datetime, timedelta
from collections import defaultdict


def generate_monthly_report(history, lot_name='Smart Parking', month=None):
    """
    Generate a monthly revenue PDF report.
    Returns bytes of PDF file.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
    except ImportError:
        return None

    if not month:
        month = datetime.now().strftime('%Y-%m')

    # Filter history for the month
    records = [h for h in history if h['exit_time'][:7] == month]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            rightMargin=2*cm, leftMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)

    styles   = getSampleStyleSheet()
    title_st = ParagraphStyle('Title', parent=styles['Title'],
                               fontSize=20, textColor=colors.HexColor('#1F3864'),
                               spaceAfter=6)
    sub_st   = ParagraphStyle('Sub', parent=styles['Normal'],
                               fontSize=11, textColor=colors.grey, spaceAfter=12)
    h2_st    = ParagraphStyle('H2', parent=styles['Heading2'],
                               fontSize=13, textColor=colors.HexColor('#2E75B6'),
                               spaceBefore=16, spaceAfter=6)

    elements = []

    # Header
    elements.append(Paragraph(f'{lot_name}', title_st))
    elements.append(Paragraph(f'Monthly Revenue Report — {month}', sub_st))
    elements.append(Paragraph(f'Generated: {datetime.now().strftime("%d %b %Y %H:%M")}', sub_st))
    elements.append(Spacer(1, 0.4*cm))

    # Summary
    total_rev  = sum(h['fee'] for h in records)
    total_veh  = len(records)
    avg_fee    = round(total_rev / total_veh, 2) if total_veh > 0 else 0
    avg_dur    = round(sum(h['duration_min'] for h in records) / total_veh, 1) if total_veh > 0 else 0

    elements.append(Paragraph('Summary', h2_st))
    summary_data = [
        ['Metric', 'Value'],
        ['Total Revenue', f'Rs {total_rev:,.2f}'],
        ['Total Vehicles', str(total_veh)],
        ['Average Fee per Vehicle', f'Rs {avg_fee:,.2f}'],
        ['Average Stay Duration', f'{avg_dur} minutes'],
    ]
    t = Table(summary_data, colWidths=[9*cm, 7*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1F3864')),
        ('TEXTCOLOR',  (0,0), (-1,0), colors.white),
        ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE',   (0,0), (-1,-1), 10),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#F5F7FA'), colors.white]),
        ('GRID',       (0,0), (-1,-1), 0.5, colors.HexColor('#CCCCCC')),
        ('PADDING',    (0,0), (-1,-1), 8),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 0.4*cm))

    # By vehicle type
    elements.append(Paragraph('Revenue by Vehicle Type', h2_st))
    type_data = [['Vehicle Type', 'Count', 'Revenue', '% of Total']]
    for vtype in ['car', 'bike', 'truck']:
        recs = [h for h in records if h['vehicle_type'] == vtype]
        rev  = sum(h['fee'] for h in recs)
        pct  = round(rev / total_rev * 100, 1) if total_rev > 0 else 0
        type_data.append([vtype.capitalize(), str(len(recs)), f'Rs {rev:,.2f}', f'{pct}%'])
    t2 = Table(type_data, colWidths=[4*cm, 4*cm, 5*cm, 4*cm])
    t2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1F3864')),
        ('TEXTCOLOR',  (0,0), (-1,0), colors.white),
        ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE',   (0,0), (-1,-1), 10),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#F5F7FA'), colors.white]),
        ('GRID',       (0,0), (-1,-1), 0.5, colors.HexColor('#CCCCCC')),
        ('PADDING',    (0,0), (-1,-1), 8),
    ]))
    elements.append(t2)
    elements.append(Spacer(1, 0.4*cm))

    # Daily breakdown
    elements.append(Paragraph('Daily Breakdown', h2_st))
    daily = defaultdict(lambda: {'count': 0, 'revenue': 0.0})
    for h in records:
        day = h['exit_time'][:10]
        daily[day]['count']   += 1
        daily[day]['revenue'] += h['fee']

    daily_data = [['Date', 'Vehicles', 'Revenue']]
    for day in sorted(daily.keys()):
        daily_data.append([day, str(daily[day]['count']), f"Rs {daily[day]['revenue']:,.2f}"])

    if len(daily_data) > 1:
        t3 = Table(daily_data, colWidths=[6*cm, 4*cm, 7*cm])
        t3.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1F3864')),
            ('TEXTCOLOR',  (0,0), (-1,0), colors.white),
            ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE',   (0,0), (-1,-1), 10),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#F5F7FA'), colors.white]),
            ('GRID',       (0,0), (-1,-1), 0.5, colors.HexColor('#CCCCCC')),
            ('PADDING',    (0,0), (-1,-1), 8),
        ]))
        elements.append(t3)
    else:
        elements.append(Paragraph('No records for this month.', styles['Normal']))

    doc.build(elements)
    buf.seek(0)
    return buf.read()


def generate_analytics_pdf(analytics, lot_name='Smart Parking'):
    """Generate a PDF of the current analytics dashboard."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    except ImportError:
        return None

    buf    = io.BytesIO()
    doc    = SimpleDocTemplate(buf, pagesize=A4,
                                rightMargin=2*cm, leftMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    title_st = ParagraphStyle('Title', parent=styles['Title'],
                               fontSize=20, textColor=colors.HexColor('#1F3864'), spaceAfter=6)
    h2_st    = ParagraphStyle('H2', parent=styles['Heading2'],
                               fontSize=13, textColor=colors.HexColor('#2E75B6'),
                               spaceBefore=16, spaceAfter=6)
    elements = []

    elements.append(Paragraph(f'{lot_name} — Analytics Report', title_st))
    elements.append(Paragraph(f'Generated: {datetime.now().strftime("%d %b %Y %H:%M")}',
                               styles['Normal']))
    elements.append(Spacer(1, 0.4*cm))

    elements.append(Paragraph('Key Metrics', h2_st))
    metrics = [
        ['Metric', 'Value'],
        ['Total Vehicles Today',   str(analytics.get('total_today', 0))],
        ['Total All Time',         str(analytics.get('total_all_time', 0))],
        ['Revenue Today',          f"Rs {analytics.get('revenue_today', 0):,.2f}"],
        ['Revenue All Time',       f"Rs {analytics.get('revenue_all_time', 0):,.2f}"],
        ['Average Stay',           f"{analytics.get('avg_stay_min', 0)} min"],
        ['Peak Hour',              str(analytics.get('peak_hour', 'N/A'))],
        ['Avg Daily Revenue',      f"Rs {analytics.get('avg_daily_revenue', 0):,.2f}"],
        ['Surge Revenue Earned',   f"Rs {analytics.get('surge_revenue', 0):,.2f}"],
    ]
    t = Table(metrics, colWidths=[9*cm, 7*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1F3864')),
        ('TEXTCOLOR',  (0,0), (-1,0), colors.white),
        ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE',   (0,0), (-1,-1), 10),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#F5F7FA'), colors.white]),
        ('GRID',       (0,0), (-1,-1), 0.5, colors.HexColor('#CCCCCC')),
        ('PADDING',    (0,0), (-1,-1), 8),
    ]))
    elements.append(t)

    doc.build(elements)
    buf.seek(0)
    return buf.read()