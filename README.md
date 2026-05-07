# Smart Parking System

An intelligent full-stack parking management platform with QR tickets, dynamic pricing, AI prediction, EV charging, and multi-operator support.

## Features

- Smart parking with auto-assign and manual slot picker
- QR ticket generation and one-scan exit
- Camera OCR for number plate scanning
- Dynamic surge pricing with peak-hour rules
- AI 24-hour occupancy prediction
- EV charging with per-kWh billing
- Pre-booking system with 30-min grace period
- Admin dashboard with operator management
- Multi-floor support
- PWA installable on Android and iOS
- Role-based auth with session timeout
- Rate limiting and input sanitization

## Quick Start

```bash
git clone https://github.com/SREEHARSHITHREDDY/Smart-Parking-System-Stack-Queue
cd Smart-Parking-System-Stack-Queue/smart-parking-system
conda install -c conda-forge flask-sqlalchemy flask-login psycopg2 bcrypt gunicorn python-dotenv
pip install flask-limiter
psql postgres -c "CREATE DATABASE smartparking;"
cp .env.example .env
python app.py
```

Open http://localhost:5001 — Default admin: admin@smartparking.com / admin123

## Environment Variables

```
DATABASE_URL=postgresql://username@localhost:5432/smartparking
SECRET_KEY=your-long-random-secret-key
FLASK_ENV=development
```

## Tech Stack

- Backend: Flask 2.3, SQLAlchemy, Flask-Login, Flask-Limiter, bcrypt
- Database: PostgreSQL 17
- Frontend: Vanilla JS, Tesseract.js, qrcode.js, jsQR
- Server: gunicorn
- Theme: Orbitron + JetBrains Mono dark UI

## SaaS Pricing

| Plan | Price | Features |
|------|-------|---------|
| Free | Rs 0/month | 1 lot, 20 slots |
| Starter | Rs 2,999/month | Unlimited slots, OCR, QR, payments |
| Pro | Rs 7,999/month | 5 lots, AI, EV, dynamic pricing |
| Enterprise | Custom | Hardware API, white-label, SLA |

## Author

C. Sree Harshith Reddy — Patent Pending — May 2026