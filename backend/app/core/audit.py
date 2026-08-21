"""
Audit trail — records security-relevant events (logins, password resets,
invites, admin actions) so a lab admin can answer "who did what, and when"
after the fact. Logging failures never break the request that triggered them.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def log_event(
    db: AsyncSession,
    action: str,
    actor_user_id: int | None = None,
    actor_email: str = "",
    target_type: str | None = None,
    target_id: str | int | None = None,
    ip_address: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    try:
        db.add(AuditLog(
            action=action,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            ip_address=ip_address,
            detail=detail or {},
        ))
        await db.commit()
    except Exception:
        await db.rollback()


def client_ip(request) -> str | None:
    return request.client.host if request.client else None
