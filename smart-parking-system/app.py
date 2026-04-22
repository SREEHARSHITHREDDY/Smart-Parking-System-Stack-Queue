from flask import Flask, render_template, request, jsonify
from models.vehicle import Vehicle
from core.parking_lot import ParkingLot
from core.billing import Billing
from core.utils import validate_vehicle_number
from storage.file_handler import save_data, load_data

app = Flask(__name__)

parking_lot = None
billing     = Billing()


# ─────────────────────────────────────────────
# PAGE ROUTE
# ─────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ─────────────────────────────────────────────
# API: STATUS
# ─────────────────────────────────────────────

@app.route('/api/status')
def status():
    if not parking_lot:
        return jsonify({"setup": False})

    layout_data = {}
    for slot, info in parking_lot.layout.items():
        layout_data[slot] = {
            "status":  info["status"],
            "vehicle": info["vehicle"].to_dict() if info["vehicle"] else None,
            "floor":   info.get("floor")
        }

    return jsonify({
        "setup":        True,
        "row_config":   parking_lot.row_config,
        "floor_config": parking_lot.floor_config,
        "multi_floor":  parking_lot.multi_floor,
        "layout":       layout_data,
        "queue":        [v.to_dict() for v in parking_lot.queue],
        "revenue":      parking_lot.revenue,
        "stats":        parking_lot.get_stats(),
        "floor_stats":  parking_lot.get_floor_stats(),
        "rates":        billing.get_rate_info()
    })


# ─────────────────────────────────────────────
# API: SETUP
# ─────────────────────────────────────────────

@app.route('/api/setup', methods=['POST'])
def setup():
    global parking_lot

    data         = request.json
    multi_floor  = data.get('multi_floor', False)
    floor_config = data.get('floor_config', [])
    row_config   = data.get('row_config', [])

    if multi_floor:
        if not floor_config:
            return jsonify({"success": False, "message": "Floor configuration is empty"})
        if len(floor_config) > 10:
            return jsonify({"success": False, "message": "Maximum 10 floors allowed"})
        for fl in floor_config:
            if not fl.get("name", "").strip():
                return jsonify({"success": False, "message": "Each floor must have a name"})
            rows = fl.get("rows", [])
            if not rows:
                return jsonify({"success": False, "message": f"Floor '{fl['name']}' has no rows"})
            if len(rows) > 26:
                return jsonify({"success": False, "message": f"Floor '{fl['name']}': max 26 rows"})
            if not all(isinstance(n, int) and 1 <= n <= 20 for n in rows):
                return jsonify({"success": False, "message": f"Floor '{fl['name']}': each row must have 1-20 slots"})
        parking_lot = ParkingLot(row_config=None, floor_config=floor_config)
    else:
        if not row_config:
            return jsonify({"success": False, "message": "Row configuration is empty"})
        if not all(isinstance(n, int) and 1 <= n <= 20 for n in row_config):
            return jsonify({"success": False, "message": "Each row must have 1 to 20 slots"})
        if len(row_config) > 26:
            return jsonify({"success": False, "message": "Maximum 26 rows allowed"})
        parking_lot = ParkingLot(row_config=row_config)

    save_data(parking_lot)
    return jsonify({
        "success": True,
        "message": f"Parking lot created! {parking_lot.capacity} total slots."
    })


# ─────────────────────────────────────────────
# API: PARK VEHICLE
# ─────────────────────────────────────────────

