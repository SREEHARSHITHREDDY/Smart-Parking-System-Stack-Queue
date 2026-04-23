"""
models/db.py — SQLAlchemy database setup + all models
Day 18: Smart Parking System v3.0
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import uuid

db = SQLAlchemy()


def init_db(app):
    """Call this from app.py after configuring DATABASE_URL."""
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
    row_config   = db.Column(db.JSON, nullable=True)   # [4, 6, 3]
    floor_config = db.Column(db.JSON, nullable=True)   # [{name, rows}]
    multi_floor  = db.Column(db.Boolean, default=False)
    revenue      = db.Column(db.Float,   default=0.0)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    slots    = db.relationship('SlotModel',    backref='lot', lazy=True, cascade='all, delete-orphan')
    history  = db.relationship('HistoryModel', backref='lot', lazy=True, cascade='all, delete-orphan')

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
    slot_id    = db.Column(db.String(32),  nullable=False)   # e.g. 'A1' or 'Ground-A1'
    floor_name = db.Column(db.String(64),  nullable=True)    # None for single-floor
    status     = db.Column(db.String(16),  default='empty')  # 'empty' | 'occupied'
    pos_x      = db.Column(db.Float, nullable=True)          # Blueprint drag x%
    pos_y      = db.Column(db.Float, nullable=True)          # Blueprint drag y%

    # Currently parked vehicle (nullable — empty when slot is free)
    vehicle = db.relationship('VehicleModel', backref='slot',
                              uselist=False, cascade='all, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('lot_id', 'slot_id', name='uq_lot_slot'),
    )

    def to_dict(self):
        return {
            'slot_id':    self.slot_id,
            'floor':      self.floor_name,
            'status':     self.status,
            'position':   {'x': self.pos_x, 'y': self.pos_y} if self.pos_x is not None else None,
            'vehicle':    self.vehicle.to_dict() if self.vehicle else None,
        }


# ─────────────────────────────────────────────
# VEHICLE (currently parked)
# ─────────────────────────────────────────────

class VehicleModel(db.Model):
    __tablename__ = 'vehicles'

    id           = db.Column(db.Integer, primary_key=True)
    slot_db_id   = db.Column(db.Integer, db.ForeignKey('slots.id'), nullable=False)
    number_plate = db.Column(db.String(16),  nullable=False)
    vehicle_type = db.Column(db.String(16),  nullable=False, default='car')
    ticket_id    = db.Column(db.String(8),   nullable=False, unique=True)
    qr_data      = db.Column(db.String(8),   nullable=True)
    entry_time   = db.Column(db.DateTime,    default=datetime.utcnow)

    def to_dict(self):
        return {
            'number_plate': self.number_plate,
            'vehicle_type': self.vehicle_type,
            'ticket_id':    self.ticket_id,
            'qr_data':      self.qr_data,
            'entry_time':   self.entry_time.isoformat(),
        }


# ─────────────────────────────────────────────
# QUEUE (waiting vehicles)
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
    position     = db.Column(db.Integer,    nullable=False)  # queue position 1, 2, 3...

    def to_dict(self):
        return {
            'number_plate': self.number_plate,
            'vehicle_type': self.vehicle_type,
            'ticket_id':    self.ticket_id,
            'qr_data':      self.qr_data,
            'entry_time':   self.entry_time.isoformat(),
        }


# ─────────────────────────────────────────────
# HISTORY (completed exits)
# ─────────────────────────────────────────────

class HistoryModel(db.Model):
    __tablename__ = 'history'

    id           = db.Column(db.Integer, primary_key=True)
    lot_id       = db.Column(db.Integer, db.ForeignKey('parking_lots.id'), nullable=False)
    ticket_id    = db.Column(db.String(8),   nullable=False)
    number_plate = db.Column(db.String(16),  nullable=False)
    vehicle_type = db.Column(db.String(16),  nullable=False)
    slot_id      = db.Column(db.String(32),  nullable=False)
    entry_time   = db.Column(db.DateTime,    nullable=False)
    exit_time    = db.Column(db.DateTime,    nullable=False)
    duration_min = db.Column(db.Float,       nullable=False)
    fee          = db.Column(db.Float,       nullable=False)

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
        }