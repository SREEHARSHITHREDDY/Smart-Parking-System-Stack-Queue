import json
import os

DATA_FILE = "data/parking_data.json"


def save_data(parking_lot):
    os.makedirs("data", exist_ok=True)

    with open(DATA_FILE, "w") as f:
        json.dump({
            "rows": parking_lot.rows,
            "cols": parking_lot.cols,
            "revenue": parking_lot.revenue
        }, f, indent=4)


def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE) as f:
            return json.load(f)
    return None