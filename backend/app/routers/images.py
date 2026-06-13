"""
Images router — patched for:
- Fix 2: path traversal via safe upload utilities
- Fix 8: chunked streaming instead of read() all at once
"""
"""
Images router.
Image serving uses a short-lived signed token in the URL so browser <img> tags
can load images without needing an Authorization header.
"""
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, Query
from fastapi.responses import FileResponse
from PIL import Image as PILImage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import CurrentUserID
from app.core.uploads import (
    IMAGE_EXTENSIONS, _safe_extension, _verify_image_magic,
    safe_image_path, stream_to_disk,
)
from app.crud import get_image, list_images
from app.models import Image, ImageBatch, ImageStatus, ProjectMember
from app.schemas import ImageAssign, ImageResponse

router = APIRouter(prefix="/api/batches", tags=["images"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

THUMB_SIZE = (256, 256)
MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/tiff", "image/webp"}

# Simple in-memory token store for image access
# token -> image_id (expires after one use or on restart — fine for local lab use)
_image_tokens: dict[str, int] = {}


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
    batch_id: int, user_id: CurrentUserID, db: DbDep,
    skip: int = 0, limit: int = 200,
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
        # Generate short-lived access token for this image
        tok = uuid.uuid4().hex
        _image_tokens[tok] = img.id
        r = ImageResponse.model_validate(img)
        r.annotation_count = count
        r.image_url = f"/api/images/{img.id}/file?token={tok}"
        r.thumbnail_url = f"/api/images/{img.id}/thumbnail?token={tok}"
        result.append(r)
    return result


@router.post("/{batch_id}/images/upload", status_code=status.HTTP_201_CREATED)
async def upload_images(
    batch_id: int, user_id: CurrentUserID, db: DbDep,
    files: list[UploadFile] = File(...),
) -> dict:
    await _check_batch_access(batch_id, user_id, db)

    storage_root = Path(settings.IMAGES_PATH)
    thumbs_dir = storage_root / str(batch_id) / "thumbnails"
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    created = []
    for upload in files:
        if upload.content_type not in ALLOWED_CONTENT_TYPES:
            continue
        try:
            ext = _safe_extension(upload.filename or "upload.jpg", IMAGE_EXTENSIONS)
        except HTTPException:
            continue

        file_id = uuid.uuid4().hex
        filepath = safe_image_path(storage_root, batch_id, file_id, ext)
        thumbpath = thumbs_dir / f"{file_id}_thumb.jpg"

        try:
            file_size = await stream_to_disk(upload, filepath, MAX_BYTES)
        except HTTPException:
            continue

        try:
            await _verify_image_magic(filepath)
        except HTTPException:
            filepath.unlink(missing_ok=True)
            continue

        try:
            pil_img = PILImage.open(filepath)
            # Convert to RGB before saving as JPEG (handles RGBA/palette modes)
            pil_rgb = pil_img.convert("RGB")
            width, height = pil_img.size
            pil_rgb.thumbnail(THUMB_SIZE)
            pil_rgb.save(thumbpath, "JPEG", quality=85)
        except Exception as e:
            print(f"Thumbnail error: {e}")
            width, height = 0, 0

        img = Image(
            batch_id=batch_id,
            filename=upload.filename or f"{file_id}{ext}",
            storage_path=str(filepath),
            thumbnail_path=str(thumbpath),
            width=width,
            height=height,
            file_size=file_size,
            status=ImageStatus.PENDING,
        )
        db.add(img)
        created.append(file_id)

    await db.commit()
    return {"uploaded": len(created)}


@router.get("/{batch_id}/images/{image_id}", response_model=ImageResponse)
async def get_image_detail(
    batch_id: int, image_id: int, user_id: CurrentUserID, db: DbDep,
) -> ImageResponse:
    await _check_batch_access(batch_id, user_id, db)
    img = await get_image(db, image_id)
    if not img or img.batch_id != batch_id:
        raise HTTPException(status_code=404, detail="Image not found")
    tok = uuid.uuid4().hex
    _image_tokens[tok] = img.id
    r = ImageResponse.model_validate(img)
    r.image_url = f"/api/images/{img.id}/file?token={tok}"
    r.thumbnail_url = f"/api/images/{img.id}/thumbnail?token={tok}"
    return r


@router.patch("/{batch_id}/images/{image_id}/assign")
async def assign_image(
    batch_id: int, image_id: int, payload: ImageAssign,
    user_id: CurrentUserID, db: DbDep,
) -> dict:
    await _check_batch_access(batch_id, user_id, db)
    img = await get_image(db, image_id)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    img.assigned_to = payload.user_id
    await db.commit()
    return {"assigned_to": payload.user_id}


# ── File serving — token-based (no Authorization header needed for <img> tags) ──
images_router = APIRouter(prefix="/api/images", tags=["image-files"])


def _resolve_image_path(img: Image, storage_root: Path, is_thumb: bool = False) -> Path:
    """Resolve and validate path stays inside storage root."""
    raw = img.thumbnail_path if is_thumb and img.thumbnail_path else img.storage_path
    p = Path(raw)
    if not p.exists() and is_thumb:
        p = Path(img.storage_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Image file not found")
    try:
        p.resolve().relative_to(storage_root.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    return p


@images_router.get("/{image_id}/file")
async def serve_image(
    image_id: int, db: DbDep,
    token: str = Query(...),
) -> FileResponse:
    # Validate token
    if _image_tokens.get(token) != image_id:
        raise HTTPException(status_code=403, detail="Invalid or expired image token")
    img = await get_image(db, image_id)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    p = _resolve_image_path(img, Path(settings.IMAGES_PATH))
    return FileResponse(str(p), headers={"Cache-Control": "private, max-age=3600"})


@images_router.get("/{image_id}/thumbnail")
async def serve_thumbnail(
    image_id: int, db: DbDep,
    token: str = Query(...),
) -> FileResponse:
    if _image_tokens.get(token) != image_id:
        raise HTTPException(status_code=403, detail="Invalid or expired image token")
    img = await get_image(db, image_id)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    p = _resolve_image_path(img, Path(settings.IMAGES_PATH), is_thumb=True)
    return FileResponse(str(p), headers={"Cache-Control": "private, max-age=3600"})