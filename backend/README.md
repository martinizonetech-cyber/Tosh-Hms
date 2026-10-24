# Tosh Clinic HMS Backend

Production-grade backend for **Tosh**, a two-department clinic Hospital Management System (Skin + Orthopaedics).

## Tech Stack
- **Python 3.11+ / 3.12+**
- **FastAPI** (Async)
- **PostgreSQL 15+** with **SQLAlchemy 2.0 (asyncpg)** & **Alembic**
- **Pydantic v2** & **pydantic-settings**
- **Argon2id** password hashing & JWT auth with httpOnly cookies
- **Structlog** structured logging with PHI redaction
- **MinIO / S3** compatible document storage

## Getting Started

### 1. Setup Virtual Environment
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

### 2. Configure Environment
```bash
cp .env.example .env
```

### 3. Run Migrations
```bash
alembic upgrade head
```

### 4. Seed Database
```bash
python -m app.scripts.seed
```

### 5. Start Development Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 4000 --reload
```

## Running with Docker Compose
```bash
docker compose up -d
```
Services started:
- `api`: FastAPI server on `http://localhost:4000` (Swagger UI at `/docs` in non-prod)
- `postgres`: PostgreSQL 16 on `localhost:5432`
- `minio`: S3-compatible storage on `localhost:9000` (Console on `localhost:9001`)
