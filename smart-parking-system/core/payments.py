"""
core/payments.py — Razorpay Payment Integration
MEDIUM #1, #2, #7

API keys loaded from .env:
  RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
  RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

Install: pip install razorpay
"""

import os
import hmac
import hashlib

RAZORPAY_KEY_ID     = os.getenv('RAZORPAY_KEY_ID', '')
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', '')
GST_RATE            = 0.18   # 18% GST


def _get_client():
    """Return Razorpay client or None if not configured."""
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        return None
    try:
        import razorpay
        return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    except ImportError:
        return None


def create_order(amount_rupees, ticket_id, receipt=None):
    """
    Create a Razorpay order.
    Returns (success, order_dict_or_error)
    """
    client = _get_client()
    if not client:
        # Return mock order when keys not configured
        return True, {
            'id':       f'mock_order_{ticket_id}',
            'amount':   int(amount_rupees * 100),
            'currency': 'INR',
            'receipt':  receipt or ticket_id,
            'mock':     True,
        }

    try:
        order = client.order.create({
            'amount':   int(amount_rupees * 100),  # paise
            'currency': 'INR',
            'receipt':  receipt or ticket_id,
            'notes':    {'ticket_id': ticket_id},
        })
        return True, order
    except Exception as e:
        return False, str(e)


def verify_payment(razorpay_order_id, razorpay_payment_id, razorpay_signature):
    """
    Verify Razorpay payment signature (HMAC-SHA256).
    Returns True if signature is valid.
    """
    if not RAZORPAY_KEY_SECRET:
        return True   # Skip verification in dev mode

    msg = f"{razorpay_order_id}|{razorpay_payment_id}"
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        msg.encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, razorpay_signature)


def calculate_gst(amount):
    """Return (gst_amount, total_amount)."""
    gst   = round(amount * GST_RATE, 2)
    total = round(amount + gst, 2)
    return gst, total


def create_subscription(plan, lot_id, amount_monthly):
    """
    Create a Razorpay subscription for monthly billing.
    Returns (success, subscription_dict_or_error)
    """
    client = _get_client()
    if not client:
        return True, {
            'id':     f'mock_sub_{lot_id}',
            'plan':   plan,
            'amount': amount_monthly,
            'mock':   True,
        }

    try:
        # Create plan first
        rz_plan = client.plan.create({
            'period':   'monthly',
            'interval': 1,
            'item': {
                'name':     f'Smart Parking — {plan.capitalize()}',
                'amount':   int(amount_monthly * 100),
                'currency': 'INR',
            }
        })
        # Create subscription
        sub = client.subscription.create({
            'plan_id':        rz_plan['id'],
            'total_count':    12,   # 12 months
            'quantity':       1,
            'notes':          {'lot_id': str(lot_id), 'plan': plan},
        })
        return True, sub
    except Exception as e:
        return False, str(e)


PLAN_AMOUNTS = {
    'free':       0,
    'starter':    2999,
    'pro':        7999,
    'enterprise': 0,   # custom pricing
}