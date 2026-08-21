from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, token_version: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": subject, "exp": expire, "jti": uuid4().hex,
        "type": "access", "ver": token_version,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str, token_version: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": subject, "exp": expire, "jti": uuid4().hex,
        "type": "refresh", "ver": token_version,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _decode_jwt(token: str) -> dict:
    """Decode and return payload — raises 401 on any failure."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        subject: str | None = payload.get("sub")
        if subject is None:
            raise credentials_exception
        return payload
    except JWTError:
        raise credentials_exception


async def _check_user_live(user_id: int, token_version: int, db: AsyncSession) -> None:
    """
    Shared check for both access and refresh tokens: the account must still
    exist, be active, and the token must have been issued after the user's
    last password reset (token_version match). Without this, deactivating a
    user or resetting their password doesn't actually stop an
    already-issued token from working until it naturally expires.
    """
    from app.models import User  # local import avoids a circular import at module load

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Account is disabled")
    if user.token_version != token_version:
        raise HTTPException(
            status_code=401,
            detail="Session has been invalidated — please sign in again",
        )


async def get_current_user_id(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> int:
    """Dependency for all protected routes — validates access token."""
    payload = _decode_jwt(token)
    # Accept both typed tokens and legacy tokens without type field
    # (graceful during transition)
    token_type = payload.get("type")
    if token_type is not None and token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token subject")

    # Check revocation list (non-fatal if Redis is unavailable)
    jti = payload.get("jti")
    if jti:
        try:
            from app.core.redis import redis_client
            if await redis_client.get(f"revoked:{jti}"):
                raise HTTPException(status_code=401, detail="Token has been revoked")
        except HTTPException:
            raise
        except Exception:
            pass  # Redis unavailable — allow request through

    await _check_user_live(user_id, payload.get("ver", 0), db)
    return user_id


async def get_current_user_id_from_refresh(
    token: str, db: AsyncSession
) -> tuple[int, str]:
    """Validate a refresh token — used only by /auth/refresh endpoint."""
    payload = _decode_jwt(token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    jti = payload.get("jti", "")
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token subject")

    await _check_user_live(user_id, payload.get("ver", 0), db)
    return user_id, jti


CurrentUserID = Annotated[int, Depends(get_current_user_id)]
