from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import client_ip, log_event
from app.core.database import get_db
from app.core.security import CurrentUserID
from app.crud import (
    add_project_member, create_project, get_project,
    get_project_members, list_label_classes, list_user_projects,
    update_project, create_label_class, create_batch, list_batches,
)
from app.models import Image, ImageBatch, MLModel, ProjectMember, ProjectRole
from app.schemas import (
    ImageBatchCreate, ImageBatchResponse, LabelClassCreate,
    LabelClassResponse, ProjectCreate, ProjectMemberAdd,
    ProjectMemberResponse, ProjectResponse, ProjectUpdate,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


async def check_project_access(project_id: int, user_id: int, db: AsyncSession) -> ProjectMember:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a project member")
    return member


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(user_id: CurrentUserID, db: DbDep) -> list[ProjectResponse]:
    projects = await list_user_projects(db, user_id)
    result = []
    for p in projects:
        mc = await db.scalar(select(func.count()).where(ProjectMember.project_id == p.id))
        ib_ids = await db.scalars(select(ImageBatch.id).where(ImageBatch.project_id == p.id))
        ic = await db.scalar(select(func.count()).where(Image.batch_id.in_(list(ib_ids))))
        r = ProjectResponse.model_validate(p)
        r.member_count = mc or 0
        r.image_count = ic or 0
        result.append(r)
    return result


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_new_project(
    payload: ProjectCreate, user_id: CurrentUserID, db: DbDep
) -> ProjectResponse:
    return await create_project(db, payload, user_id)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project_detail(project_id: int, user_id: CurrentUserID, db: DbDep) -> ProjectResponse:
    await check_project_access(project_id, user_id, db)
    project = await get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project_detail(
    project_id: int, payload: ProjectUpdate, user_id: CurrentUserID, db: DbDep
) -> ProjectResponse:
    member = await check_project_access(project_id, user_id, db)
    if member.role not in (ProjectRole.OWNER,):
        raise HTTPException(status_code=403, detail="Owner access required")
    project = await get_project(db, project_id)
    return await update_project(db, project, payload)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_detail(project_id: int, user_id: CurrentUserID, db: DbDep, request: Request) -> None:
    member = await check_project_access(project_id, user_id, db)
    if member.role not in (ProjectRole.OWNER,):
        raise HTTPException(status_code=403, detail="Owner access required")
    project = await get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project_name = project.name

    # Best-effort cleanup of files on disk — the DB rows (batches, images,
    # annotations, models, jobs) cascade automatically via the ORM/FK
    # relationships below, but nothing removes the actual files they point to.
    batch_ids = list(await db.scalars(select(ImageBatch.id).where(ImageBatch.project_id == project_id)))
    if batch_ids:
        images = await db.execute(select(Image).where(Image.batch_id.in_(batch_ids)))
        for img in images.scalars().all():
            try:
                Path(img.storage_path).unlink(missing_ok=True)
                if img.thumbnail_path:
                    Path(img.thumbnail_path).unlink(missing_ok=True)
            except Exception:
                pass

    models_result = await db.execute(select(MLModel).where(MLModel.project_id == project_id))
    for m in models_result.scalars().all():
        try:
            Path(m.model_path).unlink(missing_ok=True)
        except Exception:
            pass

    await db.delete(project)
    await db.commit()
    await log_event(db, "project_deleted", actor_user_id=user_id, target_type="project",
                     target_id=project_id, ip_address=client_ip(request), detail={"name": project_name})


# Members
@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
async def get_members(project_id: int, user_id: CurrentUserID, db: DbDep):
    await check_project_access(project_id, user_id, db)
    return await get_project_members(db, project_id)


@router.post("/{project_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: int, payload: ProjectMemberAdd, user_id: CurrentUserID, db: DbDep
):
    member = await check_project_access(project_id, user_id, db)
    if member.role not in (ProjectRole.OWNER,):
        raise HTTPException(status_code=403, detail="Owner access required")
    return await add_project_member(db, project_id, payload.user_id, payload.role)


# Label Classes
@router.get("/{project_id}/labels", response_model=list[LabelClassResponse])
async def get_labels(project_id: int, user_id: CurrentUserID, db: DbDep):
    await check_project_access(project_id, user_id, db)
    return await list_label_classes(db, project_id)


@router.post("/{project_id}/labels", response_model=LabelClassResponse, status_code=201)
async def create_label(
    project_id: int, payload: LabelClassCreate, user_id: CurrentUserID, db: DbDep
):
    await check_project_access(project_id, user_id, db)
    return await create_label_class(db, project_id, payload)


# Batches
@router.get("/{project_id}/batches", response_model=list[ImageBatchResponse])
async def get_batches(project_id: int, user_id: CurrentUserID, db: DbDep):
    await check_project_access(project_id, user_id, db)
    batches = await list_batches(db, project_id)
    result = []
    for b in batches:
        total = await db.scalar(select(func.count()).where(Image.batch_id == b.id)) or 0
        from app.models import ImageStatus
        annotated = await db.scalar(
            select(func.count()).where(Image.batch_id == b.id, Image.status == ImageStatus.ANNOTATED)
        ) or 0
        r = ImageBatchResponse.model_validate(b)
        r.image_count = total
        r.annotated_count = annotated
        result.append(r)
    return result


@router.post("/{project_id}/batches", response_model=ImageBatchResponse, status_code=201)
async def create_new_batch(
    project_id: int, payload: ImageBatchCreate, user_id: CurrentUserID, db: DbDep
):
    await check_project_access(project_id, user_id, db)
    return await create_batch(db, project_id, payload)
