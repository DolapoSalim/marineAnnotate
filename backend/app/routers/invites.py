"""
Invite system — admin sends email invite, user sets own password via token link.
No admin ever sees or sets the invitee's password.
Tokens stored in Redis so they survive backend restarts.
"""
from __future__ import annotations

import ipaddress
import json
from datetime import datetime, timedelta, timezone
from typing import Annotated
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import client_ip, log_event
from app.core.config import settings
from app.core.database import get_db
from app.core.email import send_invite_email
from app.core.rate_limit import enforce_rate_limit
from app.core.security import CurrentUserID
from app.crud import get_user, get_user_by_email, create_user
from app.models import UserRole
from app.schemas import UserCreate, UserResponse

router = APIRouter(prefix="/api/invites", tags=["invites"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

INVITE_TTL = settings.INVITE_TOKEN_EXPIRE_HOURS * 3600


async def _set_invite(token: str, data: dict) -> None:
    from app.core.redis import redis_client
    await redis_client.setex(f"invite:{token}", INVITE_TTL, json.dumps(data))


async def _get_invite(token: str) -> dict | None:
    try:
        from app.core.redis import redis_client
        raw = await redis_client.get(f"invite:{token}")
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def _delete_invite(token: str) -> None:
    try:
        from app.core.redis import redis_client
        await redis_client.delete(f"invite:{token}")
    except Exception:
        pass


class InviteCreate(BaseModel):
    email: EmailStr
    role: UserRole = UserRole.ANNOTATOR
    full_name: str


class InviteAccept(BaseModel):
    token: str
    password: str
    full_name: str


def _is_local_app_url() -> bool:
    """
    True if APP_URL points at this machine only (localhost/loopback) or a
    private-network address — an invite link built from either will only
    work for someone on this exact machine or LAN, never a remote
    collaborator. Surfaced to the admin so a misconfigured APP_URL is
    visible before an invite goes out, not discovered when the recipient
    reports the link doesn't work.
    """
    host = urlparse(settings.APP_URL).hostname or ""
    if host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
        return True
    try:
        return ipaddress.ip_address(host).is_private
    except ValueError:
        return False


async def _require_admin(user_id: int, db: AsyncSession):
    user = await get_user(db, user_id)
    if not user or user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.post("/send", status_code=201)
async def send_invite(
    payload: InviteCreate,
    user_id: CurrentUserID,
    db: DbDep,
    request: Request,
) -> dict:
    admin = await _require_admin(user_id, db)
    await enforce_rate_limit(f"ratelimit:invite:{user_id}", max_calls=20, window_seconds=3600)

    existing = await get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    token = uuid4().hex
    await _set_invite(token, {
        "email": payload.email,
        "role": payload.role,
        "full_name": payload.full_name,
        "invited_by": admin.full_name,
    })

    invite_url = f"{settings.APP_URL}/accept-invite?token={token}"
    sent = await send_invite_email(payload.email, invite_url, admin.full_name)
    await log_event(db, "invite_sent", actor_user_id=admin.id, actor_email=admin.email,
                     target_type="user_invite", target_id=payload.email,
                     ip_address=client_ip(request), detail={"role": payload.role.value})

    return {
        "message": "Invite sent" if sent else "Invite created (check server logs for link)",
        "email": payload.email,
        # Shown to the admin who just sent it, not the invitee — this is
        # confirmation of their own action, not a leak. Always included
        # (not just in DEBUG) so a wrong APP_URL is visible immediately.
        "invite_url": invite_url,
        "app_url_is_local": _is_local_app_url(),
    }


@router.get("/validate/{token}")
async def validate_invite(token: str) -> dict:
    invite = await _get_invite(token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    return {
        "email": invite["email"],
        "full_name": invite["full_name"],
        "role": invite["role"],
    }


@router.post("/accept")
async def accept_invite(payload: InviteAccept, request: Request, db: DbDep) -> UserResponse:
    invite = await _get_invite(payload.token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = await create_user(db, UserCreate(
        email=invite["email"],
        full_name=payload.full_name or invite["full_name"],
        password=payload.password,
        role=invite["role"],
    ))
    await _delete_invite(payload.token)
    await log_event(db, "invite_accepted", actor_user_id=user.id, actor_email=user.email,
                     target_type="user", target_id=user.id, ip_address=client_ip(request))
    return user