from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import CurrentUserID
from app.crud import (
    bulk_review_ai_suggestions, create_annotation, delete_annotation,
    get_image, list_annotations, update_annotation,
)
from app.models import Annotation, ImageStatus, ProjectMember, ImageBatch
from app.schemas import (
    AIReviewAction, AnnotationCreate, AnnotationResponse, AnnotationUpdate,
)
from app.services.websocket import manager

router = APIRouter(prefix="/api/images", tags=["annotations"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


async def _get_image_with_access(image_id: int, user_id: int, db: AsyncSession):
    img = await get_image(db, image_id)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    batch = await db.get(ImageBatch, img.batch_id)
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == batch.project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a project member")
    return img, batch


@router.get("/{image_id}/annotations", response_model=list[AnnotationResponse])
async def get_annotations(image_id: int, user_id: CurrentUserID, db: DbDep):
    img, _ = await _get_image_with_access(image_id, user_id, db)
    return await list_annotations(db, image_id)


@router.post("/{image_id}/annotations", response_model=AnnotationResponse, status_code=201)
async def create_ann(
    image_id: int, payload: AnnotationCreate, user_id: CurrentUserID, db: DbDep
) -> AnnotationResponse:
    img, batch = await _get_image_with_access(image_id, user_id, db)

    # Update image status to in_progress when first annotation is created
    if img.status == ImageStatus.PENDING:
        img.status = ImageStatus.IN_PROGRESS
        await db.commit()

    ann = await create_annotation(db, image_id, payload, user_id)

    # Broadcast to collaborators
    await manager.broadcast_to_project(
        batch.project_id,
        {"event": "annotation_created", "data": {"image_id": image_id, "annotation_id": ann.id}},
        exclude_user=user_id,
    )
    return ann


@router.patch("/{image_id}/annotations/{ann_id}", response_model=AnnotationResponse)
async def update_ann(
    image_id: int, ann_id: int, payload: AnnotationUpdate, user_id: CurrentUserID, db: DbDep
) -> AnnotationResponse:
    img, batch = await _get_image_with_access(image_id, user_id, db)
    ann = await db.get(Annotation, ann_id)
    if not ann or ann.image_id != image_id:
        raise HTTPException(status_code=404, detail="Annotation not found")

    updated = await update_annotation(db, ann, payload, user_id)

    await manager.broadcast_to_project(
        batch.project_id,
        {"event": "annotation_updated", "data": {"image_id": image_id, "annotation_id": ann_id}},
        exclude_user=user_id,
    )
    return updated


@router.delete("/{image_id}/annotations/{ann_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ann(image_id: int, ann_id: int, user_id: CurrentUserID, db: DbDep):
    img, batch = await _get_image_with_access(image_id, user_id, db)
    ann = await db.get(Annotation, ann_id)
    if not ann or ann.image_id != image_id:
        raise HTTPException(status_code=404, detail="Annotation not found")
    await delete_annotation(db, ann)
    await manager.broadcast_to_project(
        batch.project_id,
        {"event": "annotation_deleted", "data": {"image_id": image_id, "annotation_id": ann_id}},
        exclude_user=user_id,
    )


@router.post("/{image_id}/annotations/review", response_model=list[AnnotationResponse])
async def review_ai_suggestions(
    image_id: int,
    reviews: list[AIReviewAction],
    user_id: CurrentUserID,
    db: DbDep,
) -> list[AnnotationResponse]:
    """Bulk accept / edit / reject AI predictions for one image."""
    img, batch = await _get_image_with_access(image_id, user_id, db)
    updated = await bulk_review_ai_suggestions(
        db, [r.model_dump() for r in reviews], user_id
    )
    await manager.broadcast_to_project(
        batch.project_id,
        {"event": "ai_review_complete", "data": {"image_id": image_id}},
        exclude_user=user_id,
    )
    return updated


@router.post("/{image_id}/complete", status_code=200)
async def mark_image_complete(image_id: int, user_id: CurrentUserID, db: DbDep) -> dict:
    img, _ = await _get_image_with_access(image_id, user_id, db)
    img.status = ImageStatus.ANNOTATED
    await db.commit()
    return {"status": "annotated"}
