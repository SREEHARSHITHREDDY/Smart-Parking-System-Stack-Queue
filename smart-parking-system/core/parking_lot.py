class ParkingLot:

    def __init__(self, row_config):
        """
        row_config: list of ints
        Each int = number of slots in that row
        e.g. [3, 5, 4, 2] means:
             Row A → 3 slots
             Row B → 5 slots
             Row C → 4 slots
             Row D → 2 slots
        """
        self.row_config = row_config
        self.capacity = sum(row_config)
        self.layout = {}
        self.stack = []   # parked vehicles (LIFO)
        self.queue = []   # waiting vehicles (FIFO)
        self.revenue = 0
        self._create_blueprint()

    def _create_blueprint(self):
        for r, num_slots in enumerate(self.row_config):
            row_letter = chr(65 + r)
            for c in range(num_slots):
                slot = f"{row_letter}{c + 1}"
                self.layout[slot] = {
                    "status": "empty",
                    "vehicle": None
                }

    def find_empty_slot(self):
        for slot, info in self.layout.items():
            if info["status"] == "empty":
                return slot
        return None

    def park_vehicle(self, vehicle):
        slot = self.find_empty_slot()

        # No slot available → add to waiting queue
        if not slot:
            self.queue.append(vehicle)
            return {
                "success": True,
                "queued": True,
                "queue_position": len(self.queue)
            }

        self.layout[slot]["status"] = "occupied"
        self.layout[slot]["vehicle"] = vehicle
        self.stack.append(vehicle)

        nearly_full = len(self.stack) >= 0.8 * self.capacity

        return {
            "success": True,
            "queued": False,
            "slot": slot,
            "nearly_full": nearly_full
        }

    def remove_vehicle(self, identifier, billing):
        vehicle = None
        slot = None

        # Search by ticket ID or number plate
        for s, info in self.layout.items():
            if info["vehicle"]:
                if (info["vehicle"].ticket_id == identifier or
                        info["vehicle"].number_plate == identifier):
                    vehicle = info["vehicle"]
                    slot = s
                    break

        if not vehicle:
            return {"success": False, "message": "Vehicle not found"}

        fee, exit_time = billing.calculate_fee(vehicle)
        self.revenue += fee

        # Free the slot
        self.layout[slot]["status"] = "empty"
        self.layout[slot]["vehicle"] = None

        # Remove from stack using temp stack
        temp_stack = []
        while self.stack:
            top = self.stack.pop()
            if top.ticket_id == vehicle.ticket_id:
                break
            temp_stack.append(top)
        while temp_stack:
            self.stack.append(temp_stack.pop())

        # Auto-park first vehicle from queue into freed slot
        queued_vehicle_info = None
        if self.queue:
            queued_vehicle = self.queue.pop(0)
            self.layout[slot]["status"] = "occupied"
            self.layout[slot]["vehicle"] = queued_vehicle
            self.stack.append(queued_vehicle)
            queued_vehicle_info = {
                "number_plate": queued_vehicle.number_plate,
                "ticket_id": queued_vehicle.ticket_id,
                "slot": slot
            }

        return {
            "success": True,
            "ticket_id": vehicle.ticket_id,
            "number_plate": vehicle.number_plate,
            "vehicle_type": vehicle.vehicle_type,
            "slot": slot,
            "fee": fee,
            "exit_time": exit_time.strftime('%H:%M:%S'),
            "entry_time": vehicle.entry_time.strftime('%H:%M:%S'),
            "queued_vehicle_parked": queued_vehicle_info
        }

    def get_stats(self):
        occupied = sum(1 for s in self.layout.values()
                       if s["status"] == "occupied")
        empty = self.capacity - occupied
        return {
            "capacity": self.capacity,
            "occupied": occupied,
            "empty": empty,
            "queue_length": len(self.queue),
            "occupancy_pct": round((occupied / self.capacity) * 100, 1)
                             if self.capacity > 0 else 0
        }