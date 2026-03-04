from datetime import datetime

RATE_PER_HOUR = 20

class Billing:
    def calculate_fee(self, vehicle):
        exit_time = datetime.now()
        duration = (exit_time - vehicle.entry_time).total_seconds() / 3600
        hours = max(1, int(duration))
        return hours * RATE_PER_HOUR, exit_time