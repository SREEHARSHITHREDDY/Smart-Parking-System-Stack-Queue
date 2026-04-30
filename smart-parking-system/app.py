import os
from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from dotenv import load_dotenv

from models.vehicle import Vehicle
from core.parking_lot import ParkingLot
from core.billing import Billing
from core.utils import validate_vehicle_number

load_dotenv()

app = Flask(__name__)

# ── Config ────────────────────────────────────────────────────
DATABASE_URL = os.getenv('DATABASE_URL')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')

if DATABASE_URL:
    app.config['SQLALCHEMY_DATABASE_URI']        = DATABASE_URL
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    from models.db import db, init_db
    from models.user import UserModel, create_default_admin
    from storage.db_handler import save_data, load_data
    init_db(app)
    USE_DB = True
    print('✓ Using PostgreSQL database')
else:
    from storage.file_handler import save_data, load_data
    USE_DB = False
    print('⚠ DATABASE_URL not set — using JSON file storage')

# ── Flask-Login ───────────────────────────────────────────────
from flask_login import LoginManager, login_user, logout_user, login_required, current_user

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    if not USE_DB:
        return None
    return UserModel.query.get(int(user_id))

parking_lot = None
billing     = Billing()

UPLOAD_FOLDER  = os.path.join('static', 'uploads')
BLUEPRINT_FILE = os.path.join(UPLOAD_FOLDER, 'blueprint.png')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def blueprint_exists():
    return os.path.exists(BLUEPRINT_FILE)


def login_exempt(f):
    """Mark a route as not requiring login (used when USE_DB is False)."""
    f._login_exempt = True
    return f


# ─────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────

@app.route('/login', methods=['GET', 'POST'])
def login():
    # If DB not enabled — skip auth, go straight to app
    if not USE_DB:
        return redirect(url_for('index'))

    if current_user.is_authenticated:
        return redirect(url_for('index'))

    if request.method == 'POST':
        email    = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')

        user = UserModel.query.filter_by(email=email).first()

        if user and user.check_password(password) and user.active:
            from datetime import datetime
            user.last_login = datetime.utcnow()
            db.session.commit()
            login_user(user, remember=True)
            return redirect(url_for('index'))
        else:
            return render_template('login.html', error='Invalid email or password', email=email)

    return render_template('login.html')


@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('login'))


# ─────────────────────────────────────────────
# AUTH HELPER — require login on all API routes
# ─────────────────────────────────────────────

