from flask import Flask, render_template, request, jsonify
from models.vehicle import Vehicle
from core.parking_lot import ParkingLot
from core.billing import Billing
from core.utils import validate_vehicle_number
from storage.file_handler import save_data, load_data

app = Flask(__name__)

parking_lot = None
billing = Billing()


# ─────────────────────────────────────────────
# PAGE ROUTE
# ─────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ─────────────────────────────────────────────
# API: STATUS
# Returns full parking state to frontend
# ─────────────────────────────────────────────

@app.route('/api/status')
def status():
    if not parking_lot:
        return jsonify({"setup": False})

    layout_data = {}
    for slot, info in parking_lot.layout.items():
        layout_data[slot] = {
            "status": info["status"],
            "vehicle": info["vehicle"].to_dict() if info["vehicle"] else None
        }

    queue_data = [v.to_dict() for v in parking_lot.queue]

    return jsonify({
        "setup":      True,
        "row_config": parking_lot.row_config,
        "layout":     layout_data,
        "queue":      queue_data,
        "revenue":    parking_lot.revenue,
        "stats":      parking_lot.get_stats(),
        "rates":      billing.get_rate_info()
    })


# ─────────────────────────────────────────────
# API: SETUP
# Admin configures the parking layout
# ─────────────────────────────────────────────

@app.route('/api/setup', methods=['POST'])
def setup():
    global parking_lot

    data = request.json
    row_config = data.get('row_config', [])

    if not row_config:
        return jsonify({"success": False, "message": "Row configuration is empty"})

    if not all(isinstance(n, int) and 1 <= n <= 20 for n in row_config):
        return jsonify({"success": False, "message": "Each row must have 1 to 20 slots"})

    if len(row_config) > 26:
        return jsonify({"success": False, "message": "Maximum 26 rows allowed"})

    parking_lot = ParkingLot(row_config)
    save_data(parking_lot)

    total = parking_lot.capacity
    return jsonify({
        "success": True,
        "message": f"Parking lot created! {len(row_config)} rows, {total} total slots."
    })


# ─────────────────────────────────────────────
# API: PARK VEHICLE
# Parks a vehicle or adds to waiting queue
# ─────────────────────────────────────────────

@app.route('/api/park', methods=['POST'])
def park():
    global parking_lot

    if not parking_lot:
        return jsonify({"success": False, "message": "Parking lot not configured yet"})

    data = request.json
    number_plate = data.get('number_plate', '').strip().upper()
    vehicle_type = data.get('vehicle_type', 'car').strip().lower()

    # Validate format
    if not validate_vehicle_number(number_plate):
        return jsonify({
            "success": False,
            "message": "Invalid format. Use: AA00AA0000 (e.g. TS09AB1234)"
        })

    # Duplicate check — already parked
    for info in parking_lot.layout.values():
        if info["vehicle"] and info["vehicle"].number_plate == number_plate:
            return jsonify({"success": False, "message": "Vehicle is already parked"})

    # Duplicate check — already in queue
    for v in parking_lot.queue:
        if v.number_plate == number_plate:
            return jsonify({"success": False, "message": "Vehicle is already in the waiting queue"})

    vehicle = Vehicle(number_plate, vehicle_type)
    result = parking_lot.park_vehicle(vehicle)
    save_data(parking_lot)

    # Vehicle went to queue
    if result["queued"]:
        return jsonify({
            "success":      True,
            "queued":       True,
            "message":      f"Parking full! Added to queue at position #{result['queue_position']}",
            "ticket_id":    vehicle.ticket_id,
            "number_plate": vehicle.number_plate
        })

    # Vehicle parked successfully
    return jsonify({
        "success":      True,
        "queued":       False,
        "message":      f"Vehicle parked at slot {result['slot']}",
        "ticket_id":    vehicle.ticket_id,
        "slot":         result["slot"],
        "number_plate": vehicle.number_plate,
        "entry_time":   vehicle.entry_time.strftime('%H:%M:%S'),
        "nearly_full":  result.get("nearly_full", False)
    })


# ─────────────────────────────────────────────
# API: EXIT VEHICLE
# Removes vehicle, calculates fee, auto-parks
# first vehicle from queue if any
# ─────────────────────────────────────────────

@app.route('/api/exit', methods=['POST'])
def exit_vehicle():
    global parking_lot

    if not parking_lot:
        return jsonify({"success": False, "message": "Parking lot not configured yet"})

    data = request.json
    identifier = data.get('identifier', '').strip().upper()

    if not identifier:
        return jsonify({"success": False, "message": "Please enter Ticket ID or Vehicle Number"})

    result = parking_lot.remove_vehicle(identifier, billing)

    if result["success"]:
        save_data(parking_lot)

    return jsonify(result)


# ─────────────────────────────────────────────
# API: RESET
# Wipes all data and resets the system
# ─────────────────────────────────────────────

@app.route('/api/reset', methods=['POST'])
def reset():
    global parking_lot
    parking_lot = None

    import os
    if os.path.exists("data/parking_data.json"):
        os.remove("data/parking_data.json")

    return jsonify({"success": True, "message": "System reset successfully"})


# ─────────────────────────────────────────────
# BOOTSTRAP
# Loads previous parking data on startup
# ─────────────────────────────────────────────

def bootstrap():
    global parking_lot

    data = load_data()
    if not data:
        return

    try:
        parking_lot = ParkingLot(data["row_config"])
        parking_lot.revenue = data.get("revenue", 0)

        # Restore parked vehicles
        for slot, sdata in data.get("layout", {}).items():
            if slot in parking_lot.layout and sdata.get("vehicle"):
                v = Vehicle.from_dict(sdata["vehicle"])
                parking_lot.layout[slot]["status"] = "occupied"
                parking_lot.layout[slot]["vehicle"] = v
                parking_lot.stack.append(v)

        # Restore waiting queue
        for vdata in data.get("queue", []):
            v = Vehicle.from_dict(vdata)
            parking_lot.queue.append(v)

        print(f"✓ Previous data loaded: {parking_lot.capacity} slots, "
              f"Revenue: ₹{parking_lot.revenue}")

    except Exception as e:
        print(f"Could not load previous data: {e}")
        parking_lot = None


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == '__main__':
    bootstrap()
    print("Smart Parking System running at → http://localhost:5000")
    app.run(debug=True, port=5000)