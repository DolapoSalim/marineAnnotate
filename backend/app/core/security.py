from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str) -> str:
    """Short-lived access token (15 min default)."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    jti = uuid4().hex
    payload = {"sub": subject, "exp": expire, "jti": jti, "type": "access"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str) -> str:
    """Long-lived refresh token (7 days default), stored as HttpOnly cookie."""
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    jti = uuid4().hex
    payload = {"sub": subject, "exp": expire, "jti": jti, "type": "refresh"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def _decode_token(token: str, expected_type: str) -> dict:
    """Decode and validate a JWT, checking type and revocation list."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if payload.get("type") != expected_type:
            raise credentials_exception
        subject: str | None = payload.get("sub")
        jti: str | None = payload.get("jti")
        if subject is None or jti is None:
            raise credentials_exception

        # Check revocation list in Redis
        try:
            from app.core.redis import redis_client
            if await redis_client.get(f"revoked:{jti}"):
                raise credentials_exception
        except ImportError:
            pass  # Redis optional during testing

        return {"user_id": int(subject), "jti": jti}
    except (JWTError, ValueError):
        raise credentials_exception


async def get_current_user_id(token: Annotated[str, Depends(oauth2_scheme)]) -> int:
    data = await _decode_token(token, expected_type="access")
    return data["user_id"]


async def get_current_user_id_from_refresh(token: str) -> tuple[int, str]:
    """Returns (user_id, jti) for refresh endpoint."""
    data = await _decode_token(token, expected_type="refresh")
    return data["user_id"], data["jti"]


CurrentUserID = Annotated[int, Depends(get_current_user_id)]
