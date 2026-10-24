from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    APP_NAME: str = "Tosh Clinic HMS API"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    
    # Server host & port
    HOST: str = "0.0.0.0"
    PORT: int = 4000

    # CORS
    CORS_ORIGINS: list[str] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"]
    )

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/tosh_db"
    DATABASE_SYNC_URL: str = "postgresql://postgres:postgres@localhost:5432/tosh_db"

    # JWT Authentication
    JWT_SECRET_KEY: str = "super-secret-tosh-jwt-key-replace-in-production-1234567890"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Staff Initial Passwords (loaded strictly from backend/.env)
    RECEPTION_INITIAL_PASSWORD: str = ""
    SKIN_INITIAL_PASSWORD: str = ""
    ORTHO_INITIAL_PASSWORD: str = ""

    # Storage
    STORAGE_BACKEND: str = "local"  # 'local' or 's3'
    LOCAL_STORAGE_DIR: str = "uploads"
    S3_ENDPOINT_URL: str | None = None
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None
    S3_BUCKET_NAME: str = "tosh-documents"
    S3_REGION_NAME: str = "us-east-1"

    # Timezone
    TIMEZONE: str = "Asia/Kolkata"


settings = Settings()
