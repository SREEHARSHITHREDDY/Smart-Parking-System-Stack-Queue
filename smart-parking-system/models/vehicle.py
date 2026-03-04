from datetime import datetime
import uuid


class Vehicle:

    def __init__(self, number_plate, vehicle_type="car"):

        self.number_plate = number_plate
        self.vehicle_type = vehicle_type

        # Entry time recorded when vehicle object is created
        self.entry_time = datetime.now()

        # Unique ticket ID for parking slip
        self.ticket_id = str(uuid.uuid4())[:8]

    # ---------------- SAVE TO JSON ----------------

    def to_dict(self):

        return {
            "number_plate": self.number_plate,
            "vehicle_type": self.vehicle_type,
            "entry_time": self.entry_time.isoformat(),
            "ticket_id": self.ticket_id
        }

    # ---------------- LOAD FROM JSON ----------------

    @staticmethod
    def from_dict(data):

        vehicle = Vehicle(data["number_plate"], data["vehicle_type"])
        vehicle.entry_time = datetime.fromisoformat(data["entry_time"])
       