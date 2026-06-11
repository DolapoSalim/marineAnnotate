from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = Field(
        default="postgresql://marine:marine@db/marine_annotate"
    )

    # ── Auth — NO defaults for secrets; app crashes on startup if unset ───────
    SECRET_KEY: str = Field(..., min_length=32)          # python -c "import secrets; print(secrets.token_hex(32))"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15                # short-lived; refresh via /auth/refresh
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Redis / Celery ────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Storage paths ─────────────────────────────────────────────────────────
    STORAGE_PATH: str = "./storage"
    MODELS_PATH: str = "./storage/models"
    IMAGES_PATH: str = "./storage/images"
    MAX_UPLOAD_SIZE_MB: int = 50

    # ── First admin — NO defaults; must be set explicitly ─────────────────────
    FIRST_ADMIN_EMAIL: str = Field(...)
    FIRST_ADMIN_PASSWORD: str = Field(..., min_length=12)

    # ── CORS — explicit, minimal ──────────────────────────────────────────────
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # ── Environment ───────────────────────────────────────────────────────────
    DEBUG: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
