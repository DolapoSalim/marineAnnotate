import os
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import CurrentUserID
from app.crud import create_ai_job, get_ai_job, list_ai_jobs, list_models
from app.models import ImageBatch, MLModel, ProjectMember
from app.schemas import AIJobCreate, AIJobResponse, MLModelResponse
from app.services.inference import run_inference_job

router = APIRouter(prefix="/api/projects", tags=["ai"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


async def _check_access(project_id: int, user_id: int, db: AsyncSession) -> None:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a project member")


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
    class_mapping: str = Form("{}"),  # JSON string: {"0": 1, "1": 2}
    file: UploadFile = File(...),
) -> MLModelResponse:
    await _check_access(project_id, user_id, db)

    models_dir = Path(settings.MODELS_PATH) / str(project_id)
    models_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}_{file.filename}"
    filepath = models_dir / filename

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    try:
        import json
        mapping = json.loads(class_mapping)
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

    # Verify model belongs to this project
    model = await db.get(MLModel, payload.model_id)
    if not model or model.project_id != project_id:
        raise HTTPException(status_code=404, detail="Model not found in this project")

    job = await create_ai_job(db, payload, user_id)

    # Run inference in background (use Celery in production)
    background_tasks.add_task(run_inference_job, job.id)

    return job


@router.get("/{project_id}/jobs/{job_id}", response_model=AIJobResponse)
async def get_job_status(project_id: int, job_id: int, user_id: CurrentUserID, db: DbDep):
    await _check_access(project_id, user_id, db)
    job = await get_ai_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
