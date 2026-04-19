import json
import os

DATA_FILE = "data/parking_data.json"


def save_data(parking_lot):
    os.makedirs("data", exist_ok=True)

    layout_data = {}
    for slot, info in parking_lot.layout.items():
        layout_data[slot] = {
            "status":   info["status"],
            "vehicle":  info["vehicle"].to_dict() if info["vehicle"] else None,
            "floor":    info.get("floor"),
            "position": info.get("position")
        }

    data = {
        "row_config":      parking_lot.row_config,
        "floor_config":    parking_lot.floor_config,
        "multi_floor":     parking_lot.multi_floor,
        "revenue":         parking_lot.revenue,
        "revenue_by_type": parking_lot.revenue_by_type,   # Phase 4
        "layout":          layout_data,
        "queue":           [v.to_dict() for v in parking_lot.queue],
        "history":         parking_lot.history             # Phase 4
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