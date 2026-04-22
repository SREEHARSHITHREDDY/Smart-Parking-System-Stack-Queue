from datetime import datetime
import uuid


class Vehicle:

    def __init__(self, number_plate, vehicle_type="car"):
        self.number_plate = number_plate
        self.vehicle_type = vehicle_type
        self.entry_time   = datetime.now()
        self.ticket_id    = str(uuid.uuid4())[:8].upper()
        self.qr_data      = self.ticket_id  # Phase v2 — encoded in QR at entry

    def to_dict(self):
        return {
            "number_plate": self.number_plate,
            "vehicle_type": self.vehicle_type,
            "entry_time":   self.entry_time.isoformat(),
            "ticket_id":    self.ticket_id,
            "qr_data":      self.qr_data   # Phase v2
        }

    @staticmethod
    def from_dict(data):
        vehicle             = Vehicle(data["number_plate"], data["vehicle_type"])
        vehicle.entry_time  = datetime.fromisoformat(data["entry_time"])
        vehicle.ticket_id   = data["ticket_id"]
        vehicle.qr_data     = data.get("qr_data", vehicle.ticket_id)  # fallback for old records
        return vehicle