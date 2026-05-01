from datetime import datetime, timedelta
from collections import defaultdict


class ParkingLot:

    def __init__(self, row_config, floor_config=None):
        self.floor_config    = floor_config
        self.stack           = []
        self.queue           = []
        self.revenue         = 0
        self.layout          = {}
        self.history         = []
        self.revenue_by_type = {'car': 0.0, 'bike': 0.0, 'truck': 0.0}

        if floor_config:
            self.row_config  = []
            self.multi_floor = True
            for floor in floor_config:
                self.row_config.extend(floor['rows'])
            self.capacity = sum(self.row_config)
            self._create_multi_floor_blueprint()
        else:
            self.row_config  = row_config
            self.multi_floor = False
            self.capacity    = sum(row_config)
            self._create_blueprint()

    def _create_blueprint(self):
        for r, num_slots in enumerate(self.row_config):
            row_letter = chr(65 + r)
            for c in range(num_slots):
                slot = f'{row_letter}{c + 1}'
                self.layout[slot] = {
                    'status': 'empty', 'vehicle': None,
                    'floor': None, 'position': None
                }

    def _create_multi_floor_blueprint(self):
        for floor in self.floor_config:
            fname = floor['name']
            for r, num_slots in enumerate(floor['rows']):
                row_letter = chr(65 + r)
                for c in range(num_slots):
                    slot = f'{fname}-{row_letter}{c + 1}'
                    self.layout[slot] = {
                        'status': 'empty', 'vehicle': None,
                        'floor': fname, 'position': None
                    }

    def find_empty_slot(self, floor_name=None):
        for slot, info in self.layout.items():
            if info['status'] == 'empty':
                if floor_name is None:
                    return slot
                if info.get('floor') == floor_name:
                    return slot
        return None

    def park_vehicle(self, vehicle, preferred_floor=None):
        slot = self.find_empty_slot(floor_name=preferred_floor)
        if not slot and preferred_floor:
            slot = self.find_empty_slot()
        if not slot:
            self.queue.append(vehicle)
            return {'success': True, 'queued': True, 'queue_position': len(self.queue)}
        self.layout[slot]['status']  = 'occupied'
        self.layout[slot]['vehicle'] = vehicle
        self.stack.append(vehicle)
        nearly_full = len(self.stack) >= 0.8 * self.capacity
        return {'success': True, 'queued': False, 'slot': slot, 'nearly_full': nearly_full}

    def remove_vehicle(self, identifier, billing, lot_id=None):
        vehicle = None
        slot    = None
        for s, info in self.layout.items():
            if info['vehicle']:
                if (info['vehicle'].ticket_id    == identifier or
                        info['vehicle'].number_plate == identifier):
                    vehicle = info['vehicle']
                    slot    = s
                    break
        if not vehicle:
            return {'success': False, 'message': 'Vehicle not found'}

        fee, exit_time, base_rate, multiplier, surge_name = billing.calculate_fee(vehicle, lot_id=lot_id)
        self.revenue += fee
        if vehicle.vehicle_type in self.revenue_by_type:
            self.revenue_by_type[vehicle.vehicle_type] += fee

        self.layout[slot]['status']  = 'empty'
        self.layout[slot]['vehicle'] = None

        temp_stack = []
        while self.stack:
            top = self.stack.pop()
            if top.ticket_id == vehicle.ticket_id:
                break
            temp_stack.append(top)
        while temp_stack:
            self.stack.append(temp_stack.pop())

        queued_vehicle_info = None
        if self.queue:
            queued_vehicle = self.queue.pop(0)
            self.layout[slot]['status']  = 'occupied'
            self.layout[slot]['vehicle'] = queued_vehicle
            self.stack.append(queued_vehicle)
            queued_vehicle_info = {
                'number_plate': queued_vehicle.number_plate,
                'ticket_id':    queued_vehicle.ticket_id,
                'slot':         slot
            }

        duration_min = round((exit_time - vehicle.entry_time).total_seconds() / 60, 1)
        self.history.append({
            'ticket_id':    vehicle.ticket_id,
            'number_plate': vehicle.number_plate,
            'vehicle_type': vehicle.vehicle_type,
            'slot':         slot,
            'entry_time':   vehicle.entry_time.isoformat(),
            'exit_time':    exit_time.isoformat(),
            'duration_min': duration_min,
            'fee':          fee,
            'base_rate':    base_rate,
            'multiplier':   multiplier,
            'surge_name':   surge_name or '',
        })

        return {
            'success':               True,
            'ticket_id':             vehicle.ticket_id,
            'number_plate':          vehicle.number_plate,
            'vehicle_type':          vehicle.vehicle_type,
            'slot':                  slot,
            'fee':                   fee,
            'multiplier':            multiplier,
            'surge_name':            surge_name or '',
            'exit_time':             exit_time.strftime('%H:%M:%S'),
            'entry_time':            vehicle.entry_time.strftime('%H:%M:%S'),
            'queued_vehicle_parked': queued_vehicle_info
        }

    def get_stats(self):
        occupied = sum(1 for s in self.layout.values() if s['status'] == 'occupied')
        empty    = self.capacity - occupied
        return {
            'capacity':      self.capacity,
            'occupied':      occupied,
            'empty':         empty,
            'queue_length':  len(self.queue),
            'occupancy_pct': round((occupied / self.capacity) * 100, 1) if self.capacity > 0 else 0
        }

    def get_floor_stats(self):
        if not self.multi_floor or not self.floor_config:
            return None
        result = []
        for floor in self.floor_config:
            fname    = floor['name']
            slots    = [s for s, i in self.layout.items() if i.get('floor') == fname]
            occupied = sum(1 for s in slots if self.layout[s]['status'] == 'occupied')
            result.append({
                'name': fname, 'capacity': len(slots),
                'occupied': occupied, 'empty': len(slots) - occupied
            })
        return result

    def get_analytics(self):
        if not self.history:
            return {
                'total_today': 0, 'total_all_time': 0,
                'avg_stay_min': 0, 'peak_hour': None,
                'revenue_today': 0, 'revenue_all_time': self.revenue,
                'revenue_by_type': self.revenue_by_type,
                'busiest_day': None, 'avg_daily_revenue': 0,
                'hourly_breakdown': [], 'daily_breakdown': [],
                'type_breakdown': {}, 'surge_revenue': 0,
            }

        today_str        = datetime.now().strftime('%Y-%m-%d')
        today            = [h for h in self.history if h['exit_time'].startswith(today_str)]
        total_all_time   = len(self.history)
        revenue_all_time = sum(h['fee'] for h in self.history)
        total_today      = len(today)
        revenue_today    = sum(h['fee'] for h in today)
        avg_stay         = round(sum(h['duration_min'] for h in today) / total_today, 1) if today else 0

        hour_counts = defaultdict(int)
        for h in self.history:
            try:
                hour_counts[int(h['exit_time'][11:13])] += 1
            except Exception:
                pass
        peak_hour = max(hour_counts, key=hour_counts.get) if hour_counts else None

        seven_days_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        recent = [h for h in self.history if h['exit_time'][:10] >= seven_days_ago]
        hourly = defaultdict(lambda: {'count': 0, 'revenue': 0.0})
        for h in recent:
            try:
                hour = int(h['exit_time'][11:13])
                hourly[hour]['count']   += 1
                hourly[hour]['revenue'] += h['fee']
            except Exception:
                pass
        hourly_breakdown = [
            {'hour': hr, 'count': v['count'], 'revenue': round(v['revenue'], 1)}
            for hr, v in sorted(hourly.items())
        ]

        fourteen_days_ago = (datetime.now() - timedelta(days=14)).strftime('%Y-%m-%d')
        daily = defaultdict(lambda: {'count': 0, 'revenue': 0.0})
        for h in self.history:
            if h['exit_time'][:10] >= fourteen_days_ago:
                day = h['exit_time'][:10]
                daily[day]['count']   += 1
                daily[day]['revenue'] += h['fee']
        daily_breakdown = [
            {'date': d, 'count': v['count'], 'revenue': round(v['revenue'], 1)}
            for d, v in sorted(daily.items())
        ]

        unique_days = len(set(h['exit_time'][:10] for h in self.history))
        avg_daily   = round(revenue_all_time / unique_days, 1) if unique_days > 0 else 0

        day_counts  = defaultdict(int)
        for h in self.history:
            day_counts[h['exit_time'][:10]] += 1
        busiest_day = max(day_counts, key=day_counts.get) if day_counts else None

        type_breakdown = {}
        for vtype in ['car', 'bike', 'truck']:
            records  = [h for h in self.history if h['vehicle_type'] == vtype]
            type_rev = sum(h['fee'] for h in records)
            type_breakdown[vtype] = {
                'count':   len(records),
                'revenue': round(type_rev, 1),
                'pct':     round((type_rev / revenue_all_time * 100), 1) if revenue_all_time > 0 else 0
            }

        surge_revenue = round(sum(
            h['fee'] - (h['fee'] / h.get('multiplier', 1))
            for h in self.history if h.get('multiplier', 1) > 1.0
        ), 1)

        return {
            'total_today':       total_today,
            'total_all_time':    total_all_time,
            'avg_stay_min':      avg_stay,
            'peak_hour':         peak_hour,
            'revenue_today':     round(revenue_today, 1),
            'revenue_all_time':  round(revenue_all_time, 1),
            'revenue_by_type':   self.revenue_by_type,
            'busiest_day':       busiest_day,
            'avg_daily_revenue': avg_daily,
            'hourly_breakdown':  hourly_breakdown,
            'daily_breakdown':   daily_breakdown,
            'type_breakdown':    type_breakdown,
            'surge_revenue':     surge_revenue,
        }