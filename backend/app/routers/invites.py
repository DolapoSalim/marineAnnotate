"""
Invite system — admin sends email invite, user sets own password via token link.
No admin ever sees or sets the invitee's password.
Tokens stored in Redis so they survive backend restarts.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.email import send_invite_email
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
) -> dict:
    admin = await _require_admin(user_id, db)
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

    return {
        "message": "Invite sent" if sent else "Invite created (check server logs for link)",
        "email": payload.email,
        "invite_url": invite_url if settings.DEBUG else None,
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
async def accept_invite(payload: InviteAccept, db: DbDep) -> UserResponse:
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
    return user