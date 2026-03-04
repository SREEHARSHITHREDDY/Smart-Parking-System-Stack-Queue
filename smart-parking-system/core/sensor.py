class Sensor:

    def detect_vehicle_entry(self, slot, layout):

        if slot in layout:
            layout[slot]["status"] = "occupied"

    def detect_vehicle_exit(self, slot, layout):

        if slot in layout:
            layout[slot]["status"] = "empty"
            layout[slot]["vehicle"] = None

    def slot_status(self, slot, layout):

        if slot in layout:
            return layout[slot]["status"]

        return None