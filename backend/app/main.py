import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base
from app.routers import auth, users, projects, annotations, ai, export, websocket
from app.routers.images import router as images_router, images_router as files_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed first admin user if DB is empty
    await _seed_admin()

    # Create storage dirs
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
            await create_user(
                db,
                UserCreate(
                    email=settings.FIRST_ADMIN_EMAIL,
                    full_name="Lab Admin",
                    password=settings.FIRST_ADMIN_PASSWORD,
                    role=UserRole.ADMIN,
                ),
            )
            print(f"✅ Admin user seeded: {settings.FIRST_ADMIN_EMAIL}")


app = FastAPI(
    title="MarineAnnotate API",
    description="In-house annotation platform for underwater marine imagery",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(images_router)
app.include_router(files_router)
app.include_router(annotations.router)
app.include_router(ai.router)
app.include_router(export.router)
app.include_router(websocket.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "1.0.0"}
