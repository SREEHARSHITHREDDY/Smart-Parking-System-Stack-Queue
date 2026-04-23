"""
storage/db_handler.py — SQLAlchemy-based save/load
v3.0 — Day 19 fix: flush before vehicle insert so slot.id is available
"""

from datetime import datetime
from models.db import (
    db, ParkingLotModel, SlotModel,
    VehicleModel, QueueModel, HistoryModel
)


def save_data(parking_lot, lot_db_id=1):

    # ── 1. Upsert lot record ──────────────────
    lot = ParkingLotModel.query.get(lot_db_id)
    if not lot:
        lot = ParkingLotModel(id=lot_db_id)
        db.session.add(lot)

    lot.row_config   = parking_lot.row_config
    lot.floor_config = parking_lot.floor_config
    lot.multi_floor  = parking_lot.multi_floor
    lot.revenue      = parking_lot.revenue

    # ── 2. Sync slots ─────────────────────────
    existing_slots = {
        s.slot_id: s
        for s in SlotModel.query.filter_by(lot_id=lot_db_id).all()
    }

    for slot_id, info in parking_lot.layout.items():
        slot_row = existing_slots.get(slot_id)
        if not slot_row:
            slot_row = SlotModel(lot_id=lot_db_id, slot_id=slot_id)
            db.session.add(slot_row)
            # ── FLUSH so slot_row.id is assigned before vehicle insert ──
            db.session.flush()

        slot_row.floor_name = info.get('floor')
        slot_row.status     = info['status']

        pos = info.get('position')
        slot_row.pos_x = pos['x'] if pos else None
        slot_row.pos_y = pos['y'] if pos else None

        # ── Vehicle ───────────────────────────
        v = info.get('vehicle')
        if v and info['status'] == 'occupied':
            if not slot_row.vehicle:
                vehicle_row = VehicleModel(slot_db_id=slot_row.id)
                db.session.add(vehicle_row)
            else:
                vehicle_row = slot_row.vehicle

            vehicle_row.number_plate = v.number_plate
            vehicle_row.vehicle_type = v.vehicle_type
            vehicle_row.ticket_id    = v.ticket_id
            vehicle_row.qr_data      = v.qr_data
            vehicle_row.entry_time   = v.entry_time
        else:
            if slot_row.vehicle:
                db.session.delete(slot_row.vehicle)

    # ── 3. Sync queue ─────────────────────────
    QueueModel.query.filter_by(lot_id=lot_db_id).delete()
    for pos, v in enumerate(parking_lot.queue, start=1):
        q = QueueModel(
            lot_id       = lot_db_id,
            number_plate = v.number_plate,
            vehicle_type = v.vehicle_type,
            ticket_id    = v.ticket_id,
            qr_data      = getattr(v, 'qr_data', v.ticket_id),
            entry_time   = v.entry_time,
            position     = pos
        )
        db.session.add(q)

    # ── 4. Sync history (append-only) ─────────
    existing_tickets = {
        h.ticket_id
        for h in HistoryModel.query.filter_by(lot_id=lot_db_id)
                                    .with_entities(HistoryModel.ticket_id).all()
    }
    for record in parking_lot.history:
        if record['ticket_id'] not in existing_tickets:
            h = HistoryModel(
                lot_id       = lot_db_id,
                ticket_id    = record['ticket_id'],
                number_plate = record['number_plate'],
                vehicle_type = record['vehicle_type'],
                slot_id      = record['slot'],
                entry_time   = datetime.fromisoformat(record['entry_time']),
                exit_time    = datetime.fromisoformat(record['exit_time']),
                duration_min = record['duration_min'],
                fee          = record['fee'],
            )
            db.session.add(h)

    db.session.commit()


def load_data(lot_db_id=1):

    lot = ParkingLotModel.query.get(lot_db_id)
    if not lot:
        return None

    layout = {}
    for slot_row in lot.slots:
        vehicle_dict = slot_row.vehicle.to_dict() if slot_row.vehicle else None
        layout[slot_row.slot_id] = {
            'status':   slot_row.status,
            'vehicle':  vehicle_dict,
            'floor':    slot_row.floor_name,
            'position': {'x': slot_row.pos_x, 'y': slot_row.pos_y}
                        if slot_row.pos_x is not None else None,
        }

    queue = [
        q.to_dict()
        for q in QueueModel.query.filter_by(lot_id=lot_db_id)
                                  .order_by(QueueModel.position).all()
    ]

    history = [
        h.to_dict()
        for h in HistoryModel.query.filter_by(lot_id=lot_db_id)
                                    .order_by(HistoryModel.exit_time).all()
    ]

    revenue_by_type = {'car': 0.0, 'bike': 0.0, 'truck': 0.0}
    for h in history:
        vtype = h['vehicle_type'].lower()
        if vtype in revenue_by_type:
            revenue_by_type[vtype] += h['fee']

    return {
        'row_config':      lot.row_config,
        'floor_config':    lot.floor_config,
        'multi_floor':     lot.multi_floor,
        'revenue':         lot.revenue,
        'revenue_by_type': revenue_by_type,
        'layout':          layout,
        'queue':           queue,
        'history':         history,
    }