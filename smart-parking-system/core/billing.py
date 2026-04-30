from datetime import datetime
import math

RATE_PER_HOUR = {
    "car":   30,
    "bike":  15,
    "truck": 60
}
DEFAULT_RATE = 30


class Billing:

    def calculate_fee(self, vehicle, lot_id=None):
        """
        Calculate exit fee.
        If lot_id provided and DB is active — check for surge rules.
        Returns (fee, exit_time, base_rate, multiplier, surge_name)
        """
        exit_time = datetime.now()
        duration  = (exit_time - vehicle.entry_time).total_seconds() / 3600
        hours     = max(1, math.ceil(duration))
        base_rate = RATE_PER_HOUR.get(vehicle.vehicle_type, DEFAULT_RATE)

        # ── Check dynamic pricing ─────────────────
        multiplier = 1.0
        surge_name = None

        if lot_id:
            try:
                from models.db import get_active_rule
                rule = get_active_rule(lot_id)
                if rule:
                    multiplier = rule.multiplier
                    surge_name = rule.name
            except Exception:
                pass  # DB not available — use base rate

        effective_rate = base_rate * multiplier
        fee = math.ceil(hours * effective_rate)

        return fee, exit_time, base_rate, multiplier, surge_name

    def get_rate_info(self):
        return RATE_PER_HOUR