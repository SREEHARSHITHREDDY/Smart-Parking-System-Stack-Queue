"""
models/db.py — SQLAlchemy database setup + all models
Updated: All LOW complexity tasks — added OperatorShift, FasTagRegistry,
         CustomRate, UserPreference models
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
    gst_number   = db.Column(db.String(20), nullable=True)
    address      = db.Column(db.String(200), nullable=True)
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
            'gst_number':   self.gst_number,
            'address':      self.address,
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
    slot_type  = db.Column(db.String(20), nullable=True)   # ev, vip, disabled, compact, standard
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
            'slot_type': self.slot_type,
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
    operator_id    = db.Column(db.Integer,    nullable=True)

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
# DYNAMIC RATE RULE
# ─────────────────────────────────────────────

class DynamicRateRule(db.Model):
    __tablename__ = 'dynamic_rate_rules'

    id          = db.Column(db.Integer, primary_key=True)
    lot_id      = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    name        = db.Column(db.String(64),  nullable=False)
    hour_start  = db.Column(db.Integer,     nullable=False)
    hour_end    = db.Column(db.Integer,     nullable=False)
    day_of_week = db.Column(db.Integer,     nullable=True)
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
        now     = datetime.now()
        hour    = now.hour
        weekday = now.weekday()
        if not self.active:
            return False
        if self.day_of_week is not None and self.day_of_week != weekday:
            return False
        return self.hour_start <= hour < self.hour_end


def get_active_rule(lot_id):
    rules = DynamicRateRule.query.filter_by(lot_id=lot_id, active=True).all()
    for rule in rules:
        if rule.is_active_now():
            return rule
    return None


# ─────────────────────────────────────────────
# BOOKING
# ─────────────────────────────────────────────

class BookingModel(db.Model):
    __tablename__ = 'bookings'

    id            = db.Column(db.Integer, primary_key=True)
    lot_id        = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    number_plate  = db.Column(db.String(16), nullable=False)
    vehicle_type  = db.Column(db.String(16), nullable=False, default='car')
    booking_ref   = db.Column(db.String(8),  nullable=False, unique=True)
    slot_id       = db.Column(db.String(32), nullable=True)
    booked_for    = db.Column(db.DateTime,   nullable=False)
    expires_at    = db.Column(db.DateTime,   nullable=False)
    status        = db.Column(db.String(16), default='active')
    created_at    = db.Column(db.DateTime,   default=datetime.utcnow)
    phone         = db.Column(db.String(16), nullable=True)

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
# EV CHARGING SESSION
# ─────────────────────────────────────────────

class EVChargingSession(db.Model):
    __tablename__ = 'ev_charging_sessions'

    id            = db.Column(db.Integer, primary_key=True)
    lot_id        = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    slot_id       = db.Column(db.String(32), nullable=False)
    ticket_id     = db.Column(db.String(8),  nullable=False)
    number_plate  = db.Column(db.String(16), nullable=False)
    kwh_rate      = db.Column(db.Float, nullable=False, default=12.0)
    kwh_delivered = db.Column(db.Float, nullable=True)
    charging_fee  = db.Column(db.Float, nullable=True)
    start_time    = db.Column(db.DateTime, default=datetime.utcnow)
    end_time      = db.Column(db.DateTime, nullable=True)
    status        = db.Column(db.String(16), default='charging')

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


# ─────────────────────────────────────────────
# SLOT NOTE
# ─────────────────────────────────────────────

class SlotNote(db.Model):
    __tablename__ = 'slot_notes'

    id         = db.Column(db.Integer, primary_key=True)
    lot_id     = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    slot_id    = db.Column(db.String(32), nullable=False)
    note_type  = db.Column(db.String(20), nullable=True)
    note_text  = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('lot_id', 'slot_id', name='uq_slot_note'),
    )

    def to_dict(self):
        return {
            'slot_id':   self.slot_id,
            'note_type': self.note_type,
            'note_text': self.note_text,
        }


# ─────────────────────────────────────────────
# OPERATOR SHIFT  (LOW #6)
# ─────────────────────────────────────────────

class OperatorShift(db.Model):
    __tablename__ = 'operator_shifts'

    id                = db.Column(db.Integer, primary_key=True)
    lot_id            = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    operator_id       = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    start_time        = db.Column(db.DateTime, default=datetime.utcnow)
    end_time          = db.Column(db.DateTime, nullable=True)
    exits_processed   = db.Column(db.Integer,  default=0)
    revenue_collected = db.Column(db.Float,    default=0.0)
    status            = db.Column(db.String(16), default='active')   # active | ended

    def to_dict(self):
        duration_min = None
        if self.end_time:
            duration_min = round((self.end_time - self.start_time).total_seconds() / 60, 1)
        return {
            'id':                self.id,
            'lot_id':            self.lot_id,
            'operator_id':       self.operator_id,
            'start_time':        self.start_time.isoformat(),
            'end_time':          self.end_time.isoformat() if self.end_time else None,
            'exits_processed':   self.exits_processed,
            'revenue_collected': self.revenue_collected,
            'status':            self.status,
            'duration_min':      duration_min,
        }


# ─────────────────────────────────────────────
# FASTTAG REGISTRY  (LOW #7)
# ─────────────────────────────────────────────

class FasTagRegistry(db.Model):
    __tablename__ = 'fasttag_registry'

    id           = db.Column(db.Integer, primary_key=True)
    lot_id       = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    fasttag_id   = db.Column(db.String(32), nullable=False)
    number_plate = db.Column(db.String(16), nullable=False)
    vehicle_type = db.Column(db.String(16), nullable=False, default='car')
    owner_name   = db.Column(db.String(80), nullable=True)
    owner_phone  = db.Column(db.String(16), nullable=True)
    created_at   = db.Column(db.DateTime,  default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('lot_id', 'fasttag_id', name='uq_lot_fasttag'),
    )

    def to_dict(self):
        return {
            'id':           self.id,
            'fasttag_id':   self.fasttag_id,
            'number_plate': self.number_plate,
            'vehicle_type': self.vehicle_type,
            'owner_name':   self.owner_name,
            'owner_phone':  self.owner_phone,
        }


# ─────────────────────────────────────────────
# CUSTOM RATE  (LOW #9)
# ─────────────────────────────────────────────

class CustomRate(db.Model):
    __tablename__ = 'custom_rates'

    id           = db.Column(db.Integer, primary_key=True)
    lot_id       = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    vehicle_type = db.Column(db.String(16), nullable=False)   # car, bike, truck
    rate_per_hour= db.Column(db.Float,      nullable=False)
    updated_at   = db.Column(db.DateTime,   default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('lot_id', 'vehicle_type', name='uq_lot_rate'),
    )

    def to_dict(self):
        return {
            'vehicle_type': self.vehicle_type,
            'rate_per_hour': self.rate_per_hour,
        }


# ─────────────────────────────────────────────
# USER PREFERENCE  (LOW #13 — dark mode persist)
# ─────────────────────────────────────────────

class UserPreference(db.Model):
    __tablename__ = 'user_preferences'

    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    theme      = db.Column(db.String(10), default='dark')   # dark | light
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {'theme': self.theme}