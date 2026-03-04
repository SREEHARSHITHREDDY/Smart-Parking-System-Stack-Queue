import json
import os
from models.vehicle import Vehicle

DATA_FILE = "data/parking_data.json"


def save_data(parking_lot):
    """
    Save parking lot state to JSON file
    """

    os.makedirs("data", exist_ok=True)

    data = {
        "rows": parking_lot.rows,
        "cols": parking_lot.cols,
        "revenue": parking_lot.revenue,
        "layout": {},
    }

    for slot, info in parking_lot.layout.items():

        if info["vehicle"]:
            vehicle_data = info["vehicle"].to_dict()
        else:
            vehicle_data = None

        data["layout"][slot] = {
            "status": info["status"],
            "vehicle": vehicle_data
        }

    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=4)


def load_data():
    """
    Load parking lot state from JSON file
    """

    if not os.path.exists(DATA_FILE):
        return None

    with open(DATA_FILE) as f:
        return json.load(f)