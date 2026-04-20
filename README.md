# Smart Parking System

> A real-time, browser-based parking lot management system with camera OCR, dynamic slot configuration, visual blueprint mapping, and automated billing.

**Author:** C. Sree Harshith Reddy · **Version:** 1.0 · **April 2026**

---

## What It Does

The Smart Parking System replaces manual, paper-based parking management with a fully digital web application. An operator opens a browser, configures the lot layout, and can immediately start processing vehicle entries and exits — with automated slot assignment, real-time occupancy tracking, billing, queue management, and analytics.

Built as a college demonstration project to showcase full-stack development, REST API design, and core computer science data structures (stack, queue, dictionary) in a real, working application.

---

## Features

### Phase 1 — Core System
- **Dynamic lot configuration** — any number of rows with different slot counts per row (e.g. [4, 6, 3, 8])
- **Multi-floor support** — configure up to 10 named floors, each with their own row layout
- **Vehicle entry** — manual plate input with Indian format validation (AA00AA0000)
- **Auto slot assignment** — scans layout dictionary, assigns first available slot (O(n))
- **Manual slot picker** — operator can choose a specific slot from the blueprint
- **Vehicle exit** — lookup by ticket ID or plate number
- **Automated billing** — Car ₹30/hr · Bike ₹15/hr · Truck ₹60/hr · minimum 1 hour · always rounded up with `math.ceil()`
- **Waiting queue** — FIFO queue when lot is full; first queued vehicle auto-parks on every exit
- **Live blueprint** — real-time grid showing every slot's occupancy, updates every 3 seconds
- **Slot click popup** — click any slot to see vehicle details or quick-park
- **Revenue tracking** — running total displayed live
- **JSON persistence** — full state survives Flask restarts with zero data loss
- **Admin reset** — PIN-protected system reset

### Phase 2 — Camera OCR
- **Auto-scanning camera modal** — Tesseract.js v5 scans live video every 1.8 seconds
- **Image preprocessing** — greyscale → Gaussian blur → adaptive threshold → invert fallback
- **All Indian plate formats** — AA00AA0000 (10-char) · AA00A0000 (9-char) · AA00AAA0000 (11-char)
- **Side-by-side layout** — manual entry always visible alongside the camera feed
- **OCR partial suggestion** — shows partial matches so operator can correct and confirm
- **Mobile rear camera** — `facingMode: environment` selects rear camera automatically
- **Manual fallback** — always available, real-time format validation with green/red feedback

### Phase 3 — Blueprint Image
- **Floor plan upload** — drag-and-drop or click to upload PNG/JPG/WEBP/GIF
- **Image mode** — toggle between grid view and map view in the blueprint panel
- **Draggable slot markers** — position each slot marker over the real physical location
- **Mouse and touch drag** — works on desktop and mobile
- **Position persistence** — x%/y% coordinates saved to JSON, restored on restart
- **Live occupancy on markers** — green (empty) / red (occupied) with plate number shown

### Phase 4 — Analytics & Polish
- **Analytics dashboard** — toggle panel showing vehicles today, avg stay, peak hour, total revenue
- **Revenue bar chart** — CSS-only breakdown by Car / Bike / Truck
- **Vehicle history log** — every exit transaction recorded with full details
- **Client-side search** — filter history by plate, ticket ID, or slot — instant results
- **CSV export** — history and revenue summary downloadable as `.csv` files (pure JS, no libraries)
- **PIN modal for reset** — replaces browser `prompt()` with a proper styled modal
- **Mobile polish** — fully usable at 375px viewport width

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend | Python 3.10+ · Flask | REST API, routing, business logic |
| Frontend | HTML5 · CSS3 · Vanilla JS | UI, blueprint rendering, API polling |
| OCR | Tesseract.js v5 (CDN) | In-browser number plate recognition |
| Camera | WebRTC getUserMedia() | Live video feed, desktop and mobile |
| Storage | JSON file | Lightweight persistence, no database needed |
| Fonts | Orbitron · JetBrains Mono | Dark industrial theme typography |
| Version Control | Git · GitHub | 60+ commits across 4 phases |

---

## Data Structures Used

| Structure | File | How It's Used |
|---|---|---|
| **Dictionary** | `parking_lot.py` | `layout = { 'A1': {status, vehicle}, ... }` — O(1) slot lookup by key |
| **Stack (LIFO)** | `parking_lot.py` | `stack = []` — tracks parked vehicles; temp-stack technique for removal |
| **Queue (FIFO)** | `parking_lot.py` | `queue = []` — waiting list; `append` on full, `pop(0)` on exit |
| **Class Objects** | `vehicle.py` | `Vehicle` — stores plate, type, entry time, ticket ID with serialization |
| **UUID** | `vehicle.py` | `str(uuid.uuid4())[:8].upper()` — unique 8-char ticket ID per vehicle |
| **JSON Object** | `file_handler.py` | Entire state serialized to disk on every state change |

