from models.vehicle import Vehicle
from core.parking_lot import ParkingLot
from core.billing import Billing
from core.utils import validate_vehicle_number
from storage.file_handler import save_data, load_data


def main():

    data = load_data()

    if data:
        parking_lot = ParkingLot(data["rows"], data["cols"])
        parking_lot.revenue = data["revenue"]
        print("Previous parking data loaded successfully.")
    else:
        print("\nCreate Parking Blueprint")
        rows = int(input("Enter number of rows: "))
        cols = int(input("Enter number of columns: "))
        parking_lot = ParkingLot(rows, cols)

    billing = Billing()

    while True:

        print("\n========== SMART PARKING SYSTEM ==========")
        print("1. Park Vehicle")
        print("2. Exit Vehicle (Ticket ID / Vehicle Number)")
        print("3. Show Parking Blueprint")
        print("4. View Revenue")
        print("5. Exit System")

        choice = input("Enter choice: ")

        if choice == "1":

            number_plate = input(
                "Enter Vehicle Number (Format: AA00AA0000 e.g., TS09AB1234): "
            ).strip().upper()

            if not validate_vehicle_number(number_plate):
                print("Invalid vehicle number format.")
                continue

            vehicle_type = input("Enter vehicle type (car/bike/truck): ").strip().lower()

            vehicle = Vehicle(number_plate, vehicle_type)

            parking_lot.park_vehicle(vehicle)

        elif choice == "2":

            identifier = input(
                "Enter Ticket ID or Vehicle Number: "
            ).strip().upper()

            parking_lot.remove_vehicle(identifier, billing)

        elif choice == "3":

            parking_lot.display_layout()

        elif choice == "4":

            print(f"\nTotal Revenue Collected: ₹{parking_lot.revenue}")

        elif choice == "5":

            save_data(parking_lot)

            print("\nParking data saved successfully.")
            print("Exiting Smart Parking System.")

            break

        else:
            print("Invalid option. Try again.")


if __name__ == "__main__":
    main()