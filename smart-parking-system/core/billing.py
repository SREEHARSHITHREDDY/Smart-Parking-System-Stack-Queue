from datetime import datetime
import math

RATE_PER_HOUR = 20


class Billing:

    def calculate_fee(self, vehicle):

        exit_time = datetime.now()

        duration = (exit_time - vehicle.entry_time).total_seconds() / 3600

        hours = max(1, math.ceil(duration))

        fee = hours * RATE_PER_HOUR

        return fee, exit_time