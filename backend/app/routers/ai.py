"""
AI router — patched for:
- Fix 4: model upload restricted to admin only; magic byte check; subprocess isolation note
- Fix 2: path traversal via safe_model_path
- Fix 8: chunked model file streaming
"""
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import CurrentUserID
from app.core.uploads import (
    MODEL_EXTENSIONS,
    _safe_extension,
    _verify_model_magic,
    safe_model_path,
    stream_to_disk,
)
from app.crud import create_ai_job, get_ai_job, list_ai_jobs, list_models
from app.models import ImageBatch, MLModel, ProjectMember, UserRole
from app.schemas import AIJobCreate, AIJobResponse, MLModelResponse
from app.services.inference import run_inference_job

router = APIRouter(prefix="/api/projects", tags=["ai"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

MAX_MODEL_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB max model size


async def _check_access(project_id: int, user_id: int, db: AsyncSession) -> None:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a project member")


async def _require_admin_or_owner(project_id: int, user_id: int, db: AsyncSession) -> None:
    """
    Fix 4: Model upload is restricted to admin users only.
    Arbitrary model execution is dangerous (pickle RCE) — only trusted admins
    who control the training pipeline should be able to upload models.
    """
    from app.crud import get_user
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=403, detail="User not found")
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Only admins can upload models (arbitrary model files pose a security risk)",
        )


# ── Model management ──────────────────────────────────────────────────────────

@router.get("/{project_id}/models", response_model=list[MLModelResponse])
async def get_models(project_id: int, user_id: CurrentUserID, db: DbDep):
    await _check_access(project_id, user_id, db)
    return await list_models(db, project_id)


@router.post("/{project_id}/models/upload", response_model=MLModelResponse, status_code=201)
async def upload_model(
    project_id: int,
    user_id: CurrentUserID,
    db: DbDep,
    name: str = Form(...),
    description: str = Form(""),
    model_type: str = Form("yolov9"),
    class_mapping: str = Form("{}"),
    file: UploadFile = File(...),
) -> MLModelResponse:
    # Fix 4: admin-only upload
    await _require_admin_or_owner(project_id, user_id, db)

    # Fix 2: validate extension
    try:
        ext = _safe_extension(file.filename or "model.pt", MODEL_EXTENSIONS)
    except HTTPException:
        raise HTTPException(400, "Only .pt or .pth model files are allowed")

    file_id = uuid.uuid4().hex
    models_root = Path(settings.MODELS_PATH)
    filepath = safe_model_path(models_root, project_id, file_id, ext)

    # Fix 8: stream to disk in chunks
    await stream_to_disk(file, filepath, MAX_MODEL_BYTES)

    # Fix 4: verify PyTorch magic bytes
    try:
        await _verify_model_magic(filepath)
    except HTTPException:
        filepath.unlink(missing_ok=True)
        raise

    try:
        import json
        mapping = json.loads(class_mapping)
        if not isinstance(mapping, dict):
            mapping = {}
    except Exception:
        mapping = {}

    model = MLModel(
        project_id=project_id,
        name=name,
        description=description,
        model_path=str(filepath),
        model_type=model_type,
        uploaded_by=user_id,
        class_mapping=mapping,
    )
    db.add(model)
    await db.commit()
    await db.refresh(model)
    return model


# ── Inference jobs ────────────────────────────────────────────────────────────

@router.get("/{project_id}/jobs", response_model=list[AIJobResponse])
async def get_jobs(project_id: int, user_id: CurrentUserID, db: DbDep):
    await _check_access(project_id, user_id, db)
    return await list_ai_jobs(db, project_id)


@router.post("/{project_id}/jobs", response_model=AIJobResponse, status_code=201)
async def create_job(
    project_id: int,
    payload: AIJobCreate,
    background_tasks: BackgroundTasks,
    user_id: CurrentUserID,
    db: DbDep,
) -> AIJobResponse:
    await _check_access(project_id, user_id, db)

    model = await db.get(MLModel, payload.model_id)
    if not model or model.project_id != project_id:
        raise HTTPException(status_code=404, detail="Model not found in this project")

    job = await create_ai_job(db, payload, user_id)
    background_tasks.add_task(run_inference_job, job.id)
    return job


@router.get("/{project_id}/jobs/{job_id}", response_model=AIJobResponse)
async def get_job_status(project_id: int, job_id: int, user_id: CurrentUserID, db: DbDep):
    await _check_access(project_id, user_id, db)
    job = await get_ai_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
