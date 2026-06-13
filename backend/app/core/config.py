from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://marine:marine@localhost:5432/marine_annotate"

    # ── Auth ──────────────────────────────────────────────────────────────────
    SECRET_KEY: str = Field(..., min_length=32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    INVITE_TOKEN_EXPIRE_HOURS: int = 48

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Storage ───────────────────────────────────────────────────────────────
    STORAGE_PATH: str = "./storage"
    MODELS_PATH: str = "./storage/models"
    IMAGES_PATH: str = "./storage/images"
    MAX_UPLOAD_SIZE_MB: int = 50

    # ── First admin ───────────────────────────────────────────────────────────
    FIRST_ADMIN_EMAIL: str = Field(...)
    FIRST_ADMIN_PASSWORD: str = Field(..., min_length=12)

    # ── CORS ──────────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # ── SMTP (optional — falls back to console log if not set) ────────────────
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@marinelab.local"
    SMTP_TLS: bool = True

    # ── App public URL (used in invite links) ─────────────────────────────────
    APP_URL: str = "http://localhost:5173"

    # ── Environment ───────────────────────────────────────────────────────────
    DEBUG: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
