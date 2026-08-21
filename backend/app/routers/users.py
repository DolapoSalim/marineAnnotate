from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import client_ip, log_event
from app.core.database import get_db
from app.core.security import CurrentUserID
from app.crud import create_user, get_user, list_users, update_user
from app.models import UserRole
from app.schemas import UserCreate, UserResponse, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


async def require_admin(user_id: CurrentUserID, db: DbDep) -> int:
    user = await get_user(db, user_id)
    if not user or user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user_id


AdminDep = Annotated[int, Depends(require_admin)]


@router.get("/", response_model=list[UserResponse])
async def list_all_users(admin_id: AdminDep, db: DbDep) -> list[UserResponse]:
    return await list_users(db)


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_new_user(payload: UserCreate, admin_id: AdminDep, db: DbDep, request: Request) -> UserResponse:
    from app.crud import get_user_by_email
    existing = await get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = await create_user(db, payload)
    await log_event(db, "user_created", actor_user_id=admin_id, target_type="user",
                     target_id=user.id, ip_address=client_ip(request),
                     detail={"email": user.email, "role": user.role.value})
    return user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_detail(user_id: int, current_user_id: CurrentUserID, db: DbDep) -> UserResponse:
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user_detail(
    user_id: int, payload: UserUpdate, admin_id: AdminDep, db: DbDep, request: Request
) -> UserResponse:
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    before = {"role": user.role.value, "is_active": user.is_active}
    updated = await update_user(db, user, payload)
    after = {"role": updated.role.value, "is_active": updated.is_active}
    if before != after:
        action = "user_role_changed" if before["role"] != after["role"] else "user_status_changed"
        await log_event(db, action, actor_user_id=admin_id, target_type="user",
                         target_id=user_id, ip_address=client_ip(request),
                         detail={"before": before, "after": after})
    return updated
