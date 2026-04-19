import re

# ─────────────────────────────────────────────────────────────
# NUMBER PLATE PATTERNS — Indian formats
#
#   New format  :  TS09AB1234   (AA00AA0000)   — 10 chars
#   Old format  :  TN33J1364    (AA00A0000)    —  9 chars
#   3-alpha     :  MH12ABC1234  (AA00AAA0000)  — 11 chars
#
# Single compiled regex handles all three:
# ─────────────────────────────────────────────────────────────
PLATE_PATTERN = re.compile(
    r'^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}$'
)

# Noise words that Tesseract may read from the plate border/emblem
NOISE_WORDS = [
    'INDIA', 'IND', 'BHARAT', 'BH',
    'HSRP', 'INA', 'INIA', 'NDIA', 'INDO',
]


def clean_ocr_text(raw: str) -> str:
    """
    Clean raw OCR output before plate extraction.
    - Uppercase everything
    - Strip all whitespace and newlines (multi-line plates become one string)
    - Remove known noise words printed on Indian plates
    - Strip any remaining non-alphanumeric characters
    """
    text = raw.upper().strip()
    text = re.sub(r'\s+', '', text)

    for word in NOISE_WORDS:
        text = text.replace(word, '')

    text = re.sub(r'[^A-Z0-9]', '', text)
    return text


def extract_plate(raw: str):
    """
    Extract the best plate match from raw OCR text.

    Returns:
        (plate_string, note)  — on success
        (None, reason)        — if no plate found
    """
    cleaned = clean_ocr_text(raw)

    # Find ALL substrings that could be a plate
    pattern = re.compile(r'[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}')
    matches = pattern.findall(cleaned)

    if not matches:
        return None, f"No plate found in: {cleaned[:20]}"

    # Multiple matches → take the longest one (most specific)
    best = max(matches, key=len)
    return best, "matched"


def validate_vehicle_number(number_plate: str) -> bool:
    """
    Validates a cleaned plate string against all supported Indian formats.

    Accepts:
        TS09AB1234   — new 10-char standard
        TN33J1364    — old 9-char standard
        MH12ABC1234  — 3-letter district series
    """
    if not number_plate:
        return False
    return bool(PLATE_PATTERN.fullmatch(number_plate.strip().upper()))