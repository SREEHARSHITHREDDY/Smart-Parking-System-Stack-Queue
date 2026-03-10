import re


def validate_vehicle_number(number_plate):
    # Indian format: TS09AB1234
    pattern = r"^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$"
    return bool(re.match(pattern, number_plate))