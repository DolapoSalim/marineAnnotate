import os
import uuid
from pathlib import Path
from typing import Annotated

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image as PILImage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import CurrentUserID
from app.crud import get_image, list_images
from app.models import Image, ImageBatch, ImageStatus, ProjectMember
from app.schemas import ImageAssign, ImageResponse

router = APIRouter(prefix="/api/batches", tags=["images"])

DbDep = Annotated[AsyncSession, Depends(get_db)]

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/tiff", "image/webp"}
THUMB_SIZE = (256, 256)


async def _check_batch_access(batch_id: int, user_id: int, db: AsyncSession) -> ImageBatch:
    batch = await db.get(ImageBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == batch.project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a project member")
    return batch


@router.get("/{batch_id}/images", response_model=list[ImageResponse])
async def list_batch_images(
    batch_id: int,
    user_id: CurrentUserID,
    db: DbDep,
    skip: int = 0,
    limit: int = 50,
) -> list[ImageResponse]:
    await _check_batch_access(batch_id, user_id, db)
    images = await list_images(db, batch_id, skip=skip, limit=limit)
    result = []
    for img in images:
        from sqlalchemy import func
        from app.models import Annotation
        count = await db.scalar(
            select(func.count()).where(Annotation.image_id == img.id)
        ) or 0
        r = ImageResponse.model_validate(img)
        r.annotation_count = count
        r.image_url = f"/api/images/{img.id}/file"
        r.thumbnail_url = f"/api/images/{img.id}/thumbnail"
        result.append(r)
    return result


@router.post("/{batch_id}/images/upload", status_code=status.HTTP_201_CREATED)
async def upload_images(
    batch_id: int,
    user_id: CurrentUserID,
    db: DbDep,
    files: list[UploadFile] = File(...),
) -> dict:
    await _check_batch_access(batch_id, user_id, db)

    images_dir = Path(settings.IMAGES_PATH) / str(batch_id)
    thumbs_dir = images_dir / "thumbnails"
    images_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    created = []
    for upload in files:
        if upload.content_type not in ALLOWED_TYPES:
            continue
        content = await upload.read()
        if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            continue

        file_id = uuid.uuid4().hex
        ext = Path(upload.filename or "image.jpg").suffix.lower()
        filename = f"{file_id}{ext}"
        filepath = images_dir / filename
        thumbpath = thumbs_dir / f"{file_id}_thumb.jpg"

        async with aiofiles.open(filepath, "wb") as f:
            await f.write(content)

        # Generate thumbnail + get dimensions
        try:
            pil_img = PILImage.open(filepath)
            width, height = pil_img.size
            pil_img.thumbnail(THUMB_SIZE)
            pil_img.save(thumbpath, "JPEG", quality=85)
        except Exception:
            width, height = 0, 0

        img = Image(
            batch_id=batch_id,
            filename=upload.filename or filename,
            storage_path=str(filepath),
            thumbnail_path=str(thumbpath),
            width=width,
            height=height,
            file_size=len(content),
            status=ImageStatus.PENDING,
        )
        db.add(img)
        created.append(filename)

    await db.commit()
    return {"uploaded": len(created), "filenames": created}


@router.get("/{batch_id}/images/{image_id}", response_model=ImageResponse)
async def get_image_detail(
    batch_id: int, image_id: int, user_id: CurrentUserID, db: DbDep
) -> ImageResponse:
    await _check_batch_access(batch_id, user_id, db)
    img = await get_image(db, image_id)
    if not img or img.batch_id != batch_id:
        raise HTTPException(status_code=404, detail="Image not found")
    r = ImageResponse.model_validate(img)
    r.image_url = f"/api/images/{img.id}/file"
    r.thumbnail_url = f"/api/images/{img.id}/thumbnail"
    return r


@router.patch("/{batch_id}/images/{image_id}/assign")
async def assign_image(
    batch_id: int, image_id: int, payload: ImageAssign, user_id: CurrentUserID, db: DbDep
) -> dict:
    await _check_batch_access(batch_id, user_id, db)
    img = await get_image(db, image_id)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    img.assigned_to = payload.user_id
    await db.commit()
    return {"assigned_to": payload.user_id}


# Serve actual image files
images_router = APIRouter(prefix="/api/images", tags=["image-files"])


@images_router.get("/{image_id}/file")
async def serve_image(image_id: int, user_id: CurrentUserID, db: DbDep) -> FileResponse:
    img = await get_image(db, image_id)
    if not img or not os.path.exists(img.storage_path):
        raise HTTPException(status_code=404, detail="Image file not found")
    return FileResponse(img.storage_path)


@images_router.get("/{image_id}/thumbnail")
async def serve_thumbnail(image_id: int, user_id: CurrentUserID, db: DbDep) -> FileResponse:
    img = await get_image(db, image_id)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    path = img.thumbnail_path if img.thumbnail_path and os.path.exists(img.thumbnail_path) else img.storage_path
    return FileResponse(path)
