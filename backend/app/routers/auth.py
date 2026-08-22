from datetime import timezone, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import client_ip, log_event
from app.core.database import get_db
from app.core.email import send_password_reset_email
from app.core.security import (
    create_access_token, create_refresh_token, hash_password,
    get_current_user_id_from_refresh, verify_password, CurrentUserID,
)
from app.core.config import settings
from app.crud import get_user_by_email, get_user
from app.schemas import Token, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

PASSWORD_RESET_TTL_SECONDS = 3600  # 1 hour, single-use


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


def _password_strength(v: str) -> str:
    if not any(c.isdigit() for c in v):
        raise ValueError("Password must contain at least one digit")
    return v


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _password_strength(v)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _password_strength(v)


async def _check_rate_limit(request: Request, email: str) -> None:
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
        pass


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


async def _clear_ip_rate_limit(request: Request) -> None:
    """
    A successful login shouldn't count against the shared-IP flood counter —
    otherwise a handful of people logging in correctly from the same office/lab
    network can lock everyone else out for 15 minutes.
    """
    try:
        from app.core.redis import redis_client
        ip = request.client.host if request.client else "unknown"
        await redis_client.delete(f"login_attempts:{ip}")
    except Exception:
        pass


async def _set_reset_token(token: str, user_id: int) -> None:
    from app.core.redis import redis_client
    await redis_client.setex(f"pwreset:{token}", PASSWORD_RESET_TTL_SECONDS, str(user_id))


async def _get_reset_user_id(token: str) -> int | None:
    try:
        from app.core.redis import redis_client
        raw = await redis_client.get(f"pwreset:{token}")
        return int(raw) if raw else None
    except Exception:
        return None


async def _delete_reset_token(token: str) -> None:
    try:
        from app.core.redis import redis_client
        await redis_client.delete(f"pwreset:{token}")
    except Exception:
        pass


def _is_secure(request: Request) -> bool:
    """Detect real scheme even behind nginx (via X-Forwarded-Proto)."""
    forwarded = request.headers.get("x-forwarded-proto", "")
    return forwarded == "https" or request.url.scheme == "https"


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
        await log_event(db, "login_failed", actor_email=email, ip_address=client_ip(request))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        await log_event(db, "login_failed", actor_user_id=user.id, actor_email=email,
                         ip_address=client_ip(request), detail={"reason": "disabled"})
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    await _clear_failed_attempts(email)
    await _clear_ip_rate_limit(request)
    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    await log_event(db, "login_success", actor_user_id=user.id, actor_email=email, ip_address=client_ip(request))

    access_token = create_access_token(str(user.id), user.token_version)
    refresh_token = create_refresh_token(str(user.id), user.token_version)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=_is_secure(request),
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        # Scoped to /api/auth (not just /api/auth/refresh) so the browser also
        # sends it to /api/auth/logout — otherwise logout can never revoke it.
        path="/api/auth",
    )

    return Token(access_token=access_token)


@router.post("/refresh", response_model=Token)
async def refresh_access_token(
    request: Request,
    response: Response,
    db: DbDep,
    refresh_token: str | None = Cookie(default=None),
) -> Token:
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    user_id, old_jti = await get_current_user_id_from_refresh(refresh_token, db)

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

    new_access = create_access_token(str(user_id), user.token_version)
    new_refresh = create_refresh_token(str(user_id), user.token_version)

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=_is_secure(request),
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        # Scoped to /api/auth (not just /api/auth/refresh) so the browser also
        # sends it to /api/auth/logout — otherwise logout can never revoke it.
        path="/api/auth",
    )
    return Token(access_token=new_access)


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    user_id: CurrentUserID,
    db: DbDep,
    refresh_token: str | None = Cookie(default=None),
) -> None:
    if refresh_token:
        try:
            _, jti = await get_current_user_id_from_refresh(refresh_token, db)
            from app.core.redis import redis_client
            await redis_client.setex(
                f"revoked:{jti}",
                settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
                "1",
            )
        except Exception:
            pass
    response.delete_cookie("refresh_token", path="/api/auth")


@router.get("/me", response_model=UserResponse)
async def get_me(user_id: CurrentUserID, db: DbDep) -> UserResponse:
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    payload: ForgotPasswordRequest, request: Request, db: DbDep
) -> dict:
    """
    Self-service password reset request. Mirrors the invite flow: a
    single-use token stored in Redis, emailed as a link. No admin ever sees
    or sets another user's password — same principle as invites.
    """
    await _check_rate_limit(request, payload.email)

    email = payload.email.lower().strip()
    user = await get_user_by_email(db, email)
    # Always return the same response whether or not the account exists —
    # a differing response here is a user-enumeration leak.
    if user and user.is_active:
        token = uuid4().hex
        await _set_reset_token(token, user.id)
        reset_url = f"{settings.APP_URL}/reset-password?token={token}"
        await send_password_reset_email(user.email, reset_url)
        await log_event(db, "password_reset_requested", actor_user_id=user.id,
                         actor_email=user.email, ip_address=client_ip(request))

    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, request: Request, db: DbDep) -> dict:
    user_id = await _get_reset_user_id(payload.token)
    if user_id is None:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")

    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Account no longer exists")

    user.hashed_password = hash_password(payload.new_password)
    # Every access/refresh token issued before this moment carries the old
    # token_version and stops working immediately — a password reset is
    # supposed to mean "kick out anyone who had the old password," not just
    # "change the password and hope."
    user.token_version += 1
    await db.commit()
    await _delete_reset_token(payload.token)
    await _clear_failed_attempts(user.email)
    await log_event(db, "password_reset_completed", actor_user_id=user.id,
                     actor_email=user.email, ip_address=client_ip(request))
    return {"message": "Password updated — you can now sign in."}


@router.post("/change-password", response_model=Token)
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    user_id: CurrentUserID,
    db: DbDep,
) -> Token:
    """
    Self-service change while already logged in — the one gap left after the
    email-based forgot/reset flow: there was previously no way to change your
    own password without going through email at all.
    """
    user = await get_user(db, user_id)
    if not user or not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    user.hashed_password = hash_password(payload.new_password)
    # Bump token_version same as a reset — every OTHER session (other tabs,
    # other devices) should die immediately. But unlike a reset, the user is
    # sitting right here having just proven their identity, so hand back a
    # fresh token pair instead of forcing them to log back in on this one.
    user.token_version += 1
    await db.commit()
    await log_event(db, "password_changed", actor_user_id=user.id,
                     actor_email=user.email, ip_address=client_ip(request))

    access_token = create_access_token(str(user.id), user.token_version)
    refresh_token = create_refresh_token(str(user.id), user.token_version)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=_is_secure(request),
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth",
    )
    return Token(access_token=access_token)
