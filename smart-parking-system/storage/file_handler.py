import json
import os

DATA_FILE = "data/parking_data.json"


def save_data(parking_lot):

    os.makedirs("data", exist_ok=True)

    data = {
        "rows": parking_lot.rows,
        "cols": parking_lot.cols,
        "revenue": parking_lot.revenue
    }

    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=4)


def load_data():

    if not os.path.exists(DATA_FILE):
        return None

    with open(DATA_FILE) as f:
        return json.load(f)