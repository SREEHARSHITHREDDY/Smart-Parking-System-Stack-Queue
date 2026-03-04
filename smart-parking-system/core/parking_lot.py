def park_vehicle(self, vehicle):
    slot = self.find_empty_slot()
    if not slot:
        print("Parking Full.")
        return False

    self.layout[slot]["status"] = "occupied"
    self.layout[slot]["vehicle"] = vehicle
    self.stack.append(vehicle)

    print("\n--- ENTRY TICKET ---")
    print(f"Ticket ID : {vehicle.ticket_id}")
    print(f"Vehicle   : {vehicle.number_plate}")
    print(f"Slot      : {slot}")
    print("--------------------")

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

    print("\n--- EXIT SLIP ---")
    print(f"Vehicle   : {vehicle.number_plate}")
    print(f"Slot      : {slot}")
    print(f"Amount    : ₹{fee}")
    print("------------------")

    return True