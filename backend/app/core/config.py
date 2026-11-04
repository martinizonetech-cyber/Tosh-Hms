import json
import os
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Determine base paths
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_DIR = BACKEND_DIR.parent

# Collect possible .env file locations in order of priority:
# 1. Custom ENV_FILE path from environment variable
# 2. backend/.env
# 3. .env in root project directory
# 4. .env in current working directory
possible_env_files: list[Path] = []
if custom_env := os.getenv("ENV_FILE"):
    possible_env_files.append(Path(custom_env))
possible_env_files.extend([
    BACKEND_DIR / ".env",
    ROOT_DIR / ".env",
    Path.cwd() / ".env",
])

# Attempt to load into os.environ (via python-dotenv if installed, or fallback manual parser)
# Using override=True so that edits in .env immediately take effect over stale shell variables
try:
    from dotenv import load_dotenv

    for env_path in possible_env_files:
        if env_path.is_file():
            load_dotenv(dotenv_path=env_path, override=True)
except ImportError:
    # Lightweight fallback parser if python-dotenv is not installed
    for env_path in possible_env_files:
        if env_path.is_file():
            try:
                with env_path.open(encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        key, val = line.split("=", 1)
                        key = key.strip()
                        val = val.strip()
                        if (val.startswith('"') and val.endswith('"')) or (
                            val.startswith("'") and val.endswith("'")
                        ):
                            val = val[1:-1]
                        os.environ[key] = val
            except Exception:
                pass

# Filter and deduplicate existing files for pydantic-settings
valid_env_files: list[str] = []
seen_paths: set[str] = set()
for p in possible_env_files:
    if p.is_file():
        resolved = str(p.resolve())
        if resolved not in seen_paths:
            seen_paths.add(resolved)
            valid_env_files.append(resolved)

env_file_setting: tuple[str, ...] = tuple(valid_env_files) if valid_env_files else (str(BACKEND_DIR / ".env"),)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=env_file_setting,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Core Application Settings (loaded from .env)
    APP_NAME: str = Field(default_factory=lambda: os.getenv("APP_NAME", "Tosh Clinic HMS API"))
    ENVIRONMENT: str = Field(default_factory=lambda: os.getenv("ENVIRONMENT", "development"))
    DEBUG: bool = Field(default_factory=lambda: os.getenv("DEBUG", "true").lower() in ("true", "1", "yes"))
    API_V1_PREFIX: str = Field(default_factory=lambda: os.getenv("API_V1_PREFIX", "/api/v1"))

    # Server Host & Port (loaded from .env)
    HOST: str = Field(default_factory=lambda: os.getenv("HOST", "0.0.0.0"))
    PORT: int = Field(default_factory=lambda: int(os.getenv("PORT", "4000")))

    # CORS Origins (loaded from .env)
    CORS_ORIGINS: list[str] = Field(default_factory=list)

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> list[str]:
        if not v:
            v = os.getenv("CORS_ORIGINS", "")
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            if v.startswith("[") and v.endswith("]"):
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed]
                except Exception:
                    # Handle single-quoted list format e.g. "['http://localhost:5173', ...]"
                    inner = v[1:-1].strip()
                    if inner:
                        return [
                            item.strip().strip("'\"")
                            for item in inner.split(",")
                            if item.strip().strip("'\"")
                        ]
                    return []
            return [item.strip() for item in v.split(",") if item.strip()]
        elif isinstance(v, (list, tuple)):
            return [str(item) for item in v]
        return v or []

    # Database URLs (loaded directly from .env without hardcoded defaults)
    DATABASE_URL: str = Field(default_factory=lambda: os.getenv("DATABASE_URL", "").strip())
    DATABASE_SYNC_URL: str = Field(default_factory=lambda: os.getenv("DATABASE_SYNC_URL", "").strip())

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_url(cls, v: Any) -> str:
        if v and str(v).strip():
            return str(v).strip()
        return os.getenv("DATABASE_URL", "").strip()

    @field_validator("DATABASE_SYNC_URL", mode="before")
    @classmethod
    def assemble_sync_url(cls, v: Any, info: Any) -> str:
        if v and str(v).strip():
            return str(v).strip()
        sync_env = os.getenv("DATABASE_SYNC_URL", "").strip()
        if sync_env:
            return sync_env
        data = info.data if hasattr(info, "data") else {}
        db_url = data.get("DATABASE_URL") or os.getenv("DATABASE_URL", "")
        return str(db_url).strip()

    @property
    def ASYNC_DATABASE_URL(self) -> str:
        """Derives the async driver URL needed by SQLAlchemy create_async_engine.
        E.g. Converts 'postgresql+psycopg2://...' or 'postgresql://...' to 'postgresql+asyncpg://...',
        and 'sqlite://...' to 'sqlite+aiosqlite://...'.
        """
        url = (self.DATABASE_URL or os.getenv("DATABASE_URL", "")).strip()
        if not url:
            return "sqlite+aiosqlite:///./tosh.db"
        if url.startswith("postgresql+psycopg2://"):
            return url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("sqlite://") and not url.startswith("sqlite+aiosqlite://"):
            return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
        return url

    # JWT Authentication (loaded from .env)
    JWT_SECRET_KEY: str = Field(default_factory=lambda: os.getenv("JWT_SECRET_KEY", ""))
    JWT_ALGORITHM: str = Field(default_factory=lambda: os.getenv("JWT_ALGORITHM", "HS256"))
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default_factory=lambda: int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15")))
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default_factory=lambda: int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7")))

    # Staff Initial Passwords (loaded from .env)
    RECEPTION_INITIAL_PASSWORD: str = Field(default_factory=lambda: os.getenv("RECEPTION_INITIAL_PASSWORD", ""))
    SKIN_INITIAL_PASSWORD: str = Field(default_factory=lambda: os.getenv("SKIN_INITIAL_PASSWORD", ""))
    ORTHO_INITIAL_PASSWORD: str = Field(default_factory=lambda: os.getenv("ORTHO_INITIAL_PASSWORD", ""))

    # Storage (loaded from .env)
    STORAGE_BACKEND: str = Field(default_factory=lambda: os.getenv("STORAGE_BACKEND", "local"))
    LOCAL_STORAGE_DIR: str = Field(default_factory=lambda: os.getenv("LOCAL_STORAGE_DIR", "uploads"))
    S3_ENDPOINT_URL: str | None = Field(default_factory=lambda: os.getenv("S3_ENDPOINT_URL"))
    S3_ACCESS_KEY_ID: str | None = Field(default_factory=lambda: os.getenv("S3_ACCESS_KEY_ID"))
    S3_SECRET_ACCESS_KEY: str | None = Field(default_factory=lambda: os.getenv("S3_SECRET_ACCESS_KEY"))
    S3_BUCKET_NAME: str | None = Field(default_factory=lambda: os.getenv("S3_BUCKET_NAME"))
    S3_REGION_NAME: str | None = Field(default_factory=lambda: os.getenv("S3_REGION_NAME"))

    # Timezone (loaded from .env)
    TIMEZONE: str = Field(default_factory=lambda: os.getenv("TIMEZONE", "Asia/Kolkata"))


settings = Settings()
