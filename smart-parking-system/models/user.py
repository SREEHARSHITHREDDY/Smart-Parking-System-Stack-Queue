"""
models/user.py — User model for authentication
Day 23: Smart Parking System v3.0
Roles: admin (sees all lots) | operator (sees own lot only)
"""

from models.db import db
from datetime import datetime
import bcrypt


class UserModel(db.Model):
    __tablename__ = 'users'

    id            = db.Column(db.Integer, primary_key=True)
    email         = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    name          = db.Column(db.String(80),  nullable=False, default='Operator')
    role          = db.Column(db.String(16),  nullable=False, default='operator')
    lot_id        = db.Column(db.Integer, nullable=True)   # None = admin sees all
    active        = db.Column(db.Boolean, default=True)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    last_login    = db.Column(db.DateTime, nullable=True)

    # ── Flask-Login required properties ──────
    @property
    def is_authenticated(self):
        return True

    @property
    def is_active(self):
        return self.active

    @property
    def is_anonymous(self):
        return False

    def get_id(self):
        return str(self.id)

    # ── Password helpers ──────────────────────
    def set_password(self, password):
        self.password_hash = bcrypt.hashpw(
            password.encode('utf-8'),
            bcrypt.gensalt()
        ).decode('utf-8')

    def check_password(self, password):
        return bcrypt.checkpw(
            password.encode('utf-8'),
            self.password_hash.encode('utf-8')
        )

    # ── Role helpers ──────────────────────────
    @property
    def is_admin(self):
        return self.role == 'admin'

    @property
    def is_operator(self):
        return self.role == 'operator'

    def to_dict(self):
        return {
            'id':         self.id,
            'email':      self.email,
            'name':       self.name,
            'role':       self.role,
            'lot_id':     self.lot_id,
            'active':     self.active,
            'created_at': self.created_at.isoformat(),
        }


def create_default_admin():
    """
    Creates default admin account on first run.
    Email: admin@smartparking.com
    Password: admin123
    Change immediately after first login.
    """
    existing = UserModel.query.filter_by(email='admin@smartparking.com').first()
    if not existing:
        admin = UserModel(
            email  = 'admin@smartparking.com',
            name   = 'Admin',
            role   = 'admin',
            lot_id = None
        )
        admin.set_password('admin123')
        db.session.add(admin)
        db.session.commit()
        print('✓ Default admin created: admin@smartparking.com / admin123')
    else:
        print('✓ Admin account exists')