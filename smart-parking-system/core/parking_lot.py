class ParkingLot:

    def __init__(self, rows, cols):

        self.rows = rows
        self.cols = cols
        self.capacity = rows * cols

        self.layout = {}
        self.stack = []
        self.revenue = 0

        self._create_blueprint()

    def _create_blueprint(self):

        for r in range(self.rows):
            for c in range(self.cols):

                slot = f"{chr(65+r)}{c+1}"

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

        if not slot:
            print("Parking Full.")
            return False

        self.layout[slot]["status"] = "occupied"
        self.layout[slot]["vehicle"] = vehicle

        self.stack.append(vehicle)

        print("\n------ ENTRY TICKET ------")
        print(f"Ticket ID : {vehicle.ticket_id}")
        print(f"Vehicle   : {vehicle.number_plate}")
        print(f"Slot      : {slot}")
        print(f"Entry Time: {vehicle.entry_time.strftime('%H:%M:%S')}")
        print("--------------------------")

        if len(self.stack) >= 0.8 * self.capacity:
            print("⚠ Warning: Parking nearly full!")

        return True

    def remove_vehicle(self, identifier, billing):

        vehicle = None
        slot = None

        for s, info in self.layout.items():

            if info["vehicle"]:

                if info["vehicle"].ticket_id == identifier or \
                   info["vehicle"].number_plate == identifier:

                    vehicle = info["vehicle"]
                    slot = s
                    break

        if not vehicle:
            print("Vehicle not found.")
            return False

        fee, exit_time = billing.calculate_fee(vehicle)

        self.revenue += fee

        self.layout[slot]["status"] = "empty"
        self.layout[slot]["vehicle"] = None

        temp_stack = []

        while self.stack:

            top = self.stack.pop()

            if top.ticket_id == vehicle.ticket_id:
                break

            temp_stack.append(top)

        while temp_stack:
            self.stack.append(temp_stack.pop())

        print("\n------ EXIT RECEIPT ------")
        print(f"Ticket ID : {vehicle.ticket_id}")
        print(f"Vehicle   : {vehicle.number_plate}")
        print(f"Slot      : {slot}")
        print(f"Exit Time : {exit_time.strftime('%H:%M:%S')}")
        print(f"Amount    : ₹{fee}")
        print("--------------------------")

        return True

    def display_layout(self):

        print("\n------ PARKING BLUEPRINT ------")

        for r in range(self.rows):

            row_display = []

            for c in range(self.cols):

                slot = f"{chr(65+r)}{c+1}"

                status = self.layout[slot]["status"]

                if status == "empty":
                    row_display.append(f"{slot}(E)")
                else:
                    row_display.append(f"{slot}(O)")

            print("  ".join(row_display))

        empty_slots = sum(1 for s in self.layout.values() if s["status"] == "empty")

        print("\nAvailable Slots:", empty_slots)
        print("Total Revenue  : ₹", self.revenue)