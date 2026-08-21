from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import AuditLog
from app.routers.users import AdminDep

router = APIRouter(prefix="/api/admin", tags=["admin"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


class AuditLogEntry(BaseModel):
    id: int
    created_at: datetime
    action: str
    actor_user_id: int | None
    actor_email: str
    target_type: str | None
    target_id: str | None
    ip_address: str | None
    detail: dict

    model_config = {"from_attributes": True}


@router.get("/audit-log", response_model=list[AuditLogEntry])
async def list_audit_log(admin_id: AdminDep, db: DbDep, skip: int = 0, limit: int = 100) -> list[AuditLog]:
    limit = min(limit, 200)
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all())
