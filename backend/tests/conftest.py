"""
Shared test fixtures. Requires a real Postgres + Redis reachable at
TEST_DATABASE_URL / TEST_REDIS_URL (or DATABASE_URL / REDIS_URL) — see
scripts/run-tests.sh for spinning up disposable ones locally, or
.github/workflows/backend-tests.yml for how CI provides them. Schema is
created directly from the models (Base.metadata.create_all), not via
Alembic — this is a throwaway test database, not the migration-tracked one.
"""
from __future__ import annotations

import os

# Env vars must be set before anything under app/ is imported, since
# app.core.config.settings is a module-level singleton read once at import
# time. Real env vars (set by CI or run-tests.sh) always win; these are just
# safe fallbacks for running pytest directly against a local throwaway DB.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5433/marine_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6380/0")
os.environ.setdefault("SECRET_KEY", "test-only-secret-not-used-anywhere-real-0123456789")
os.environ.setdefault("FIRST_ADMIN_EMAIL", "admin@test.local")
os.environ.setdefault("FIRST_ADMIN_PASSWORD", "TestAdminPassword123")
os.environ.setdefault("ALLOWED_ORIGINS", '["http://testserver"]')

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models import User, UserRole

TEST_DATABASE_URL = os.environ["DATABASE_URL"]
ADMIN_PASSWORD = os.environ["FIRST_ADMIN_PASSWORD"]


@pytest_asyncio.fixture
async def engine():
    """
    Function-scoped deliberately: pytest-asyncio gives each test its own
    event loop, and an asyncpg connection/pool created in one loop breaks
    ("another operation is in progress") if reused from a different one. A
    fresh engine + schema per test avoids that entirely — the schema here is
    tiny, so recreating it per test costs a fraction of a second.
    """
    eng = create_async_engine(TEST_DATABASE_URL)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(engine):
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_user(db_session):
    user = User(
        email=os.environ["FIRST_ADMIN_EMAIL"],
        full_name="Test Admin",
        hashed_password=hash_password(ADMIN_PASSWORD),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def make_user(db_session, email: str, password: str, role: UserRole = UserRole.ANNOTATOR) -> User:
    user = User(
        email=email,
        full_name=email.split("@")[0],
        hashed_password=hash_password(password),
        role=role,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def login(client, email: str, password: str) -> str:
    r = await client.post("/api/auth/token", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]
