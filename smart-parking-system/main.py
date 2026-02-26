import json
import os
from models.vehicle import Vehicle
from core.parking_lot import ParkingLot
from core.billing import Billing
from core.sensor import Sensor

DATA_FILE = "parking_data.json"

class Vehicle:
    def __init__(self, number_plate):
        self.number_plate = number_plate

    def to_dict(self):
        return {"number_plate": self.number_plate}

    
    def from_dict(data):
        return Vehicle(data["number_plate"])


class ParkingLot:
    def __init__(self, capacity):
        self.capacity = capacity
        self.stack = []

    def is_full(self):
        return len(self.stack) >= self.capacity

    def is_empty(self):
        return len(self.stack) == 0

    def park_vehicle(self, vehicle):
        if not self.is_full():
            self.stack.append(vehicle)
            print(f"Vehicle {vehicle.number_plate} parked.")
        else:
            print("Parking lot is full.")
            return False
        return True

    def remove_vehicle(self, number_plate):
        if self.is_empty():
            print("Parking lot is empty.")
            return False

        temp_stack = []
        found = False

        while self.stack:
            top = self.stack.pop()
            if top.number_plate == number_plate:
                found = True
                print(f"Vehicle {number_plate} removed from parking.")
                break
            else:
                temp_stack.append(top)

        while temp_stack:
            self.stack.append(temp_stack.pop())

        if not found:
            print(f"Vehicle {number_plate} not found in parking lot.")
        return found

    def display_parking_status(self):
        print("\n--- Parking Lot Status ---")
        if self.is_empty():
            print("Parking lot is empty.")
        else:
            for v in reversed(self.stack):
                print(f"Vehicle: {v.number_plate}")
        print(f"Total vehicles parked: {len(self.stack)} / {self.capacity}")

    def to_dict(self):
        return {
            "capacity": self.capacity,
            "stack": [v.to_dict() for v in self.stack]
        }

    def from_dict(data):
        lot = ParkingLot(data["capacity"])
        lot.stack = [Vehicle.from_dict(v) for v in data["stack"]]
        return lot


class WaitingQueue:
    def __init__(self):
        self.queue = []

    def is_empty(self):
        return len(self.queue) == 0

    def enqueue(self, vehicle):
        self.queue.append(vehicle)
        print(f"Vehicle {vehicle.number_plate} added to waiting queue.")

    def dequeue(self):
        if not self.is_empty():
            vehicle = self.queue.pop(0)
            print(f"Vehicle {vehicle.number_plate} removed from waiting queue.")
            return vehicle
        return None

    def display_queue(self):
        print("\n--- Waiting Queue ---")
        if self.is_empty():
            print("Waiting queue is empty.")
        else:
            for v in self.queue:
                print(f"Vehicle: {v.number_plate}")
        print(f"Total vehicles waiting: {len(self.queue)}")

    def to_dict(self):
        return [v.to_dict() for v in self.queue]

    def from_dict(data):
        q = WaitingQueue()
        q.queue = [Vehicle.from_dict(v) for v in data]
        return q


def save_data(parking_lot, waiting_queue):
    with open(DATA_FILE, "w") as f:
        json.dump({
            "parking_lot": parking_lot.to_dict(),
            "waiting_queue": waiting_queue.to_dict()
        }, f, indent=4)
    print("Data saved.")


def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r") as f:
            data = json.load(f)
            parking_lot = ParkingLot.from_dict(data["parking_lot"])
            waiting_queue = WaitingQueue.from_dict(data["waiting_queue"])
            return parking_lot, waiting_queue
    return None, None


def main():
    parking_lot, waiting_queue = load_data()

    if parking_lot is None:
        capacity = int(input("Enter parking lot capacity: "))
        parking_lot = ParkingLot(capacity)
        waiting_queue = WaitingQueue()

    while True:
        print("\n1. Add Vehicle")
        print("2. Remove Vehicle")
        print("3. Show Parking Status")
        print("4. Show Waiting Queue")
        print("5. Exit")
        choice = input("Enter your choice: ")

        if choice == "1":
            number_plate = input("Enter vehicle number plate: ")
            vehicle = Vehicle(number_plate)
            success = parking_lot.park_vehicle(vehicle)
            if not success:
                waiting_queue.enqueue(vehicle)

        elif choice == "2":
            number_plate = input("Enter vehicle number plate to remove: ")
            found = parking_lot.remove_vehicle(number_plate)
            if found:
                if not waiting_queue.is_empty():
                    next_vehicle = waiting_queue.dequeue()
                    parking_lot.park_vehicle(next_vehicle)

        elif choice == "3":
            parking_lot.display_parking_status()

        elif choice == "4":
            waiting_queue.display_queue()

        elif choice == "5":
            save_data(parking_lot, waiting_queue)
            print("Exiting simulation.")
            break

        else:
            print("Invalid choice. Please try again.")

if __name__ == "__main__":
    main()
