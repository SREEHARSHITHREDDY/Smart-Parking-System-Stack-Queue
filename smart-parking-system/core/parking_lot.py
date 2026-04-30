class ParkingLot:

    def __init__(self, row_config, floor_config=None):
        """
        Single-floor mode (default):
            row_config  = [4, 6, 3]
            floor_config = None
            Slots: A1, A2, B1, B3 ...

        Multi-floor mode:
            row_config  = None (ignored)
            floor_config = [
                {"name": "Ground", "rows": [4, 6, 3]},
                {"name": "First",  "rows": [5, 5]},
            ]
            Slots: Ground-A1, Ground-B2, First-A1 ...
        """
        self.floor_config = floor_config   # None = single floor
        self.stack   = []
        self.queue   = []
        self.revenue = 0
        self.layout  = {}

        if floor_config:
            # Multi-floor — build combined row_config for capacity
            self.row_config  = []
            self.multi_floor = True
            for floor in floor_config:
                self.row_config.extend(floor["rows"])
            self.capacity = sum(self.row_config)
            self._create_multi_floor_blueprint()
        else:
            # Single-floor
            self.row_config  = row_config
            self.multi_floor = False
            self.capacity    = sum(row_config)
            self._create_blueprint()

    # ── SINGLE FLOOR ──────────────────────────────────────────
    def _create_blueprint(self):
        for r, num_slots in enumerate(self.row_config):
            row_letter = chr(65 + r)
            for c in range(num_slots):
                slot = f"{row_letter}{c + 1}"
                self.layout[slot] = {"status": "empty", "vehicle": None}

    # ── MULTI FLOOR ───────────────────────────────────────────
    def _create_multi_floor_blueprint(self):
        for floor in self.floor_config:
            fname = floor["name"]
            for r, num_slots in enumerate(floor["rows"]):
                row_letter = chr(65 + r)
                for c in range(num_slots):
                    slot = f"{fname}-{row_letter}{c + 1}"
                    self.layout[slot] = {
                        "status":  "empty",
                        "vehicle": None,
                        "floor":   fname
                    }

    # ── FIND EMPTY SLOT ───────────────────────────────────────
    def find_empty_slot(self, floor_name=None):
        for slot, info in self.layout.items():
            if info["status"] == "empty":
                if floor_name is None:
                    return slot
                if info.get("floor") == floor_name:
                    return slot
        return None

    # ── PARK VEHICLE ──────────────────────────────────────────
    def park_vehicle(self, vehicle, preferred_floor=None):
        slot = self.find_empty_slot(floor_name=preferred_floor)

        # If preferred floor full, try any floor
        if not slot and preferred_floor:
            slot = self.find_empty_slot()

        if not slot:
            self.queue.append(vehicle)
            return {
                "success":        True,
                "queued":         True,
                "queue_position": len(self.queue)
            }

        self.layout[slot]["status"]  = "occupied"
        self.layout[slot]["vehicle"] = vehicle
        self.stack.append(vehicle)
        nearly_full = len(self.stack) >= 0.8 * self.capacity

        return {
            "success":     True,
            "queued":      False,
            "slot":        slot,
            "nearly_full": nearly_full
        }

    # ── REMOVE VEHICLE ────────────────────────────────────────
    def remove_vehicle(self, identifier, billing, lot_id=None):
        vehicle = None
        slot    = None

        for s, info in self.layout.items():
            if info["vehicle"]:
                if (info["vehicle"].ticket_id    == identifier or
                        info["vehicle"].number_plate == identifier):
                    vehicle = info["vehicle"]
                    slot    = s
                    break

        if not vehicle:
            return {"success": False, "message": "Vehicle not found"}

        fee, exit_time, base_rate, multiplier, surge_name = billing.calculate_fee(vehicle, lot_id=lot_id)
        self.revenue  += fee
        if vehicle.vehicle_type in self.revenue_by_type:
            self.revenue_by_type[vehicle.vehicle_type] += fee

        self.layout[slot]["status"]  = "empty"
        self.layout[slot]["vehicle"] = None

        # Remove from stack
        temp_stack = []
        while self.stack:
            top = self.stack.pop()
            if top.ticket_id == vehicle.ticket_id:
                break
            temp_stack.append(top)
        while temp_stack:
            self.stack.append(temp_stack.pop())

        # Auto-park from queue
        queued_vehicle_info = None
        if self.queue:
            queued_vehicle = self.queue.pop(0)
            self.layout[slot]["status"]  = "occupied"
            self.layout[slot]["vehicle"] = queued_vehicle
            self.stack.append(queued_vehicle)
            queued_vehicle_info = {
                "number_plate": queued_vehicle.number_plate,
                "ticket_id":    queued_vehicle.ticket_id,
                "slot":         slot
            }

        # Record history
        self.history.append({
            "ticket_id":    vehicle.ticket_id,
            "number_plate": vehicle.number_plate,
            "vehicle_type": vehicle.vehicle_type,
            "slot":         slot,
            "entry_time":   vehicle.entry_time.isoformat(),
            "exit_time":    exit_time.isoformat(),
            "duration_min": round((exit_time - vehicle.entry_time).total_seconds() / 60, 1),
            "fee":          fee,
            "multiplier":   multiplier,
            "surge_name":   surge_name or "",
        })

        return {
            "success":               True,
            "ticket_id":             vehicle.ticket_id,
            "number_plate":          vehicle.number_plate,
            "vehicle_type":          vehicle.vehicle_type,
            "slot":                  slot,
            "fee":                   fee,
            "multiplier":            multiplier,
            "surge_name":            surge_name or "",
            "exit_time":             exit_time.strftime('%H:%M:%S'),
            "entry_time":            vehicle.entry_time.strftime('%H:%M:%S'),
            "queued_vehicle_parked": queued_vehicle_info
        }

    # ── STATS ─────────────────────────────────────────────────
    def get_stats(self):
        occupied = sum(1 for s in self.layout.values() if s["status"] == "occupied")
        empty    = self.capacity - occupied
        return {
            "capacity":     self.capacity,
            "occupied":     occupied,
            "empty":        empty,
            "queue_length": len(self.queue),
            "occupancy_pct": round((occupied / self.capacity) * 100, 1)
                             if self.capacity > 0 else 0
        }

    # ── FLOOR STATS (multi-floor only) ────────────────────────
    def get_floor_stats(self):
        if not self.multi_floor or not self.floor_config:
            return None
        result = []
        for floor in self.floor_config:
            fname    = floor["name"]
            slots    = [s for s, i in self.layout.items() if i.get("floor") == fname]
            occupied = sum(1 for s in slots if self.layout[s]["status"] == "occupied")
            result.append({
                "name":     fname,
                "capacity": len(slots),
                "occupied": occupied,
                "empty":    len(slots) - occupied
            })
        return result