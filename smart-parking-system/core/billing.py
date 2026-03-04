from datetime import datetime
import math

RATE_PER_HOUR = 20


class Billing:

    def calculate_fee(self, vehicle):
        """
        Calculate parking fee based on entry time and exit time.
        Minimum billing is 1 hour.
        """

        exit_time = datetime.now()

        # Calculate duration in hours
        duration = (exit_time - vehicle.entry_time).total_seconds() / 3600

        # Round up to next hour
        hours = max(1, math.ceil(duration))

        fee = hours * RATE_PER_HOUR

        return fee, exit_time


    def print_receipt(self, vehicle, fee, exit_time):
        """
        Print exit receipt for the parked vehicle
        """

        print("\n----------- EXIT RECEIPT -----------")
        print(f"Vehicle Number : {vehicle.number_plate}")
        print(f"Entry Time     : {vehicle.entry_time.strftime('%H:%M:%S')}")
        print(f"Exit Time      : {exit_time.strftime('%H:%M:%S')}")
        print(f"Total Fee      : ₹{fee}")
        print("------------------------------------")