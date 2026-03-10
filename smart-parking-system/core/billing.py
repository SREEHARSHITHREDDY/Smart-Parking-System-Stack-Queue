from datetime import datetime
import math

# Different rates per vehicle type
RATE_PER_HOUR = {
    "car":   30,
    "bike":  15,
    "truck": 60
}
DEFAULT_RATE = 30


class Billing:

    def calculate_fee(self, vehicle):
        exit_time = datetime.now()
        duration = (exit_time - vehicle.entry_time).total_seconds() / 3600
        hours = max(1, math.ceil(duration))   # minimum 1 hour
        rate = RATE_PER_HOUR.get(vehicle.vehicle_type, DEFAULT_RATE)
        fee = hours * rate
        return fee, exit_time

    def get_rate_info(self):
        return RATE_PER_HOUR