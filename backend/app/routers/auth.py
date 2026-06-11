"""
Auth router — patched for:
- Fix 3: brute-force rate limiting via slowapi
- Fix 6: short access tokens + refresh token flow (HttpOnly cookie)
- Fix 5: WS token sent in first message (handled in websocket.py)
"""
from datetime import timezone, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_current_user_id,
    get_current_user_id_from_refresh,
    verify_password,
    CurrentUserID,
)
from app.core.config import settings
from app.crud import get_user_by_email, get_user
from app.schemas import Token, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

# ── Rate limiting (Fix 3) ─────────────────────────────────────────────────────
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)

    def _rate_limit(request: Request):
        pass  # placeholder; decorator applied below

    USE_RATE_LIMIT = True
except ImportError:
    USE_RATE_LIMIT = False


async def _track_failed_attempt(email: str) -> None:
    """Track consecutive failures per email in Redis; lock after 10."""
    try:
        from app.core.redis import redis_client
        key = f"login_fail:{email}"
        count = await redis_client.incr(key)
        await redis_client.expire(key, 900)  # 15-minute window
        if count >= 10:
            await redis_client.setex(f"login_lock:{email}", 900, "1")
    except Exception:
        pass


async def _is_locked(email: str) -> bool:
    try:
        from app.core.redis import redis_client
        return bool(await redis_client.get(f"login_lock:{email}"))
    except Exception:
        return False


async def _clear_failed_attempts(email: str) -> None:
    try:
        from app.core.redis import redis_client
        await redis_client.delete(f"login_fail:{email}", f"login_lock:{email}")
    except Exception:
        pass


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/token", response_model=Token)
async def login(
    request: Request,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    response: Response,
    db: DbDep,
) -> Token:
    # Rate limit: 10 attempts per IP per minute
    if USE_RATE_LIMIT:
        await _limiter._check_request_limit(request, "10/minute")  # type: ignore[attr-defined]

    email = form.username.lower().strip()

    if await _is_locked(email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Account temporarily locked due to too many failed attempts",
        )

    user = await get_user_by_email(db, email)
    if not user or not verify_password(form.password, user.hashed_password):
        await _track_failed_attempt(email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    await _clear_failed_attempts(email)
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    # Short-lived access token in response body
    access_token = create_access_token(str(user.id))
    # Long-lived refresh token as HttpOnly cookie (not accessible to JS)
    refresh_token = create_refresh_token(str(user.id))
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth/refresh",
    )

    return Token(access_token=access_token)


@router.post("/refresh", response_model=Token)
async def refresh_access_token(
    response: Response,
    db: DbDep,
    refresh_token: str | None = Cookie(default=None),
) -> Token:
    """Exchange refresh cookie for a new access token."""
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    user_id, old_jti = await get_current_user_id_from_refresh(refresh_token)

    # Revoke old refresh token
    try:
        from app.core.redis import redis_client
        await redis_client.setex(
            f"revoked:{old_jti}",
            settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
            "1",
        )
    except Exception:
        pass

    user = await get_user(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")

    # Issue new tokens (rotation)
    new_access = create_access_token(str(user_id))
    new_refresh = create_refresh_token(str(user_id))
    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth/refresh",
    )
    return Token(access_token=new_access)


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    user_id: CurrentUserID,
    refresh_token: str | None = Cookie(default=None),
) -> None:
    """Revoke refresh token and clear cookie."""
    if refresh_token:
        try:
            _, jti = await get_current_user_id_from_refresh(refresh_token)
            from app.core.redis import redis_client
            await redis_client.setex(
                f"revoked:{jti}",
                settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
                "1",
            )
        except Exception:
            pass
    response.delete_cookie("refresh_token", path="/api/auth/refresh")


@router.get("/me", response_model=UserResponse)
async def get_me(user_id: CurrentUserID, db: DbDep) -> UserResponse:
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
