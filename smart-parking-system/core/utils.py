import re


def validate_vehicle_number(number_plate):
    """
    Validate vehicle number format.
    Expected format: AA00AA0000
    Example: TS09AB1234
    """

    pattern = r"^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$"

    if re.match(pattern, number_plate):
        return True

    return False


def format_time(time_obj):
    """
    Format datetime object to readable time string
    """

    return time_obj.strftime("%H:%M:%S")


def print_separator():
    """
    Print a separator line for console UI
    """

    print("--------------------------------------")