---

## Project Structure

```
smart-parking-system/
├── app.py                  Flask server — 11 API routes, bootstrap on startup
├── main.py                 Original CLI version — kept for reference
├── requirements.txt        flask>=2.3.0
│
├── core/
│   ├── parking_lot.py      Slot layout, park/exit/queue/analytics logic
│   ├── billing.py          Fee calculation — rate × ceil(hours), min 1 hour
│   ├── utils.py            Indian plate regex validator + OCR text cleaner
│   └── sensor.py           Sensor simulation (reserved for hardware integration)
│
├── models/
│   └── vehicle.py          Vehicle class with UUID ticket ID and serialization
│
├── storage/
│   └── file_handler.py     JSON save/load — persists entire parking state
│
├── data/
│   └── parking_data.json   Auto-generated — full state including history
│
├── templates/
│   └── index.html          Single-page UI — all modals, panels, blueprint
│
└── static/
    ├── css/style.css        Complete dark theme — 1700+ lines
    ├── js/app.js            All frontend logic — 1700+ lines
    └── uploads/             Blueprint images uploaded by admin
```

---

## API Routes

| Method | Route | Description |
|---|---|---|
| GET | `/api/status` | Full parking state — layout, queue, revenue, stats, blueprint flag |
| POST | `/api/setup` | Create parking lot from row/floor config |
| POST | `/api/park` | Park vehicle or add to queue — returns ticket ID and slot |
| POST | `/api/exit` | Exit vehicle by ticket or plate — returns fee and receipt data |
| POST | `/api/reset` | Wipe all data and reset system |
| POST | `/api/upload-blueprint` | Upload floor plan image (multipart) |
| GET | `/api/blueprint-status` | Check if blueprint image exists |
| POST | `/api/save-slot-positions` | Save dragged slot marker positions |
| GET | `/api/history` | All exit transaction records (newest first) |
| GET | `/api/analytics` | Computed analytics — today's stats, peak hour, revenue breakdown |

---

## Billing

| Vehicle | Rate | Min Charge | Example: 90 min | Example: 3.5 hrs |
|---|---|---|---|---|
| Car | ₹30/hr | ₹30 | ceil(1.5) × 30 = **₹60** | ceil(3.5) × 30 = **₹120** |
| Bike | ₹15/hr | ₹15 | ceil(1.5) × 15 = **₹30** | ceil(3.5) × 15 = **₹60** |
| Truck | ₹60/hr | ₹60 | ceil(1.5) × 60 = **₹120** | ceil(3.5) × 60 = **₹240** |

```python
billable_hours = max(1, math.ceil(duration_seconds / 3600))
fee = billable_hours × RATE_PER_HOUR[vehicle_type]
```

---

## Setup & Run

**Requirements:** Python 3.10+

```bash
# 1. Clone the repository
git clone https://github.com/SREEHARSHITHREDDY/Smart-Parking-System-Stack-Queue.git
cd Smart-Parking-System-Stack-Queue/smart-parking-system

# 2. Install dependency
pip install flask

# 3. Run the server
python app.py

# 4. Open in browser
# http://localhost:5000
```

No database, no additional services, no build step. Flask serves the app and everything runs in the browser.

---

## How to Use

1. **Configure the lot** — set row counts (e.g. 4, 6, 3) or switch to multi-floor mode. Optionally upload a floor plan image.
2. **Park a vehicle** — type the plate or tap 📷 to scan with the camera. Choose auto-assign or pick a specific slot.
3. **View the blueprint** — live grid shows green (available) and red (occupied) slots. Click any slot for details.
4. **Exit a vehicle** — enter the ticket ID or plate. Fee is calculated and a printable receipt is shown.
5. **View analytics** — click 📊 ANALYTICS in the header to see today's stats, revenue breakdown, and full history.
6. **Export data** — download history or revenue summary as CSV files.

---

## Key Concepts Demonstrated

- REST API design — clean separation of routes by resource and HTTP method
- Client-server architecture — frontend communicates exclusively via `fetch()` JSON calls
- OOP in Python — `Vehicle` and `ParkingLot` classes with clear responsibilities
- Stack data structure — LIFO vehicle tracking with temp-stack removal technique
- Queue data structure — FIFO waiting list, auto-served on every exit
- Real-time UI — `setInterval` polls `/api/status` every 3 seconds, re-renders blueprint
- In-browser machine learning — Tesseract.js OCR runs entirely in the browser
- File-based persistence — JSON replaces a database for project-scale data
- Dynamic UI rendering — blueprint grid built from data without any framework
- Responsive design — CSS breakpoints for tablet and 375px mobile screens

---

*Smart Parking System v1.0 · C. Sree Harshith Reddy · April 2026*