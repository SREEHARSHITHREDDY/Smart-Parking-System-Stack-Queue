"""
core/predictor.py — AI Peak Hour Prediction
Day 30: Smart Parking System v3.0

No external ML library needed.
Uses weighted average of historical hourly patterns
to predict occupancy for next 24 hours.
"""

from collections import defaultdict
from datetime import datetime, timedelta


def predict_peak_hours(history):
    """
    Analyse exit history and return predicted
    busy/quiet hours for the next 24 hours.

    Returns a list of 24 dicts — one per hour.
    """

    if not history or len(history) < 5:
        return _empty_prediction()

    # ── 1. Count exits per hour per weekday ───
    # pattern[weekday][hour] = list of exit counts
    pattern = defaultdict(lambda: defaultdict(list))

    # Group history by day
    day_counts = defaultdict(lambda: defaultdict(int))
    for record in history:
        try:
            exit_dt  = datetime.fromisoformat(record['exit_time'])
            weekday  = exit_dt.weekday()   # 0=Mon, 6=Sun
            hour     = exit_dt.hour
            day_key  = exit_dt.strftime('%Y-%m-%d')
            day_counts[day_key][hour] += 1
        except Exception:
            continue

    # Build per-weekday per-hour averages
    weekday_hour_counts = defaultdict(lambda: defaultdict(list))
    for day_key, hours in day_counts.items():
        try:
            dt      = datetime.strptime(day_key, '%Y-%m-%d')
            weekday = dt.weekday()
            for hour, count in hours.items():
                weekday_hour_counts[weekday][hour].append(count)
        except Exception:
            continue

    # ── 2. Predict next 24 hours ──────────────
    now        = datetime.now()
    prediction = []
    max_count  = 1  # avoid division by zero

    for i in range(24):
        future_dt = now + timedelta(hours=i)
        hour      = future_dt.hour
        weekday   = future_dt.weekday()

        # Try exact weekday match first, then any weekday
        counts = weekday_hour_counts[weekday].get(hour, [])
        if not counts:
            # Fallback — average across all weekdays for this hour
            all_counts = []
            for wd in range(7):
                all_counts.extend(weekday_hour_counts[wd].get(hour, []))
            counts = all_counts

        avg = round(sum(counts) / len(counts), 1) if counts else 0
        max_count = max(max_count, avg)

        prediction.append({
            'hour':      hour,
            'datetime':  future_dt.strftime('%Y-%m-%d %H:00'),
            'label':     future_dt.strftime('%a %H:00'),
            'predicted': avg,
            'level':     None,   # filled in below
        })

    # ── 3. Tag each hour as peak / normal / quiet ─
    for p in prediction:
        ratio = p['predicted'] / max_count if max_count > 0 else 0
        if ratio >= 0.7:
            p['level'] = 'peak'
        elif ratio >= 0.35:
            p['level'] = 'normal'
        else:
            p['level'] = 'quiet'

    return prediction


def get_best_time_to_park(prediction):
    """Return the quietest hour in the next 6 hours."""
    next_6 = prediction[:6]
    if not next_6:
        return None
    quietest = min(next_6, key=lambda x: x['predicted'])
    return quietest


def _empty_prediction():
    """Return empty prediction when not enough data."""
    now    = datetime.now()
    result = []
    for i in range(24):
        future_dt = now + timedelta(hours=i)
        result.append({
            'hour':      future_dt.hour,
            'datetime':  future_dt.strftime('%Y-%m-%d %H:00'),
            'label':     future_dt.strftime('%a %H:00'),
            'predicted': 0,
            'level':     'quiet',
        })
    return result