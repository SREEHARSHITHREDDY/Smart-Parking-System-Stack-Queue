import re

# All Indian plate formats:
# New format:  TS09AB1234  (AA00AA0000)
# Old format:  TN33J1364   (AA00A0000)
# New 3-alpha: MH12ABC1234 (AA00AAA0000) — some states
PLATE_PATTERN = re.compile(
    r'[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}'
)

# Noise words printed on plates — strip before matching
NOISE_WORDS = [
    'INDIA', 'IND', 'BHARAT', 'BH',
    'HSRP', 'INA', 'INIA', 'NDIA',
]

def clean_ocr_text(raw):
    """
    Clean raw OCR output before plate extraction.
    - Strip spaces and newlines
    - Remove known noise words
    - Uppercase
    """
    text = raw.upper().strip()

    # Join all whitespace (handles multi-line plates)
    text = re.sub(r'\s+', '', text)

    # Remove noise words
    for word in NOISE_WORDS:
        text = text.replace(word, '')

    # Remove any remaining non-alphanumeric
    text = re.sub(r'[^A-Z0-9]', '', text)

    return text


def extract_plate(raw):
    """
    Extract the best plate match from raw OCR text.
    Returns (plate_string, confidence_note) or (None, reason)
    """
    cleaned = clean_ocr_text(raw)

    # Try to find plate pattern anywhere in the cleaned string
    matches = PLATE_PATTERN.findall(cleaned)

    if not matches:
        return None, f"No plate found in: {cleaned[:20]}"

    # If multiple matches, take the longest one
    best = max(matches, key=len)
    return best, "matched"


def validate_vehicle_number(number_plate):
    """
    Validates a cleaned plate number.
    Accepts:
      TS09AB1234   (new 10-char)
      TN33J1364    (old 9-char)
      MH12ABC1234  (3-letter series)
    """
    if not number_plate:
        return False
    return bool(PLATE_PATTERN.fullmatch(number_plate))