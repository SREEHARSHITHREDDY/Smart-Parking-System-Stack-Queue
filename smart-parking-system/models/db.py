"""
models/db.py — SQLAlchemy database setup + all models
v3.0 Day 24 — added DynamicRateRule model
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


def init_db(app):
    db.init_app(app)
    with app.app_context():
        db.create_all()


# ─────────────────────────────────────────────
# PARKING LOT
# ─────────────────────────────────────────────

class ParkingLotModel(db.Model):
    __tablename__ = 'parking_lots'

    id           = db.Column(db.Integer, primary_key=True)
    name         = db.Column(db.String(120), nullable=False, default='Main Lot')
    row_config   = db.Column(db.JSON, nullable=True)
    floor_config = db.Column(db.JSON, nullable=True)
    multi_floor  = db.Column(db.Boolean, default=False)
    revenue      = db.Column(db.Float,   default=0.0)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)

    slots    = db.relationship('SlotModel',    backref='lot', lazy=True, cascade='all, delete-orphan')
    history  = db.relationship('HistoryModel', backref='lot', lazy=True, cascade='all, delete-orphan')
    rules    = db.relationship('DynamicRateRule', backref='lot', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id':           self.id,
            'name':         self.name,
            'row_config':   self.row_config,
            'floor_config': self.floor_config,
            'multi_floor':  self.multi_floor,
            'revenue':      self.revenue,
        }


# ─────────────────────────────────────────────
# SLOT
# ─────────────────────────────────────────────

class SlotModel(db.Model):
    __tablename__ = 'slots'

    id         = db.Column(db.Integer, primary_key=True)
    lot_id     = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    slot_id    = db.Column(db.String(32), nullable=False)
    floor_name = db.Column(db.String(64), nullable=True)
    status     = db.Column(db.String(16), default='empty')
    pos_x      = db.Column(db.Float, nullable=True)
    pos_y      = db.Column(db.Float, nullable=True)

    vehicle = db.relationship('VehicleModel', backref='slot',
                              uselist=False, cascade='all, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('lot_id', 'slot_id', name='uq_lot_slot'),
    )

    def to_dict(self):
        return {
            'slot_id':  self.slot_id,
            'floor':    self.floor_name,
            'status':   self.status,
            'position': {'x': self.pos_x, 'y': self.pos_y} if self.pos_x is not None else None,
            'vehicle':  self.vehicle.to_dict() if self.vehicle else None,
        }


# ─────────────────────────────────────────────
# VEHICLE
# ─────────────────────────────────────────────

class VehicleModel(db.Model):
    __tablename__ = 'vehicles'

    id           = db.Column(db.Integer, primary_key=True)
    slot_db_id   = db.Column(db.Integer, db.ForeignKey('slots.id'), nullable=False)
    number_plate = db.Column(db.String(16), nullable=False)
    vehicle_type = db.Column(db.String(16), nullable=False, default='car')
    ticket_id    = db.Column(db.String(8),  nullable=False, unique=True)
    qr_data      = db.Column(db.String(8),  nullable=True)
    entry_time   = db.Column(db.DateTime,   default=datetime.utcnow)

    def to_dict(self):
        return {
            'number_plate': self.number_plate,
            'vehicle_type': self.vehicle_type,
            'ticket_id':    self.ticket_id,
            'qr_data':      self.qr_data,
            'entry_time':   self.entry_time.isoformat(),
        }


# ─────────────────────────────────────────────
# QUEUE
# ─────────────────────────────────────────────

class QueueModel(db.Model):
    __tablename__ = 'queue'

    id           = db.Column(db.Integer, primary_key=True)
    lot_id       = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    number_plate = db.Column(db.String(16), nullable=False)
    vehicle_type = db.Column(db.String(16), nullable=False, default='car')
    ticket_id    = db.Column(db.String(8),  nullable=False)
    qr_data      = db.Column(db.String(8),  nullable=True)
    entry_time   = db.Column(db.DateTime,   default=datetime.utcnow)
    position     = db.Column(db.Integer,    nullable=False)

    def to_dict(self):
        return {
            'number_plate': self.number_plate,
            'vehicle_type': self.vehicle_type,
            'ticket_id':    self.ticket_id,
            'qr_data':      self.qr_data,
            'entry_time':   self.entry_time.isoformat(),
        }


# ─────────────────────────────────────────────
# HISTORY
# ─────────────────────────────────────────────

class HistoryModel(db.Model):
    __tablename__ = 'history'

    id             = db.Column(db.Integer, primary_key=True)
    lot_id         = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    ticket_id      = db.Column(db.String(8),  nullable=False)
    number_plate   = db.Column(db.String(16), nullable=False)
    vehicle_type   = db.Column(db.String(16), nullable=False)
    slot_id        = db.Column(db.String(32), nullable=False)
    entry_time     = db.Column(db.DateTime,   nullable=False)
    exit_time      = db.Column(db.DateTime,   nullable=False)
    duration_min   = db.Column(db.Float,      nullable=False)
    fee            = db.Column(db.Float,      nullable=False)
    base_rate      = db.Column(db.Float,      nullable=True)
    multiplier     = db.Column(db.Float,      nullable=True, default=1.0)
    surge_name     = db.Column(db.String(64), nullable=True)

    def to_dict(self):
        return {
            'ticket_id':    self.ticket_id,
            'number_plate': self.number_plate,
            'vehicle_type': self.vehicle_type,
            'slot':         self.slot_id,
            'entry_time':   self.entry_time.isoformat(),
            'exit_time':    self.exit_time.isoformat(),
            'duration_min': self.duration_min,
            'fee':          self.fee,
            'multiplier':   self.multiplier or 1.0,
            'surge_name':   self.surge_name or '',
        }


# ─────────────────────────────────────────────
# DYNAMIC RATE RULE  (Day 24 — new)
# ─────────────────────────────────────────────

class DynamicRateRule(db.Model):
    __tablename__ = 'dynamic_rate_rules'

    id          = db.Column(db.Integer, primary_key=True)
    lot_id      = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    name        = db.Column(db.String(64),  nullable=False)   # e.g. "Morning Rush"
    hour_start  = db.Column(db.Integer,     nullable=False)   # 0-23
    hour_end    = db.Column(db.Integer,     nullable=False)   # 0-23
    day_of_week = db.Column(db.Integer,     nullable=True)    # 0=Mon,6=Sun, None=all days
    multiplier  = db.Column(db.Float,       nullable=False, default=1.5)
    active      = db.Column(db.Boolean,     default=True)
    created_at  = db.Column(db.DateTime,    default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':          self.id,
            'lot_id':      self.lot_id,
            'name':        self.name,
            'hour_start':  self.hour_start,
            'hour_end':    self.hour_end,
            'day_of_week': self.day_of_week,
            'multiplier':  self.multiplier,
            'active':      self.active,
        }

    def is_active_now(self):
        """Check if this rule applies at the current moment."""
        from datetime import datetime
        now = datetime.now()
        hour = now.hour
        weekday = now.weekday()  # 0=Monday, 6=Sunday

        if not self.active:
            return False
        if self.day_of_week is not None and self.day_of_week != weekday:
            return False
        return self.hour_start <= hour < self.hour_end


def get_active_rule(lot_id):
    """Return the first active surge rule for a lot at the current time."""
    rules = DynamicRateRule.query.filter_by(lot_id=lot_id, active=True).all()
    for rule in rules:
        if rule.is_active_now():
            return rule
    return None


def seed_default_rules(lot_id):
    """Create default Morning Rush and Evening Peak rules for a new lot."""
    existing = DynamicRateRule.query.filter_by(lot_id=lot_id).count()
    if existing > 0:
        return
    rules = [
        DynamicRateRule(lot_id=lot_id, name='Morning Rush',  hour_start=9,  hour_end=11, multiplier=1.5),
        DynamicRateRule(lot_id=lot_id, name='Evening Peak',  hour_start=17, hour_end=20, multiplier=1.5),
    ]
    for r in rules:
        db.session.add(r)
    db.session.commit()


# ─────────────────────────────────────────────
# BOOKING (pre-book a slot in advance)
# ─────────────────────────────────────────────

class BookingModel(db.Model):
    __tablename__ = 'bookings'

    id            = db.Column(db.Integer, primary_key=True)
    lot_id        = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    number_plate  = db.Column(db.String(16), nullable=False)
    vehicle_type  = db.Column(db.String(16), nullable=False, default='car')
    booking_ref   = db.Column(db.String(8),  nullable=False, unique=True)
    slot_id       = db.Column(db.String(32), nullable=True)   # assigned slot (optional)
    booked_for    = db.Column(db.DateTime,   nullable=False)  # when they plan to arrive
    expires_at    = db.Column(db.DateTime,   nullable=False)  # auto-cancel after this
    status        = db.Column(db.String(16), default='active')  # active | used | cancelled | expired
    created_at    = db.Column(db.DateTime,   default=datetime.utcnow)
    phone         = db.Column(db.String(16), nullable=True)   # for WhatsApp receipt later

    def to_dict(self):
        return {
            'id':           self.id,
            'lot_id':       self.lot_id,
            'number_plate': self.number_plate,
            'vehicle_type': self.vehicle_type,
            'booking_ref':  self.booking_ref,
            'slot_id':      self.slot_id,
            'booked_for':   self.booked_for.isoformat(),
            'expires_at':   self.expires_at.isoformat(),
            'status':       self.status,
            'phone':        self.phone,
            'created_at':   self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────
# EV CHARGING SESSION  (Day 31)
# ─────────────────────────────────────────────

class EVChargingSession(db.Model):
    __tablename__ = 'ev_charging_sessions'

    id            = db.Column(db.Integer, primary_key=True)
    lot_id        = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    slot_id       = db.Column(db.String(32), nullable=False)
    ticket_id     = db.Column(db.String(8),  nullable=False)
    number_plate  = db.Column(db.String(16), nullable=False)
    kwh_rate      = db.Column(db.Float, nullable=False, default=12.0)  # ₹ per kWh
    kwh_delivered = db.Column(db.Float, nullable=True)                  # filled at exit
    charging_fee  = db.Column(db.Float, nullable=True)
    start_time    = db.Column(db.DateTime, default=datetime.utcnow)
    end_time      = db.Column(db.DateTime, nullable=True)
    status        = db.Column(db.String(16), default='charging')        # charging | completed

    def to_dict(self):
        return {
            'id':            self.id,
            'slot_id':       self.slot_id,
            'ticket_id':     self.ticket_id,
            'number_plate':  self.number_plate,
            'kwh_rate':      self.kwh_rate,
            'kwh_delivered': self.kwh_delivered,
            'charging_fee':  self.charging_fee,
            'start_time':    self.start_time.isoformat(),
            'end_time':      self.end_time.isoformat() if self.end_time else None,
            'status':        self.status,
        }