@app.route('/api/park', methods=['POST'])
def park():
    global parking_lot

    if not parking_lot:
        return jsonify({"success": False, "message": "Parking lot not configured yet"})

    data            = request.json
    number_plate    = data.get('number_plate', '').strip().upper()
    vehicle_type    = data.get('vehicle_type', 'car').strip().lower()
    preferred_slot  = data.get('preferred_slot', '').strip().upper()
    preferred_floor = data.get('preferred_floor', '').strip()

    if not validate_vehicle_number(number_plate):
        return jsonify({"success": False, "message": "Invalid format. Use: AA00AA0000 (e.g. TS09AB1234)"})

    for info in parking_lot.layout.values():
        if info["vehicle"] and info["vehicle"].number_plate == number_plate:
            return jsonify({"success": False, "message": "Vehicle is already parked"})

    for v in parking_lot.queue:
        if v.number_plate == number_plate:
            return jsonify({"success": False, "message": "Vehicle is already in the waiting queue"})

    vehicle = Vehicle(number_plate, vehicle_type)

    # ── PREFERRED SPECIFIC SLOT ───────────────────────────────
    if preferred_slot:
        if preferred_slot not in parking_lot.layout:
            return jsonify({"success": False, "message": f"Slot {preferred_slot} does not exist"})
        if parking_lot.layout[preferred_slot]["status"] == "occupied":
            return jsonify({"success": False, "message": f"Slot {preferred_slot} was just taken. Please choose another."})

        parking_lot.layout[preferred_slot]["status"]  = "occupied"
        parking_lot.layout[preferred_slot]["vehicle"] = vehicle
        parking_lot.stack.append(vehicle)
        nearly_full = len(parking_lot.stack) >= 0.8 * parking_lot.capacity
        save_data(parking_lot)

        return jsonify({
            "success":      True,
            "queued":       False,
            "message":      f"Vehicle parked at chosen slot {preferred_slot}",
            "ticket_id":    vehicle.ticket_id,
            "qr_data":      vehicle.qr_data,
            "slot":         preferred_slot,
            "number_plate": vehicle.number_plate,
            "entry_time":   vehicle.entry_time.strftime('%H:%M:%S'),
            "nearly_full":  nearly_full,
            "manual_slot":  True
        })

    # ── AUTO-ASSIGN (with optional floor preference) ──────────
    result = parking_lot.park_vehicle(
        vehicle,
        preferred_floor=preferred_floor if preferred_floor else None
    )
    save_data(parking_lot)

    if result["queued"]:
        return jsonify({
            "success":        True,
            "queued":         True,
            "message":        f"Parking full! Added to queue at position #{result['queue_position']}",
            "ticket_id":      vehicle.ticket_id,
            "qr_data":        vehicle.qr_data,
            "number_plate":   vehicle.number_plate,
            "queue_position": result["queue_position"]
        })

    return jsonify({
        "success":      True,
        "queued":       False,
        "message":      f"Vehicle parked at slot {result['slot']}",
        "ticket_id":    vehicle.ticket_id,
        "qr_data":      vehicle.qr_data,
        "slot":         result["slot"],
        "number_plate": vehicle.number_plate,
        "entry_time":   vehicle.entry_time.strftime('%H:%M:%S'),
        "nearly_full":  result.get("nearly_full", False),
        "manual_slot":  False
    })


# ─────────────────────────────────────────────
# API: EXIT VEHICLE
# ─────────────────────────────────────────────

@app.route('/api/exit', methods=['POST'])
def exit_vehicle():
    global parking_lot

    if not parking_lot:
        return jsonify({"success": False, "message": "Parking lot not configured yet"})

    data       = request.json
    identifier = data.get('identifier', '').strip().upper()

    if not identifier:
        return jsonify({"success": False, "message": "Please enter Ticket ID or Vehicle Number"})

    result = parking_lot.remove_vehicle(identifier, billing)
    if result["success"]:
        save_data(parking_lot)

    return jsonify(result)


# ─────────────────────────────────────────────
# API: RESET
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
# ─────────────────────────────────────────────

def bootstrap():
    global parking_lot

    data = load_data()
    if not data:
        return

    try:
        multi_floor  = data.get("multi_floor", False)
        floor_config = data.get("floor_config")

        if multi_floor and floor_config:
            parking_lot = ParkingLot(row_config=None, floor_config=floor_config)
        else:
            parking_lot = ParkingLot(row_config=data["row_config"])

        parking_lot.revenue = data.get("revenue", 0)

        for slot, sdata in data.get("layout", {}).items():
            if slot in parking_lot.layout and sdata.get("vehicle"):
                v = Vehicle.from_dict(sdata["vehicle"])
                parking_lot.layout[slot]["status"]  = "occupied"
                parking_lot.layout[slot]["vehicle"] = v
                if sdata.get("floor"):
                    parking_lot.layout[slot]["floor"] = sdata["floor"]
                parking_lot.stack.append(v)

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