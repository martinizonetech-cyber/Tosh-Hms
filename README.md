# Tosh Clinic HMS (Hospital Management System)

Production-grade Hospital Management System for Tosh Clinic, specialized for a two-department clinic (**Skin** and **Orthopaedics**). Built with a **FastAPI + PostgreSQL** async backend and a **React + TailwindCSS + Vite** frontend.

---

## Architecture Overview

```
                      ┌────────────────────────────┐
                      │    React Frontend (Vite)   │
                      │ Port 3000 / localhost:5173 │
                      └─────────────┬──────────────┘
                                    │ HTTP / JSON (camelCase wire contract)
                                    │ Credentials: include (httpOnly cookie)
                                    ▼
                      ┌────────────────────────────┐
                      │    FastAPI Backend (4000)  │
                      └─────────────┬──────────────┘
                                    │
         ┌──────────────────────────┼─────────────────────────┐
         ▼                          ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ PostgreSQL 16 DB │      │ Document Storage │      │ APScheduler Job  │
│ (SQLAlchemy 2.0) │      │ (Local / MinIO)  │      │ Reminders (IST)  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

### Module Structure (`backend/app/`)
- `core/`: Application settings, security (Argon2id, JWT), exceptions, rate limiting, logging with PHI redaction.
- `db/`: Async database session factory, base model, Alembic migrations.
- `modules/`: Feature slices containing `models.py`, `schemas.py`, and `router.py`:
  - `auth`: Login, JWT token generation, refresh cookie rotation, `/auth/me`, doctor listings.
  - `patients`: Patient registration, duplicate detection, patient profiles.
  - `appointments`: Scheduling, double-booking prevention, doctor department validation.
  - `queue`: Daily queue tokens, check-in, status transitions (`Waiting` -> `Consulting` -> `Completed`).
  - `visits`: Consultation records, vitals tracking, optimistic concurrency (`version`), locking.
  - `documents`: File uploads (magic byte checks), signed temporary URLs, soft-deletes.
  - `billing`: Invoices, atomic payments (`FOR UPDATE` locking, `Idempotency-Key`), refunds.
  - `catalog`: Charge catalog items, body-region clinical templates.
  - `settings`: Consultation fee settings per department.
  - `followups`: Follow-up scheduling, overdue computation in IST, reminder queues.
  - `reports`: SQL-computed clinical and financial summary reports (`ReportSummary`).
- `services/`:
  - `storage.py`: Storage abstraction (`LocalStorageService` and `S3StorageService`).
  - `notification.py`: Provider interface (`NoopProvider`) for messaging/WhatsApp reminders.
  - `scheduler.py`: Background cron job running daily at 09:00 IST for patient follow-up reminders.

---

## Authentication Flow

1. **Sign-In (`POST /api/v1/auth/login`)**:
   - Submits `email` and `password`.
   - Verified via **Argon2id** password hashing.
   - Account locks for 15 minutes after 5 consecutive failed attempts.
   - Response: Returns short-lived access token in response body (stored in memory ONLY on the client). Sets an `httpOnly`, `SameSite=Lax` refresh cookie (`refresh_token`).
2. **Authenticated Requests**:
   - Client sends `Authorization: Bearer <token>` along with `credentials: 'include'`.
   - Role-Based Access Control (RBAC): `reception`, `skin`, `orthopaedics`.
   - Doctors are isolated to their department clinical records (IDOR protection).
3. **Token Refresh (`POST /api/v1/auth/refresh`)**:
   - Automatically invoked by HTTP interceptor when access token expires.
   - Reads `httpOnly` refresh cookie, validates, rotates to a new refresh cookie, and issues a fresh access token.
4. **Sign-Out (`POST /api/v1/auth/logout`)**:
   - Clears the refresh token cookie and logs audit event.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|---|---|---|
| `ENVIRONMENT` | Runtime environment (`development` / `production`) | `development` |
| `DEBUG` | Enable debug logging | `True` |
| `HOST` / `PORT` | Listening host and port | `0.0.0.0` / `4000` |
| `DATABASE_URL` | Async PostgreSQL connection string | `postgresql+asyncpg://...` |
| `DATABASE_SYNC_URL` | Sync PostgreSQL connection string for Alembic | `postgresql://...` |
| `JWT_SECRET_KEY` | Secret key for JWT signing & document HMAC signatures | (required) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifespan | `15` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifespan | `7` |
| `STORAGE_BACKEND` | Storage service provider (`local` or `s3`) | `local` |
| `LOCAL_STORAGE_DIR` | Directory for local file storage | `uploads` |
| `TIMEZONE` | Clinical timezone for reporting & reminders | `Asia/Kolkata` |

### Frontend (`frontend/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_DATA_MODE` | Data layer provider (`api` or `mock`) | `api` |
| `VITE_API_BASE_URL` | Backend API base URL | `http://localhost:4000/api/v1` |

---

## Local Setup & Development

### 1. Backend Setup (Windows PowerShell)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
pip install pytest-cov

# Setup .env
cp .env.example .env

# Run database migrations
alembic upgrade head

# Seed initial clinic data (doctors, catalog, initial fees, test patients)
python -m app.scripts.seed

# Start backend API server
uvicorn app.main:app --host 127.0.0.1 --port 4000 --reload
```

### 2. Frontend Setup

```powershell
cd frontend
npm install

# Set VITE_DATA_MODE=api and VITE_API_BASE_URL=http://localhost:4000/api/v1 in frontend/.env
npm run dev
```

---

## How to Add a New Module

To add a new entity or feature (e.g., `inventory`):
1. **Create Directory**: `backend/app/modules/inventory/`
2. **Define Model**: In `models.py`, subclass `Base` and `TimestampMixin`. Use `UuidType` and `generate_uuid`.
3. **Define Schemas**: In `schemas.py`, subclass `CamelModel` for automatic camelCase wire serialization and `extra="forbid"`.
4. **Implement Router**: In `router.py`, create `APIRouter(prefix="/inventory", tags=["Inventory"])`. Use `require_role(...)` or `require_department(...)` dependencies for RBAC.
5. **Register Router**: Include in `api_v1_router` in `backend/app/main.py`.
6. **Generate Migration**:
   ```bash
   alembic revision --autogenerate -m "add_inventory_table"
   alembic upgrade head
   alembic check
   ```
7. **Write Tests**: Add endpoint integration tests in `backend/tests/`.

---

## Quality Gates & Testing

Run all checks before committing:
```powershell
cd backend
.venv\Scripts\ruff check app tests
.venv\Scripts\mypy app
.venv\Scripts\alembic check
.venv\Scripts\pytest -v --cov=app/services --cov-report=term-missing

cd ../frontend
npm run build
```
