from datetime import datetime


class ParkingLot:

    def __init__(self, row_config, floor_config=None):
        self.floor_config = floor_config
        self.stack        = []
        self.queue        = []
        self.revenue      = 0
        self.layout       = {}
        self.history      = []          # Phase 4 — list of completed exit records
        self.revenue_by_type = {        # Phase 4 — per-type revenue tracking
            "car":   0,
            "bike":  0,
            "truck": 0
        }

        if floor_config:
            self.row_config  = []
            self.multi_floor = True
            for floor in floor_config:
                self.row_config.extend(floor["rows"])
            self.capacity = sum(self.row_config)
            self._create_multi_floor_blueprint()
        else:
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
    def remove_vehicle(self, identifier, billing):
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

        fee, exit_time = billing.calculate_fee(vehicle)
        self.revenue  += fee

        # Phase 4 — track revenue per vehicle type
        vtype = vehicle.vehicle_type.lower()
        if vtype in self.revenue_by_type:
            self.revenue_by_type[vtype] += fee
        else:
            self.revenue_by_type[vtype] = fee

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

        # Phase 4 — append completed transaction to history
        duration_seconds = (exit_time - vehicle.entry_time).total_seconds()
        history_record = {
            "ticket_id":    vehicle.ticket_id,
            "number_plate": vehicle.number_plate,
            "vehicle_type": vehicle.vehicle_type,
            "slot":         slot,
            "entry_time":   vehicle.entry_time.isoformat(),
            "exit_time":    exit_time.isoformat(),
            "duration_min": round(duration_seconds / 60, 1),
            "fee":          fee
        }
        self.history.append(history_record)

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

        return {
            "success":               True,
            "ticket_id":             vehicle.ticket_id,
            "number_plate":          vehicle.number_plate,
            "vehicle_type":          vehicle.vehicle_type,
            "slot":                  slot,
            "fee":                   fee,
            "exit_time":             exit_time.strftime('%H:%M:%S'),
            "entry_time":            vehicle.entry_time.strftime('%H:%M:%S'),
            "queued_vehicle_parked": queued_vehicle_info
        }

    # ── STATS ─────────────────────────────────────────────────
    def get_stats(self):
        occupied = sum(1 for s in self.layout.values() if s["status"] == "occupied")
        empty    = self.capacity - occupied
        return {
            "capacity":      self.capacity,
            "occupied":      occupied,
            "empty":         empty,
            "queue_length":  len(self.queue),
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

    # ── ANALYTICS  (Phase 4) ──────────────────────────────────
    def get_analytics(self):
        """
        Returns computed analytics from the history list.
        All calculations are done server-side for accuracy.
        """
        today_str = datetime.now().strftime("%Y-%m-%d")

        today_records = [
            h for h in self.history
            if h["exit_time"].startswith(today_str)
        ]

        total_today    = len(today_records)
        avg_stay_min   = 0
        peak_hour      = None
        hour_counts    = {}

        if today_records:
            avg_stay_min = round(
                sum(h["duration_min"] for h in today_records) / total_today, 1
            )
            for h in today_records:
                hour = int(h["exit_time"][11:13])
                hour_counts[hour] = hour_counts.get(hour, 0) + 1

            peak_hour_num = max(hour_counts, key=hour_counts.get)
            peak_hour = f"{peak_hour_num:02d}:00 – {peak_hour_num:02d}:59"

        # Revenue breakdown percentages
        total_rev = self.revenue or 1   # avoid div-by-zero
        rev_breakdown = {
            vtype: {
                "amount": amt,
                "pct":    round((amt / total_rev) * 100, 1)
            }
            for vtype, amt in self.revenue_by_type.items()
        }

        return {
            "total_today":   total_today,
            "avg_stay_min":  avg_stay_min,
            "peak_hour":     peak_hour or "—",
            "revenue_by_type": rev_breakdown,
            "total_revenue": self.revenue
        }