def api_login_required(f):
    """Decorator: requires login for API routes when DB is enabled."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if USE_DB and not current_user.is_authenticated:
            return jsonify({'success': False, 'message': 'Login required'}), 401
        return f(*args, **kwargs)
    return decorated


# ─────────────────────────────────────────────
# PAGE ROUTE
# ─────────────────────────────────────────────

@app.route('/')
def index():
    if USE_DB and not current_user.is_authenticated:
        return redirect(url_for('login'))
    return render_template('index.html')


# ─────────────────────────────────────────────
# API: STATUS
# ─────────────────────────────────────────────

@app.route('/api/status')
@api_login_required
def status():
    if not parking_lot:
        return jsonify({
            'setup':        False,
            'hasBlueprint': blueprint_exists()
        })

    layout_data = {}
    for slot, info in parking_lot.layout.items():
        layout_data[slot] = {
            'status':   info['status'],
            'vehicle':  info['vehicle'].to_dict() if info['vehicle'] else None,
            'floor':    info.get('floor'),
            'position': info.get('position'),
        }

    return jsonify({
        'setup':        True,
        'hasBlueprint': blueprint_exists(),
        'row_config':   parking_lot.row_config,
        'floor_config': parking_lot.floor_config,
        'multi_floor':  parking_lot.multi_floor,
        'layout':       layout_data,
        'queue':        [v.to_dict() for v in parking_lot.queue],
        'revenue':      parking_lot.revenue,
        'stats':        parking_lot.get_stats(),
        'floor_stats':  parking_lot.get_floor_stats(),
        'rates':        billing.get_rate_info()
    })


# ─────────────────────────────────────────────
# API: SETUP
# ─────────────────────────────────────────────

@app.route('/api/setup', methods=['POST'])
@api_login_required
def setup():
    global parking_lot

    data         = request.json
    multi_floor  = data.get('multi_floor', False)
    floor_config = data.get('floor_config', [])
    row_config   = data.get('row_config', [])

    if multi_floor:
        if not floor_config:
            return jsonify({'success': False, 'message': 'Floor configuration is empty'})
        if len(floor_config) > 10:
            return jsonify({'success': False, 'message': 'Maximum 10 floors allowed'})
        for fl in floor_config:
            if not fl.get('name', '').strip():
                return jsonify({'success': False, 'message': 'Each floor must have a name'})
            rows = fl.get('rows', [])
            if not rows:
                return jsonify({'success': False, 'message': f"Floor '{fl['name']}' has no rows"})
            if len(rows) > 26:
                return jsonify({'success': False, 'message': f"Floor '{fl['name']}': max 26 rows"})
            if not all(isinstance(n, int) and 1 <= n <= 20 for n in rows):
                return jsonify({'success': False, 'message': f"Floor '{fl['name']}': each row 1-20 slots"})
        parking_lot = ParkingLot(row_config=None, floor_config=floor_config)
    else:
        if not row_config:
            return jsonify({'success': False, 'message': 'Row configuration is empty'})
        if not all(isinstance(n, int) and 1 <= n <= 20 for n in row_config):
            return jsonify({'success': False, 'message': 'Each row must have 1 to 20 slots'})
        if len(row_config) > 26:
            return jsonify({'success': False, 'message': 'Maximum 26 rows allowed'})
        parking_lot = ParkingLot(row_config=row_config)

    save_data(parking_lot)
    return jsonify({
        'success': True,
        'message': f'Parking lot created! {parking_lot.capacity} total slots.'
    })


# ─────────────────────────────────────────────
# API: BLUEPRINT
# ─────────────────────────────────────────────

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/upload-blueprint', methods=['POST'])
@api_login_required
def upload_blueprint():
    if 'blueprint' not in request.files:
        return jsonify({'success': False, 'message': 'No file in request'})
    file = request.files['blueprint']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No file selected'})
    if not allowed_file(file.filename):
        return jsonify({'success': False, 'message': 'Invalid file type'})
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    file.save(BLUEPRINT_FILE)
    return jsonify({
        'success': True,
        'message': 'Blueprint uploaded successfully',
        'url':     f'/static/uploads/blueprint.png?t={int(__import__("time").time())}'
    })

@app.route('/api/blueprint-status')
@api_login_required
def blueprint_status():
    exists = blueprint_exists()
    return jsonify({'exists': exists, 'url': '/static/uploads/blueprint.png' if exists else None})

@app.route('/api/save-slot-positions', methods=['POST'])
@api_login_required
def save_slot_positions():
    global parking_lot
    if not parking_lot:
        return jsonify({'success': False, 'message': 'Parking lot not configured yet'})
    positions = request.json.get('positions', {})
    for slot_id, pos in positions.items():
        if slot_id in parking_lot.layout:
            parking_lot.layout[slot_id]['position'] = {
                'x': float(pos.get('x', 50)),
                'y': float(pos.get('y', 50))
            }
    save_data(parking_lot)
    return jsonify({'success': True, 'message': f'Saved positions for {len(positions)} slots'})


# ─────────────────────────────────────────────
# API: PARK VEHICLE
# ─────────────────────────────────────────────

@app.route('/api/park', methods=['POST'])
@api_login_required
def park():
    global parking_lot

    if not parking_lot:
        return jsonify({'success': False, 'message': 'Parking lot not configured yet'})

    data            = request.json
    number_plate    = data.get('number_plate', '').strip().upper()
    vehicle_type    = data.get('vehicle_type', 'car').strip().lower()
    preferred_slot  = data.get('preferred_slot', '').strip().upper()
    preferred_floor = data.get('preferred_floor', '').strip()

    if not validate_vehicle_number(number_plate):
        return jsonify({'success': False, 'message': 'Invalid format. Use: AA00AA0000 (e.g. TS09AB1234)'})

    for info in parking_lot.layout.values():
        if info['vehicle'] and info['vehicle'].number_plate == number_plate:
            return jsonify({'success': False, 'message': 'Vehicle is already parked'})

    for v in parking_lot.queue:
        if v.number_plate == number_plate:
            return jsonify({'success': False, 'message': 'Vehicle is already in the waiting queue'})

    vehicle = Vehicle(number_plate, vehicle_type)

    if preferred_slot:
        if preferred_slot not in parking_lot.layout:
            return jsonify({'success': False, 'message': f'Slot {preferred_slot} does not exist'})
        if parking_lot.layout[preferred_slot]['status'] == 'occupied':
            return jsonify({'success': False, 'message': f'Slot {preferred_slot} was just taken.'})
        parking_lot.layout[preferred_slot]['status']  = 'occupied'
        parking_lot.layout[preferred_slot]['vehicle'] = vehicle
        parking_lot.stack.append(vehicle)
        nearly_full = len(parking_lot.stack) >= 0.8 * parking_lot.capacity
        save_data(parking_lot)
        return jsonify({
            'success':      True,
            'queued':       False,
            'message':      f'Vehicle parked at chosen slot {preferred_slot}',
            'ticket_id':    vehicle.ticket_id,
            'qr_data':      vehicle.qr_data,
            'slot':         preferred_slot,
            'number_plate': vehicle.number_plate,
            'entry_time':   vehicle.entry_time.strftime('%H:%M:%S'),
            'nearly_full':  nearly_full,
            'manual_slot':  True
        })

    result = parking_lot.park_vehicle(
        vehicle,
        preferred_floor=preferred_floor if preferred_floor else None
    )
    save_data(parking_lot)

    if result['queued']:
        return jsonify({
            'success':        True,
            'queued':         True,
            'message':        f"Parking full! Added to queue at position #{result['queue_position']}",
            'ticket_id':      vehicle.ticket_id,
            'qr_data':        vehicle.qr_data,
            'number_plate':   vehicle.number_plate,
            'queue_position': result['queue_position']
        })

    return jsonify({
        'success':      True,
        'queued':       False,
        'message':      f"Vehicle parked at slot {result['slot']}",
        'ticket_id':    vehicle.ticket_id,
        'qr_data':      vehicle.qr_data,
        'slot':         result['slot'],
        'number_plate': vehicle.number_plate,
        'entry_time':   vehicle.entry_time.strftime('%H:%M:%S'),
        'nearly_full':  result.get('nearly_full', False),
        'manual_slot':  False
    })


# ─────────────────────────────────────────────
# API: EXIT VEHICLE
# ─────────────────────────────────────────────

@app.route('/api/exit', methods=['POST'])
@api_login_required
def exit_vehicle():
    global parking_lot

    if not parking_lot:
        return jsonify({'success': False, 'message': 'Parking lot not configured yet'})

    identifier = request.json.get('identifier', '').strip().upper()
    if not identifier:
        return jsonify({'success': False, 'message': 'Please enter Ticket ID or Vehicle Number'})

    result = parking_lot.remove_vehicle(identifier, billing)
    if result['success']:
        save_data(parking_lot)

    return jsonify(result)


# ─────────────────────────────────────────────
# API: HISTORY + ANALYTICS
# ─────────────────────────────────────────────

@app.route('/api/history')
@api_login_required
def history():
    if not parking_lot:
        return jsonify({'success': False, 'history': []})
    records = list(reversed(parking_lot.history[-200:]))
    return jsonify({'success': True, 'history': records})

@app.route('/api/analytics')
@api_login_required
def analytics():
    if not parking_lot:
        return jsonify({'success': False})
    return jsonify({'success': True, 'analytics': parking_lot.get_analytics()})


# ─────────────────────────────────────────────
# API: RESET
# ─────────────────────────────────────────────

@app.route('/api/reset', methods=['POST'])
@api_login_required
def reset():
    global parking_lot
    parking_lot = None

    if USE_DB:
        from models.db import (
            db, ParkingLotModel, SlotModel,
            VehicleModel, QueueModel, HistoryModel
        )
        try:
            HistoryModel.query.filter_by(lot_id=1).delete()
            QueueModel.query.filter_by(lot_id=1).delete()
            slot_ids = [s.id for s in SlotModel.query.filter_by(lot_id=1).all()]
            if slot_ids:
                VehicleModel.query.filter(
                    VehicleModel.slot_db_id.in_(slot_ids)
                ).delete(synchronize_session='fetch')
            SlotModel.query.filter_by(lot_id=1).delete()
            ParkingLotModel.query.filter_by(id=1).delete()
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'message': f'Reset failed: {str(e)}'})
    else:
        if os.path.exists('data/parking_data.json'):
            os.remove('data/parking_data.json')

    if os.path.exists(BLUEPRINT_FILE):
        os.remove(BLUEPRINT_FILE)

    return jsonify({'success': True, 'message': 'System reset successfully'})


# ─────────────────────────────────────────────
# API: USER INFO (for frontend)
# ─────────────────────────────────────────────

@app.route('/api/me')
@api_login_required
def me():
    if not USE_DB:
        return jsonify({'name': 'Operator', 'role': 'admin', 'email': ''})
    return jsonify({
        'name':  current_user.name,
        'role':  current_user.role,
        'email': current_user.email,
    })


# ─────────────────────────────────────────────
# BOOTSTRAP
# ─────────────────────────────────────────────

def bootstrap():
    global parking_lot

    # Create default admin if DB is enabled
    if USE_DB:
        try:
            create_default_admin()
        except Exception as e:
            print(f'Admin seed error: {e}')

    data = load_data()
    if not data:
        return

    try:
        multi_floor  = data.get('multi_floor', False)
        floor_config = data.get('floor_config')

        if multi_floor and floor_config:
            parking_lot = ParkingLot(row_config=None, floor_config=floor_config)
        else:
            parking_lot = ParkingLot(row_config=data['row_config'])

        parking_lot.revenue         = data.get('revenue', 0)
        parking_lot.history         = data.get('history', [])
        parking_lot.revenue_by_type = data.get(
            'revenue_by_type', {'car': 0, 'bike': 0, 'truck': 0}
        )

        for slot, sdata in data.get('layout', {}).items():
            if slot in parking_lot.layout:
                if sdata.get('vehicle'):
                    v = Vehicle.from_dict(sdata['vehicle'])
                    parking_lot.layout[slot]['status']  = 'occupied'
                    parking_lot.layout[slot]['vehicle'] = v
                    parking_lot.stack.append(v)
                if sdata.get('floor'):
                    parking_lot.layout[slot]['floor'] = sdata['floor']
                if sdata.get('position'):
                    parking_lot.layout[slot]['position'] = sdata['position']

        for vdata in data.get('queue', []):
            v = Vehicle.from_dict(vdata)
            parking_lot.queue.append(v)

        print(f"✓ Loaded: {parking_lot.capacity} slots · "
              f"Revenue: ₹{parking_lot.revenue} · "
              f"History: {len(parking_lot.history)} records")

    except Exception as e:
        print(f'Could not load previous data: {e}')
        parking_lot = None



# ─────────────────────────────────────────────
# API: DYNAMIC PRICING RULES
# ─────────────────────────────────────────────

@app.route('/api/pricing-rules', methods=['GET'])
@api_login_required
def get_pricing_rules():
    if not USE_DB:
        return jsonify({'success': True, 'rules': []})
    from models.db import DynamicRateRule
    rules = DynamicRateRule.query.filter_by(lot_id=1, active=True).all()
    return jsonify({'success': True, 'rules': [r.to_dict() for r in rules]})

@app.route('/api/pricing-rules', methods=['POST'])
@api_login_required
def add_pricing_rule():
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import DynamicRateRule, db
    data = request.json
    name       = data.get('name', '').strip()
    hour_start = int(data.get('hour_start', 9))
    hour_end   = int(data.get('hour_end', 11))
    multiplier = float(data.get('multiplier', 1.5))
    day_of_week = data.get('day_of_week')
    if day_of_week is not None and day_of_week != '':
        day_of_week = int(day_of_week)
    else:
        day_of_week = None

    if not name:
        return jsonify({'success': False, 'message': 'Rule name is required'})
    if not (0 <= hour_start <= 23) or not (0 <= hour_end <= 23):
        return jsonify({'success': False, 'message': 'Hours must be between 0 and 23'})
    if hour_start >= hour_end:
        return jsonify({'success': False, 'message': 'Start hour must be before end hour'})
    if not (1.1 <= multiplier <= 5.0):
        return jsonify({'success': False, 'message': 'Multiplier must be between 1.1 and 5.0'})

    rule = DynamicRateRule(
        lot_id      = 1,
        name        = name,
        hour_start  = hour_start,
        hour_end    = hour_end,
        multiplier  = multiplier,
        day_of_week = day_of_week,
        active      = True
    )
    db.session.add(rule)
    db.session.commit()
    return jsonify({'success': True, 'rule': rule.to_dict()})

@app.route('/api/pricing-rules/<int:rule_id>', methods=['DELETE'])
@api_login_required
def delete_pricing_rule(rule_id):
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import DynamicRateRule, db
    rule = DynamicRateRule.query.get(rule_id)
    if not rule:
        return jsonify({'success': False, 'message': 'Rule not found'})
    rule.active = False
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/current-surge')
@api_login_required
def current_surge():
    if not USE_DB:
        return jsonify({'active': False, 'multiplier': 1.0, 'name': ''})
    from models.db import get_active_rule
    rule = get_active_rule(1)
    if rule:
        return jsonify({'active': True, 'multiplier': rule.multiplier, 'name': rule.name})
    return jsonify({'active': False, 'multiplier': 1.0, 'name': ''})

# ─────────────────────────────────────────────
# BOOTSTRAP ON MODULE LOAD (for gunicorn)
# ─────────────────────────────────────────────
with app.app_context():
    bootstrap()

# ─────────────────────────────────────────────
# ENTRY POINT (local dev only)
# ─────────────────────────────────────────────
if __name__ == '__main__':
    port  = int(os.getenv('PORT', 5001))
    debug = os.getenv('FLASK_ENV', 'production') != 'production'
    print(f'Smart Parking System running at → http://localhost:{port}')
    app.run(debug=debug, host='0.0.0.0', port=port)