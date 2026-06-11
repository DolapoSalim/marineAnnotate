from pydantic_settings import BaseSettings
from pydantic import AnyUrl
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://marine:marine@localhost:5432/marine_annotate"

    # Auth
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"

    # Storage paths
    STORAGE_PATH: str = "./storage"
    MODELS_PATH: str = "./storage/models"
    IMAGES_PATH: str = "./storage/images"
    MAX_UPLOAD_SIZE_MB: int = 50

    # First admin (seeded on first run)
    FIRST_ADMIN_EMAIL: str = "admin@lab.local"
    FIRST_ADMIN_PASSWORD: str = "changeme123"

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
