"""
core/security.py — Input sanitization and security utilities
Day 32: Smart Parking System v3.0
"""

import re
import html


def sanitize_string(value, max_length=255):
    """Strip dangerous characters from string input."""
    if not isinstance(value, str):
        return ''
    # HTML escape to prevent XSS
    value = html.escape(value.strip())
    # Remove null bytes and control characters
    value = re.sub(r'[\x00-\x1f\x7f]', '', value)
    return value[:max_length]


def sanitize_plate(plate):
    """Clean and validate number plate input."""
    if not isinstance(plate, str):
        return ''
    plate = plate.upper().strip()
    # Only allow alphanumeric
    plate = re.sub(r'[^A-Z0-9]', '', plate)
    return plate[:11]


def sanitize_email(email):
    """Basic email sanitization."""
    if not isinstance(email, str):
        return ''
    email = email.lower().strip()[:120]
    email = re.sub(r'[^a-z0-9@._\-]', '', email)
    return email


def sanitize_int(value, min_val=0, max_val=9999, default=0):
    """Safely parse integer from untrusted input."""
    try:
        v = int(value)
        return max(min_val, min(max_val, v))
    except (TypeError, ValueError):
        return default


def sanitize_float(value, min_val=0.0, max_val=9999.0, default=0.0):
    """Safely parse float from untrusted input."""
    try:
        v = float(value)
        return max(min_val, min(max_val, v))
    except (TypeError, ValueError):
        return default


def is_safe_redirect(url):
    """Check if redirect URL is safe (no open redirect)."""
    if not url:
        return False
    # Only allow relative URLs
    return url.startswith('/') and not url.startswith('//')