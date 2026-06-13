import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base
from app.core.middleware import RequestSizeLimitMiddleware, SecurityHeadersMiddleware
from app.routers import auth, users, projects, annotations, ai, export, websocket
from app.routers.images import router as images_router, images_router as files_router
from app.routers.invites import router as invites_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _seed_admin()
    os.makedirs(settings.IMAGES_PATH, exist_ok=True)
    os.makedirs(settings.MODELS_PATH, exist_ok=True)
    yield


async def _seed_admin() -> None:
    from app.core.database import AsyncSessionLocal
    from app.crud import get_user_by_email, create_user
    from app.schemas import UserCreate
    from app.models import UserRole

    async with AsyncSessionLocal() as db:
        existing = await get_user_by_email(db, settings.FIRST_ADMIN_EMAIL)
        if not existing:
            await create_user(db, UserCreate(
                email=settings.FIRST_ADMIN_EMAIL,
                full_name="Lab Admin",
                password=settings.FIRST_ADMIN_PASSWORD,
                role=UserRole.ADMIN,
            ))
            print(f"✅ Admin user seeded: {settings.FIRST_ADMIN_EMAIL}")


app = FastAPI(
    title="MarineAnnotate API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    max_age=600,
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(images_router)
app.include_router(files_router)
app.include_router(annotations.router)
app.include_router(ai.router)
app.include_router(export.router)
app.include_router(websocket.router)
app.include_router(invites_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
