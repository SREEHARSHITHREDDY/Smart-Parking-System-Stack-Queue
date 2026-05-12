"""
core/whatsapp.py — WhatsApp + SMS via Twilio
MEDIUM #3, #4, #5, #6

API keys loaded from .env:
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

Install: pip install twilio
"""

import os
from datetime import datetime


TWILIO_SID   = os.getenv('TWILIO_ACCOUNT_SID', '')
TWILIO_TOKEN = os.getenv('TWILIO_AUTH_TOKEN',   '')
WHATSAPP_FROM= os.getenv('TWILIO_WHATSAPP_FROM', 'whatsapp:+14155238886')
SMS_FROM     = os.getenv('TWILIO_SMS_FROM', '')   # optional — Twilio phone number for SMS


def _get_client():
    """Return Twilio client or None if not configured."""
    if not TWILIO_SID or not TWILIO_TOKEN:
        return None
    try:
        from twilio.rest import Client
        return Client(TWILIO_SID, TWILIO_TOKEN)
    except ImportError:
        return None


def send_whatsapp(to_phone, message, lot_id=1):
    """
    Send a WhatsApp message via Twilio sandbox.
    Returns (success, sid_or_error)
    """
    if not to_phone:
        return False, 'No phone number'

    # Normalise phone — add +91 if no country code
    phone = to_phone.strip().replace(' ', '')
    if not phone.startswith('+'):
        phone = '+91' + phone

    client = _get_client()
    if not client:
        # Log as skipped — no credentials yet
        _log_message(lot_id, phone, 'whatsapp', None, 'skipped')
        return True, 'SKIPPED_NO_CREDENTIALS'

    try:
        msg = client.messages.create(
            from_=WHATSAPP_FROM,
            to=f'whatsapp:{phone}',
            body=message
        )
        _log_message(lot_id, phone, 'whatsapp', msg.sid, 'sent')
        return True, msg.sid
    except Exception as e:
        _log_message(lot_id, phone, 'whatsapp', None, 'failed')
        # Fallback to SMS
        return send_sms(phone, message, lot_id)


def send_sms(to_phone, message, lot_id=1):
    """
    Send SMS as fallback when WhatsApp fails.
    Returns (success, sid_or_error)
    """
    if not SMS_FROM:
        return False, 'SMS_FROM not configured'

    phone = to_phone.strip().replace(' ', '')
    if not phone.startswith('+'):
        phone = '+91' + phone

    client = _get_client()
    if not client:
        _log_message(lot_id, phone, 'sms', None, 'skipped')
        return True, 'SKIPPED_NO_CREDENTIALS'

    try:
        msg = client.messages.create(
            from_=SMS_FROM,
            to=phone,
            body=message
        )
        _log_message(lot_id, phone, 'sms', msg.sid, 'sent')
        return True, msg.sid
    except Exception as e:
        _log_message(lot_id, phone, 'sms', None, 'failed')
        return False, str(e)


def _log_message(lot_id, phone, msg_type, sid, status):
    """Save message log to DB."""
    try:
        from models.db import db, WhatsAppLog
        log = WhatsAppLog(
            lot_id=lot_id, phone=phone,
            message_type=msg_type, twilio_sid=sid, status=status
        )
        db.session.add(log)
        db.session.commit()
    except Exception:
        pass


# ── MESSAGE TEMPLATES ─────────────────────────────────────

def entry_message(number_plate, ticket_id, slot, lot_name='Smart Parking'):
    return (
        f"*{lot_name}* — Entry Confirmed ✅\n\n"
        f"Vehicle: *{number_plate}*\n"
        f"Slot: *{slot}*\n"
        f"Ticket: *{ticket_id}*\n"
        f"Time: {datetime.now().strftime('%d %b %Y %H:%M')}\n\n"
        f"Show this ticket ID at exit.\n"
        f"_Safe parking!_ 🚗"
    )


def exit_message(number_plate, ticket_id, fee, duration_min, lot_name='Smart Parking'):
    hours = duration_min // 60
    mins  = int(duration_min % 60)
    dur_str = f"{int(hours)}h {mins}m" if hours >= 1 else f"{mins} min"
    return (
        f"*{lot_name}* — Exit Receipt 🧾\n\n"
        f"Vehicle: *{number_plate}*\n"
        f"Ticket: *{ticket_id}*\n"
        f"Duration: *{dur_str}*\n"
        f"Amount: *₹{fee}*\n"
        f"Time: {datetime.now().strftime('%d %b %Y %H:%M')}\n\n"
        f"Thank you for parking with us! 🙏"
    )


def waitlist_message(number_plate, slot, lot_name='Smart Parking'):
    return (
        f"*{lot_name}* — Slot Available! 🅿\n\n"
        f"Good news! A slot is now available.\n"
        f"Vehicle: *{number_plate}*\n"
        f"Assigned Slot: *{slot}*\n"
        f"Please proceed to the parking lot.\n\n"
        f"_Your slot will be held for 10 minutes._"
    )