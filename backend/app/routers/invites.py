"""
Invite system — admin sends email invite, user sets own password via token link.
No admin ever sees or sets the invitee's password.
"""
from __future__ import annotations

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
from app.core.security import CurrentUserID, hash_password
from app.crud import get_user, get_user_by_email, create_user
from app.models import User, UserRole
from app.schemas import UserCreate, UserResponse

router = APIRouter(prefix="/api/invites", tags=["invites"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

# In-memory invite store (use Redis in production for multi-instance)
# token -> {email, role, invited_by, expires_at}
_invite_store: dict[str, dict] = {}


class InviteCreate(BaseModel):
    email: EmailStr
    role: UserRole = UserRole.ANNOTATOR
    full_name: str


class InviteAccept(BaseModel):
    token: str
    password: str
    full_name: str


async def _require_admin(user_id: CurrentUserID, db: DbDep) -> User:
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

    # Check email not already registered
    existing = await get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    # Generate invite token
    token = uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(
        hours=settings.INVITE_TOKEN_EXPIRE_HOURS
    )
    _invite_store[token] = {
        "email": payload.email,
        "role": payload.role,
        "full_name": payload.full_name,
        "invited_by": admin.full_name,
        "expires_at": expires_at,
    }

    invite_url = f"{settings.APP_URL}/accept-invite?token={token}"
    sent = await send_invite_email(payload.email, invite_url, admin.full_name)

    return {
        "message": "Invite sent" if sent else "Invite created (check server logs for link)",
        "email": payload.email,
        # Only returned in DEBUG mode so admin can share manually
        "invite_url": invite_url if settings.DEBUG else None,
    }


@router.get("/validate/{token}")
async def validate_invite(token: str) -> dict:
    """Frontend calls this to check the token before showing the set-password form."""
    invite = _invite_store.get(token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    if datetime.now(timezone.utc) > invite["expires_at"]:
        _invite_store.pop(token, None)
        raise HTTPException(status_code=410, detail="Invite link has expired")
    return {
        "email": invite["email"],
        "full_name": invite["full_name"],
        "role": invite["role"],
    }


@router.post("/accept")
async def accept_invite(payload: InviteAccept, db: DbDep) -> UserResponse:
    """User sets their own password and creates their account."""
    invite = _invite_store.get(payload.token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    if datetime.now(timezone.utc) > invite["expires_at"]:
        _invite_store.pop(payload.token, None)
        raise HTTPException(status_code=410, detail="Invite link has expired")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    # Create user with their own password
    user = await create_user(db, UserCreate(
        email=invite["email"],
        full_name=payload.full_name or invite["full_name"],
        password=payload.password,
        role=invite["role"],
    ))

    # Consume token — single use
    _invite_store.pop(payload.token, None)
    return user
