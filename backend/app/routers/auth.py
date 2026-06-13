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
    create_access_token, create_refresh_token,
    get_current_user_id_from_refresh, verify_password, CurrentUserID,
)
from app.core.config import settings
from app.crud import get_user_by_email, get_user
from app.schemas import Token, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])
DbDep = Annotated[AsyncSession, Depends(get_db)]


async def _check_rate_limit(request: Request, email: str) -> None:
    """Simple Redis-based rate limit: max 10 login attempts per IP per 15 min."""
    try:
        from app.core.redis import redis_client
        ip = request.client.host if request.client else "unknown"
        key = f"login_attempts:{ip}"
        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, 900)
        if count > 10:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Please wait 15 minutes.",
            )
    except HTTPException:
        raise
    except Exception:
        pass  # Redis unavailable — allow through


async def _track_failed_attempt(email: str) -> None:
    try:
        from app.core.redis import redis_client
        key = f"login_fail:{email}"
        count = await redis_client.incr(key)
        await redis_client.expire(key, 900)
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


@router.post("/token", response_model=Token)
async def login(
    request: Request,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    response: Response,
    db: DbDep,
) -> Token:
    await _check_rate_limit(request, form.username)

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

    access_token = create_access_token(str(user.id))
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
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    user_id, old_jti = await get_current_user_id_from_refresh(refresh_token)

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