import json
import os

DATA_FILE = "data/parking_data.json"


def save_data(parking_lot):
    os.makedirs("data", exist_ok=True)

    layout_data = {}
    for slot, info in parking_lot.layout.items():
        layout_data[slot] = {
            "status": info["status"],
            "vehicle": info["vehicle"].to_dict() if info["vehicle"] else None
        }

    data = {
        "row_config": parking_lot.row_config,
        "revenue":    parking_lot.revenue,
        "layout":     layout_data,
        "queue":      [v.to_dict() for v in parking_lot.queue]
    }

    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=4)


def load_data():
    if not os.path.exists(DATA_FILE):
        return None
    try:
        with open(DATA_FILE) as f:
            return json.load(f)
    except (json.JSONDecodeError, KeyError):
        return None