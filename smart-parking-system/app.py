import os
from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from dotenv import load_dotenv

from models.vehicle import Vehicle
from core.parking_lot import ParkingLot
from core.billing import Billing
from core.utils import validate_vehicle_number
from core.security import sanitize_plate, sanitize_string, sanitize_float

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

# ── Security Headers ─────────────────────────────────────────
@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options']    = 'nosniff'
    response.headers['X-Frame-Options']           = 'SAMEORIGIN'
    response.headers['X-XSS-Protection']          = '1; mode=block'
    response.headers['Referrer-Policy']           = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy']        = 'geolocation=(), microphone=()'
    if os.getenv('FLASK_ENV') == 'production':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

# ── Flask-Login ───────────────────────────────────────────────
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# ── Rate Limiter ──────────────────────────────────────────
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per minute"],
    storage_uri="memory://"
)

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
@limiter.limit("10 per minute")
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
# PWA ROUTES — serve manifest and service worker
# ─────────────────────────────────────────────

@app.route('/manifest.json')
def manifest():
    return app.send_static_file('manifest.json')

@app.route('/sw.js')
def service_worker():
    from flask import Response
    try:
        with open(os.path.join(app.root_path, 'sw.js')) as f:
            content_sw = f.read()
        resp = Response(content_sw, mimetype='application/javascript')
        resp.headers['Service-Worker-Allowed'] = '/'
        resp.headers['Cache-Control'] = 'no-cache'
        return resp
    except FileNotFoundError:
        return Response('', mimetype='application/javascript')

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

    lot_name = 'Smart Parking'
    if USE_DB:
        from models.db import ParkingLotModel
        lot = ParkingLotModel.query.get(1)
        if lot: lot_name = lot.name

    return jsonify({
        'setup':        True,
        'lot_name':     lot_name,
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
@limiter.limit("30 per minute")
def park():
    global parking_lot

    if not parking_lot:
        return jsonify({'success': False, 'message': 'Parking lot not configured yet'})

    data            = request.json
    number_plate    = sanitize_plate(data.get('number_plate', ''))
    vehicle_type    = sanitize_string(data.get('vehicle_type', 'car'), 16).lower()
    preferred_slot  = sanitize_plate(data.get('preferred_slot', ''))
    preferred_floor = sanitize_string(data.get('preferred_floor', ''), 64)

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
@limiter.limit("30 per minute")
def exit_vehicle():
    global parking_lot

    if not parking_lot:
        return jsonify({'success': False, 'message': 'Parking lot not configured yet'})

    identifier = sanitize_plate(request.json.get('identifier', ''))
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
# API: SLOT NOTES
# ─────────────────────────────────────────────

@app.route('/api/slots/<slot_id>/note', methods=['POST'])
@api_login_required
def set_slot_note(slot_id):
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import SlotNote
    from core.security import sanitize_string
    data      = request.json
    note_type = data.get('note_type', '').strip()
    note_text = sanitize_string(data.get('note_text', ''), 200)

    note = SlotNote.query.filter_by(lot_id=1, slot_id=slot_id).first()

    if not note_type:
        # Clear note
        if note:
            db.session.delete(note)
            db.session.commit()
        return jsonify({'success': True, 'cleared': True})

    if not note:
        note = SlotNote(lot_id=1, slot_id=slot_id)
        db.session.add(note)

    note.note_type = note_type
    note.note_text = note_text
    db.session.commit()
    return jsonify({'success': True, 'note': note.to_dict()})

@app.route('/api/slots/notes', methods=['GET'])
@api_login_required
def get_slot_notes():
    if not USE_DB:
        return jsonify({'success': True, 'notes': {}})
    from models.db import SlotNote
    notes = SlotNote.query.filter_by(lot_id=1).all()
    return jsonify({'success': True, 'notes': {n.slot_id: n.to_dict() for n in notes}})

# ─────────────────────────────────────────────
# API: CHANGE PASSWORD
# ─────────────────────────────────────────────

@app.route('/api/change-password', methods=['POST'])
@api_login_required
def change_password():
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    data         = request.json
    current_pw   = data.get('current_password', '')
    new_pw       = data.get('new_password', '')
    confirm_pw   = data.get('confirm_password', '')
    if not current_pw or not new_pw or not confirm_pw:
        return jsonify({'success': False, 'message': 'All fields required'})
    if not current_user.check_password(current_pw):
        return jsonify({'success': False, 'message': 'Current password is incorrect'})
    if len(new_pw) < 6:
        return jsonify({'success': False, 'message': 'New password must be at least 6 characters'})
    if new_pw != confirm_pw:
        return jsonify({'success': False, 'message': 'Passwords do not match'})
    current_user.set_password(new_pw)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Password changed successfully'})

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
# API: EV CHARGING
# ─────────────────────────────────────────────

@app.route('/api/ev/start', methods=['POST'])
@api_login_required
def ev_start():
    """Start a charging session when an EV parks."""
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import EVChargingSession
    data         = request.json
    slot_id      = data.get('slot_id', '').strip().upper()
    ticket_id    = data.get('ticket_id', '').strip().upper()
    number_plate = data.get('number_plate', '').strip().upper()
    kwh_rate     = float(data.get('kwh_rate', 12.0))

    if not slot_id or not ticket_id:
        return jsonify({'success': False, 'message': 'slot_id and ticket_id required'})

    # Check no active session for this slot
    existing = EVChargingSession.query.filter_by(
        slot_id=slot_id, status='charging'
    ).first()
    if existing:
        return jsonify({'success': False, 'message': 'Charging session already active for this slot'})

    session = EVChargingSession(
        lot_id       = 1,
        slot_id      = slot_id,
        ticket_id    = ticket_id,
        number_plate = number_plate,
        kwh_rate     = kwh_rate,
        status       = 'charging'
    )
    db.session.add(session)
    db.session.commit()
    return jsonify({'success': True, 'session_id': session.id, 'kwh_rate': kwh_rate})

@app.route('/api/ev/stop', methods=['POST'])
@api_login_required
def ev_stop():
    """Stop charging and calculate fee."""
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import EVChargingSession
    from datetime import datetime
    data         = request.json
    ticket_id    = data.get('ticket_id', '').strip().upper()
    kwh_delivered = float(data.get('kwh_delivered', 0))

    session = EVChargingSession.query.filter_by(
        ticket_id=ticket_id, status='charging'
    ).first()
    if not session:
        return jsonify({'success': False, 'message': 'No active charging session found'})

    charging_fee         = round(kwh_delivered * session.kwh_rate, 2)
    session.kwh_delivered = kwh_delivered
    session.charging_fee  = charging_fee
    session.end_time      = datetime.utcnow()
    session.status        = 'completed'
    db.session.commit()

    return jsonify({
        'success':       True,
        'kwh_delivered': kwh_delivered,
        'kwh_rate':      session.kwh_rate,
        'charging_fee':  charging_fee,
        'duration_min':  round((session.end_time - session.start_time).total_seconds() / 60, 1)
    })

@app.route('/api/ev/sessions', methods=['GET'])
@api_login_required
def ev_sessions():
    """List active and recent charging sessions."""
    if not USE_DB:
        return jsonify({'success': True, 'sessions': []})
    from models.db import EVChargingSession
    sessions = EVChargingSession.query.filter_by(lot_id=1).order_by(
        EVChargingSession.start_time.desc()
    ).limit(20).all()
    return jsonify({'success': True, 'sessions': [s.to_dict() for s in sessions]})

@app.route('/api/ev/active', methods=['GET'])
@api_login_required
def ev_active():
    """Get all currently active charging sessions."""
    if not USE_DB:
        return jsonify({'success': True, 'sessions': []})
    from models.db import EVChargingSession
    sessions = EVChargingSession.query.filter_by(lot_id=1, status='charging').all()
    return jsonify({'success': True, 'sessions': [s.to_dict() for s in sessions]})

# ─────────────────────────────────────────────
# API: AI PREDICTION
# ─────────────────────────────────────────────

@app.route('/api/prediction')
@api_login_required
def prediction():
    if not parking_lot:
        return jsonify({'success': False, 'prediction': []})
    from core.predictor import predict_peak_hours, get_best_time_to_park
    pred       = predict_peak_hours(parking_lot.history)
    best_time  = get_best_time_to_park(pred)
    peak_hours = [p for p in pred if p['level'] == 'peak']
    return jsonify({
        'success':    True,
        'prediction': pred,
        'best_time':  best_time,
        'peak_count': len(peak_hours),
        'data_points': len(parking_lot.history),
    })

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
# API: BOOKINGS
# ─────────────────────────────────────────────

@app.route('/api/bookings', methods=['GET'])
@api_login_required
def get_bookings():
    if not USE_DB:
        return jsonify({'success': True, 'bookings': []})
    from models.db import BookingModel
    from datetime import datetime
    # Auto-expire old bookings
    expired = BookingModel.query.filter(
        BookingModel.status == 'active',
        BookingModel.expires_at < datetime.utcnow()
    ).all()
    for b in expired:
        b.status = 'expired'
    if expired:
        db.session.commit()

    bookings = BookingModel.query.filter_by(lot_id=1, status='active').order_by(
        BookingModel.booked_for
    ).all()
    return jsonify({'success': True, 'bookings': [b.to_dict() for b in bookings]})

@app.route('/api/bookings', methods=['POST'])
@api_login_required
def create_booking():
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import BookingModel
    from datetime import datetime, timedelta
    import uuid

    data         = request.json
    number_plate = data.get('number_plate', '').strip().upper()
    vehicle_type = data.get('vehicle_type', 'car').strip().lower()
    booked_for   = data.get('booked_for', '')
    phone        = data.get('phone', '').strip()

    if not number_plate or not booked_for:
        return jsonify({'success': False, 'message': 'Plate and booking time are required'})

    if not validate_vehicle_number(number_plate):
        return jsonify({'success': False, 'message': 'Invalid plate format'})

    try:
        booked_for_dt = datetime.fromisoformat(booked_for)
    except Exception:
        return jsonify({'success': False, 'message': 'Invalid date format'})

    if booked_for_dt < datetime.now():
        return jsonify({'success': False, 'message': 'Booking time must be in the future'})

    # Check no duplicate active booking for same plate
    existing = BookingModel.query.filter_by(
        number_plate=number_plate, status='active', lot_id=1
    ).first()
    if existing:
        return jsonify({'success': False, 'message': 'Active booking already exists for this plate'})

    booking_ref = str(uuid.uuid4())[:8].upper()
    expires_at  = booked_for_dt + timedelta(minutes=30)  # 30 min grace period

    booking = BookingModel(
        lot_id       = 1,
        number_plate = number_plate,
        vehicle_type = vehicle_type,
        booking_ref  = booking_ref,
        booked_for   = booked_for_dt,
        expires_at   = expires_at,
        phone        = phone or None,
        status       = 'active'
    )
    db.session.add(booking)
    db.session.commit()

    return jsonify({
        'success':     True,
        'booking_ref': booking_ref,
        'booked_for':  booked_for_dt.strftime('%d %b %Y %H:%M'),
        'expires_at':  expires_at.strftime('%H:%M'),
        'booking':     booking.to_dict()
    })

@app.route('/api/bookings/<int:booking_id>/cancel', methods=['POST'])
@api_login_required
def cancel_booking(booking_id):
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import BookingModel
    booking = BookingModel.query.get(booking_id)
    if not booking:
        return jsonify({'success': False, 'message': 'Booking not found'})
    booking.status = 'cancelled'
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/bookings/checkin', methods=['POST'])
@api_login_required
def checkin_booking():
    """Use a booking reference to park the vehicle immediately."""
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import BookingModel
    from datetime import datetime

    booking_ref = request.json.get('booking_ref', '').strip().upper()
    booking = BookingModel.query.filter_by(
        booking_ref=booking_ref, status='active'
    ).first()

    if not booking:
        return jsonify({'success': False, 'message': 'Booking not found or already used'})

    if booking.expires_at < datetime.utcnow():
        booking.status = 'expired'
        db.session.commit()
        return jsonify({'success': False, 'message': 'Booking has expired'})

    # Park the vehicle
    vehicle = Vehicle(booking.number_plate, booking.vehicle_type)
    result  = parking_lot.park_vehicle(vehicle)
    booking.status  = 'used'
    booking.slot_id = result.get('slot')
    db.session.commit()
    save_data(parking_lot)

    return jsonify({
        'success':      True,
        'queued':       result.get('queued', False),
        'slot':         result.get('slot'),
        'ticket_id':    vehicle.ticket_id,
        'qr_data':      vehicle.qr_data,
        'number_plate': vehicle.number_plate,
        'entry_time':   vehicle.entry_time.strftime('%H:%M:%S'),
        'nearly_full':  result.get('nearly_full', False),
        'manual_slot':  False
    })

# ─────────────────────────────────────────────
# API: ADMIN — OPERATOR MANAGEMENT
# ─────────────────────────────────────────────

@app.route('/api/admin/operators', methods=['GET'])
@api_login_required
def get_operators():
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    if not current_user.is_admin:
        return jsonify({'success': False, 'message': 'Admin access required'}), 403
    operators = UserModel.query.filter_by(role='operator').all()
    return jsonify({'success': True, 'operators': [o.to_dict() for o in operators]})

@app.route('/api/admin/operators', methods=['POST'])
@api_login_required
def create_operator():
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    if not current_user.is_admin:
        return jsonify({'success': False, 'message': 'Admin access required'}), 403
    data     = request.json
    email    = data.get('email', '').strip().lower()
    name     = data.get('name', '').strip()
    password = data.get('password', '').strip()
    lot_id   = data.get('lot_id')
    if not email or not name or not password:
        return jsonify({'success': False, 'message': 'Email, name and password are required'})
    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters'})
    existing = UserModel.query.filter_by(email=email).first()
    if existing:
        return jsonify({'success': False, 'message': 'Email already in use'})
    user = UserModel(email=email, name=name, role='operator', lot_id=lot_id)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify({'success': True, 'operator': user.to_dict()})

@app.route('/api/admin/operators/<int:op_id>', methods=['DELETE'])
@api_login_required
def delete_operator(op_id):
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    if not current_user.is_admin:
        return jsonify({'success': False, 'message': 'Admin access required'}), 403
    user = UserModel.query.get(op_id)
    if not user:
        return jsonify({'success': False, 'message': 'Operator not found'})
    user.active = False
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/admin/lots', methods=['GET'])
@api_login_required
def get_lots():
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    if not current_user.is_admin:
        return jsonify({'success': False, 'message': 'Admin access required'}), 403
    lots = ParkingLotModel.query.all()
    return jsonify({'success': True, 'lots': [l.to_dict() for l in lots]})

@app.route('/api/admin/summary', methods=['GET'])
@api_login_required
def admin_summary():
    if not USE_DB:
        return jsonify({'success': False})
    if not current_user.is_admin:
        return jsonify({'success': False, 'message': 'Admin access required'}), 403
    from models.db import ParkingLotModel, HistoryModel
    lots        = ParkingLotModel.query.all()
    total_rev   = sum(l.revenue for l in lots)
    total_exits = HistoryModel.query.count()
    operators   = UserModel.query.filter_by(role='operator', active=True).count()
    return jsonify({
        'success':      True,
        'total_lots':   len(lots),
        'total_revenue':total_rev,
        'total_exits':  total_exits,
        'total_operators': operators,
    })


# ─────────────────────────────────────────────
# LOW #3 — VEHICLE HISTORY SEARCH
# ─────────────────────────────────────────────

@app.route('/api/vehicle-history/<plate>')
@api_login_required
def vehicle_history(plate):
    plate = sanitize_plate(plate)
    if not plate:
        return jsonify({'success': False, 'message': 'Invalid plate'})

    records = []
    if USE_DB:
        from models.db import HistoryModel
        rows = HistoryModel.query.filter_by(
            number_plate=plate, lot_id=1
        ).order_by(HistoryModel.exit_time.desc()).limit(100).all()
        records = [r.to_dict() for r in rows]
    elif parking_lot:
        records = [h for h in reversed(parking_lot.history)
                   if h['number_plate'] == plate]

    total_fee  = sum(r['fee'] for r in records)
    total_min  = sum(r['duration_min'] for r in records)
    return jsonify({
        'success':    True,
        'plate':      plate,
        'records':    records,
        'total_visits': len(records),
        'total_fee':  round(total_fee, 2),
        'total_hours': round(total_min / 60, 1),
        'last_visit': records[0]['exit_time'] if records else None,
    })


# ─────────────────────────────────────────────
# LOW #4 + #5 — PDF EXPORT (Analytics + Monthly)
# ─────────────────────────────────────────────

@app.route('/api/reports/analytics-pdf')
@api_login_required
def analytics_pdf():
    if not parking_lot:
        return jsonify({'success': False, 'message': 'No parking lot configured'})
    from core.reports import generate_analytics_pdf
    lot_name = 'Smart Parking'
    if USE_DB:
        from models.db import ParkingLotModel
        lot = ParkingLotModel.query.get(1)
        if lot: lot_name = lot.name
    analytics = parking_lot.get_analytics()
    pdf_bytes  = generate_analytics_pdf(analytics, lot_name)
    if not pdf_bytes:
        return jsonify({'success': False, 'message': 'reportlab not installed. Run: pip install reportlab'})
    from flask import Response
    return Response(pdf_bytes, mimetype='application/pdf',
                    headers={'Content-Disposition': f'attachment; filename=analytics_{datetime.now().strftime("%Y%m%d")}.pdf'})

@app.route('/api/reports/monthly')
@api_login_required
def monthly_report():
    if not parking_lot:
        return jsonify({'success': False, 'message': 'No parking lot configured'})
    from core.reports import generate_monthly_report
    month    = request.args.get('month', datetime.now().strftime('%Y-%m'))
    lot_name = 'Smart Parking'
    if USE_DB:
        from models.db import ParkingLotModel
        lot = ParkingLotModel.query.get(1)
        if lot: lot_name = lot.name
    history   = parking_lot.history
    pdf_bytes = generate_monthly_report(history, lot_name, month)
    if not pdf_bytes:
        return jsonify({'success': False, 'message': 'reportlab not installed. Run: pip install reportlab'})
    from flask import Response
    return Response(pdf_bytes, mimetype='application/pdf',
                    headers={'Content-Disposition': f'attachment; filename=report_{month}.pdf'})


# ─────────────────────────────────────────────
# LOW #6 — OPERATOR SHIFT TRACKING
# ─────────────────────────────────────────────

@app.route('/api/shifts/start', methods=['POST'])
@api_login_required
def shift_start():
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import OperatorShift
    # End any active shift for this operator first
    active = OperatorShift.query.filter_by(
        operator_id=current_user.id, status='active'
    ).first()
    if active:
        return jsonify({'success': False, 'message': 'Shift already active. End it first.'})
    shift = OperatorShift(lot_id=1, operator_id=current_user.id)
    db.session.add(shift)
    db.session.commit()
    return jsonify({'success': True, 'shift': shift.to_dict()})

@app.route('/api/shifts/end', methods=['POST'])
@api_login_required
def shift_end():
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import OperatorShift, HistoryModel
    shift = OperatorShift.query.filter_by(
        operator_id=current_user.id, status='active'
    ).first()
    if not shift:
        return jsonify({'success': False, 'message': 'No active shift found'})
    shift.end_time = datetime.now()
    shift.status   = 'ended'
    # Count exits and revenue during this shift
    exits = HistoryModel.query.filter(
        HistoryModel.lot_id == 1,
        HistoryModel.exit_time >= shift.start_time,
        HistoryModel.exit_time <= shift.end_time
    ).all()
    shift.exits_processed   = len(exits)
    shift.revenue_collected = sum(e.fee for e in exits)
    db.session.commit()
    return jsonify({'success': True, 'shift': shift.to_dict()})

@app.route('/api/shifts')
@api_login_required
def get_shifts():
    if not USE_DB:
        return jsonify({'success': True, 'shifts': [], 'active': None})
    from models.db import OperatorShift
    active = OperatorShift.query.filter_by(
        operator_id=current_user.id, status='active'
    ).first()
    recent = OperatorShift.query.filter_by(lot_id=1).order_by(
        OperatorShift.start_time.desc()
    ).limit(20).all()
    return jsonify({
        'success': True,
        'active':  active.to_dict() if active else None,
        'shifts':  [s.to_dict() for s in recent]
    })


# ─────────────────────────────────────────────
# LOW #7 — FASTTAG REGISTRY
# ─────────────────────────────────────────────

@app.route('/api/fasttag/register', methods=['POST'])
@api_login_required
def fasttag_register():
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import FasTagRegistry
    data         = request.json
    fasttag_id   = sanitize_string(data.get('fasttag_id', ''), 32).upper().strip()
    number_plate = sanitize_plate(data.get('number_plate', ''))
    vehicle_type = sanitize_string(data.get('vehicle_type', 'car'), 16).lower()
    owner_name   = sanitize_string(data.get('owner_name', ''), 80)
    owner_phone  = sanitize_string(data.get('owner_phone', ''), 16)

    if not fasttag_id or not number_plate:
        return jsonify({'success': False, 'message': 'FASTag ID and plate are required'})

    existing = FasTagRegistry.query.filter_by(lot_id=1, fasttag_id=fasttag_id).first()
    if existing:
        existing.number_plate = number_plate
        existing.vehicle_type = vehicle_type
        existing.owner_name   = owner_name
        existing.owner_phone  = owner_phone
        db.session.commit()
        return jsonify({'success': True, 'updated': True, 'entry': existing.to_dict()})

    entry = FasTagRegistry(
        lot_id=1, fasttag_id=fasttag_id, number_plate=number_plate,
        vehicle_type=vehicle_type, owner_name=owner_name, owner_phone=owner_phone
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify({'success': True, 'entry': entry.to_dict()})

@app.route('/api/fasttag/<fasttag_id>')
@api_login_required
def fasttag_lookup(fasttag_id):
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import FasTagRegistry
    fasttag_id = sanitize_string(fasttag_id, 32).upper().strip()
    entry = FasTagRegistry.query.filter_by(lot_id=1, fasttag_id=fasttag_id).first()
    if not entry:
        return jsonify({'success': False, 'message': 'FASTag not registered'})
    return jsonify({'success': True, 'entry': entry.to_dict()})

@app.route('/api/fasttag', methods=['GET'])
@api_login_required
def fasttag_list():
    if not USE_DB:
        return jsonify({'success': True, 'entries': []})
    from models.db import FasTagRegistry
    entries = FasTagRegistry.query.filter_by(lot_id=1).order_by(
        FasTagRegistry.created_at.desc()
    ).all()
    return jsonify({'success': True, 'entries': [e.to_dict() for e in entries]})


# ─────────────────────────────────────────────
# LOW #9 — CUSTOM RATES PER VEHICLE TYPE
# ─────────────────────────────────────────────

@app.route('/api/custom-rates', methods=['GET'])
@api_login_required
def get_custom_rates():
    if not USE_DB:
        return jsonify({'success': True, 'rates': billing.get_rate_info()})
    from models.db import CustomRate
    custom = CustomRate.query.filter_by(lot_id=1).all()
    rates  = billing.get_rate_info().copy()
    for c in custom:
        rates[c.vehicle_type] = c.rate_per_hour
    return jsonify({'success': True, 'rates': rates})

@app.route('/api/custom-rates', methods=['POST'])
@api_login_required
def set_custom_rate():
    if not USE_DB:
        return jsonify({'success': False, 'message': 'DB not enabled'})
    from models.db import CustomRate
    data         = request.json
    vehicle_type = sanitize_string(data.get('vehicle_type', ''), 16).lower()
    rate         = float(data.get('rate_per_hour', 0))

    if vehicle_type not in ['car', 'bike', 'truck']:
        return jsonify({'success': False, 'message': 'Invalid vehicle type'})
    if rate <= 0 or rate > 9999:
        return jsonify({'success': False, 'message': 'Rate must be between 1 and 9999'})

    existing = CustomRate.query.filter_by(lot_id=1, vehicle_type=vehicle_type).first()
    if existing:
        existing.rate_per_hour = rate
    else:
        existing = CustomRate(lot_id=1, vehicle_type=vehicle_type, rate_per_hour=rate)
        db.session.add(existing)
    db.session.commit()

    # Update billing object live
    billing.RATE_PER_HOUR[vehicle_type] = rate
    return jsonify({'success': True, 'rate': existing.to_dict()})


# ─────────────────────────────────────────────
# LOW #12 — PUBLIC AVAILABILITY API (no auth)
# ─────────────────────────────────────────────

@app.route('/api/public/lots')
def public_lots():
    """Public feed — no authentication required. For smart city, display boards."""
    if not parking_lot:
        return jsonify({'lots': []})
    stats    = parking_lot.get_stats()
    lot_name = 'Smart Parking'
    if USE_DB:
        from models.db import ParkingLotModel
        lot = ParkingLotModel.query.get(1)
        if lot: lot_name = lot.name
    return jsonify({
        'lots': [{
            'id':            1,
            'name':          lot_name,
            'capacity':      stats['capacity'],
            'occupied':      stats['occupied'],
            'available':     stats['empty'],
            'occupancy_pct': stats['occupancy_pct'],
            'queue_length':  stats['queue_length'],
            'updated_at':    datetime.now().isoformat(),
        }]
    })


# ─────────────────────────────────────────────
# LOW #13 — THEME PREFERENCE (dark mode persist)
# ─────────────────────────────────────────────

@app.route('/api/preferences', methods=['GET'])
@api_login_required
def get_preferences():
    if not USE_DB:
        return jsonify({'success': True, 'theme': 'dark'})
    from models.db import UserPreference
    pref = UserPreference.query.filter_by(user_id=current_user.id).first()
    return jsonify({'success': True, 'theme': pref.theme if pref else 'dark'})

@app.route('/api/preferences', methods=['POST'])
@api_login_required
def set_preferences():
    if not USE_DB:
        return jsonify({'success': True})
    from models.db import UserPreference
    theme = request.json.get('theme', 'dark')
    if theme not in ('dark', 'light'):
        return jsonify({'success': False, 'message': 'Invalid theme'})
    pref = UserPreference.query.filter_by(user_id=current_user.id).first()
    if not pref:
        pref = UserPreference(user_id=current_user.id, theme=theme)
        db.session.add(pref)
    else:
        pref.theme = theme
    db.session.commit()
    return jsonify({'success': True, 'theme': theme})

# ─────────────────────────────────────────────
# BOOTSTRAP ON MODULE LOAD (for gunicorn)
# ─────────────────────────────────────────────
with app.app_context():
    bootstrap()

# ─────────────────────────────────────────────
# ENTRY POINT (local dev only)
# ─────────────────────────────────────────────
if __name__ == '__main__':
    port  = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV', 'production') != 'production'
    print(f'Smart Parking System running at → http://localhost:{port}')
    app.run(debug=debug, host='0.0.0.0', port=port)