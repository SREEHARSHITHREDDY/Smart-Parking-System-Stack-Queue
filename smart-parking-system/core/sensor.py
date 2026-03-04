class Sensor:
    """
    Simulates parking slot sensors.
    In real systems these would be IoT sensors detecting vehicle presence.
    """

    def detect_vehicle_entry(self, slot, layout):
        """
        Mark slot as occupied when vehicle enters
        """

        if slot in layout:
            layout[slot]["status"] = "occupied"
            print(f"[Sensor] Vehicle detected at slot {slot}")

    def detect_vehicle_exit(self, slot, layout):
        """
        Mark slot as empty when vehicle leaves
        """

        if slot in layout:
            layout[slot]["status"] = "empty"
            layout[slot]["vehicle"] = None
            print(f"[Sensor] Slot {slot} is now empty")

    def slot_status(self, slot, layout):
        """
        Check status of a parking slot
        """

        if slot in layout:
            return layout[slot]["status"]

        return None