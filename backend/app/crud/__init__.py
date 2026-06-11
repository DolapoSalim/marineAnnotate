from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password
from app.models import (
    Annotation, AnnotationHistory, AnnotationStatus, Image,
    ImageBatch, LabelClass, MLModel, Project, ProjectMember,
    ProjectRole, User, AIJob,
)
from app.schemas import (
    AnnotationCreate, AnnotationUpdate, ImageBatchCreate,
    LabelClassCreate, ProjectCreate, ProjectUpdate,
    UserCreate, UserUpdate, AIJobCreate,
)


# ── Users ─────────────────────────────────────────────────────────────────────

async def get_user(db: AsyncSession, user_id: int) -> User | None:
    return await db.get(User, user_id)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def list_users(db: AsyncSession, skip: int = 0, limit: int = 100) -> list[User]:
    result = await db.execute(select(User).offset(skip).limit(limit))
    return list(result.scalars().all())


async def create_user(db: AsyncSession, payload: UserCreate) -> User:
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        avatar_color=payload.avatar_color,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(db: AsyncSession, user: User, payload: UserUpdate) -> User:
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


# ── Projects ──────────────────────────────────────────────────────────────────

async def create_project(db: AsyncSession, payload: ProjectCreate, owner_id: int) -> Project:
    project = Project(name=payload.name, description=payload.description, created_by=owner_id)
    db.add(project)
    await db.flush()
    member = ProjectMember(project_id=project.id, user_id=owner_id, role=ProjectRole.OWNER)
    db.add(member)
    await db.commit()
    await db.refresh(project)
    return project


async def get_project(db: AsyncSession, project_id: int) -> Project | None:
    return await db.get(Project, project_id)


async def list_user_projects(db: AsyncSession, user_id: int) -> list[Project]:
    result = await db.execute(
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user_id, Project.is_archived == False)
        .order_by(Project.updated_at.desc())
    )
    return list(result.scalars().all())


async def update_project(db: AsyncSession, project: Project, payload: ProjectUpdate) -> Project:
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return project


async def add_project_member(db: AsyncSession, project_id: int, user_id: int, role: ProjectRole) -> ProjectMember:
    member = ProjectMember(project_id=project_id, user_id=user_id, role=role)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


async def get_project_members(db: AsyncSession, project_id: int) -> list[ProjectMember]:
    result = await db.execute(
        select(ProjectMember)
        .where(ProjectMember.project_id == project_id)
        .options(selectinload(ProjectMember.user))
    )
    return list(result.scalars().all())


# ── Label Classes ─────────────────────────────────────────────────────────────

async def create_label_class(db: AsyncSession, project_id: int, payload: LabelClassCreate) -> LabelClass:
    lc = LabelClass(project_id=project_id, **payload.model_dump())
    db.add(lc)
    await db.commit()
    await db.refresh(lc)
    return lc


async def list_label_classes(db: AsyncSession, project_id: int) -> list[LabelClass]:
    result = await db.execute(
        select(LabelClass).where(LabelClass.project_id == project_id).order_by(LabelClass.sort_order)
    )
    return list(result.scalars().all())


# ── Image Batches & Images ────────────────────────────────────────────────────

async def create_batch(db: AsyncSession, project_id: int, payload: ImageBatchCreate) -> ImageBatch:
    batch = ImageBatch(project_id=project_id, name=payload.name)
    db.add(batch)
    await db.commit()
    await db.refresh(batch)
    return batch


async def list_batches(db: AsyncSession, project_id: int) -> list[ImageBatch]:
    result = await db.execute(select(ImageBatch).where(ImageBatch.project_id == project_id))
    return list(result.scalars().all())


async def list_images(
    db: AsyncSession, batch_id: int, skip: int = 0, limit: int = 50
) -> list[Image]:
    result = await db.execute(
        select(Image).where(Image.batch_id == batch_id).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


async def get_image(db: AsyncSession, image_id: int) -> Image | None:
    return await db.get(Image, image_id)


# ── Annotations ───────────────────────────────────────────────────────────────

async def list_annotations(db: AsyncSession, image_id: int) -> list[Annotation]:
    result = await db.execute(
        select(Annotation).where(Annotation.image_id == image_id)
    )
    return list(result.scalars().all())


async def create_annotation(
    db: AsyncSession, image_id: int, payload: AnnotationCreate, user_id: int
) -> Annotation:
    ann = Annotation(
        image_id=image_id,
        created_by=user_id,
        **payload.model_dump(),
    )
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return ann


async def update_annotation(
    db: AsyncSession, annotation: Annotation, payload: AnnotationUpdate, user_id: int
) -> Annotation:
    # Save history before mutating
    history = AnnotationHistory(
        annotation_id=annotation.id,
        changed_by=user_id,
        previous_geometry=annotation.geometry,
        previous_status=annotation.status,
        previous_label_class_id=annotation.label_class_id,
    )
    db.add(history)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(annotation, field, value)

    await db.commit()
    await db.refresh(annotation)
    return annotation


async def delete_annotation(db: AsyncSession, annotation: Annotation) -> None:
    await db.delete(annotation)
    await db.commit()


async def bulk_review_ai_suggestions(
    db: AsyncSession,
    reviews: list[dict],
    reviewer_id: int,
) -> list[Annotation]:
    updated = []
    for review in reviews:
        ann = await db.get(Annotation, review["annotation_id"])
        if ann is None:
            continue

        history = AnnotationHistory(
            annotation_id=ann.id,
            changed_by=reviewer_id,
            previous_geometry=ann.geometry,
            previous_status=ann.status,
            previous_label_class_id=ann.label_class_id,
        )
        db.add(history)

        action = review["action"]
        if action == "accept":
            ann.status = AnnotationStatus.AI_ACCEPTED
            ann.reviewed_by = reviewer_id
        elif action == "edit":
            ann.status = AnnotationStatus.AI_EDITED
            ann.reviewed_by = reviewer_id
            if review.get("geometry"):
                ann.geometry = review["geometry"]
            if review.get("label_class_id"):
                ann.label_class_id = review["label_class_id"]
        elif action == "reject":
            ann.status = AnnotationStatus.AI_REJECTED
            ann.reviewed_by = reviewer_id

        updated.append(ann)

    await db.commit()
    for ann in updated:
        await db.refresh(ann)
    return updated


# ── ML Models ─────────────────────────────────────────────────────────────────

async def list_models(db: AsyncSession, project_id: int) -> list[MLModel]:
    result = await db.execute(
        select(MLModel).where(MLModel.project_id == project_id, MLModel.is_active == True)
    )
    return list(result.scalars().all())


async def get_model(db: AsyncSession, model_id: int) -> MLModel | None:
    return await db.get(MLModel, model_id)


# ── AI Jobs ───────────────────────────────────────────────────────────────────

async def create_ai_job(db: AsyncSession, payload: AIJobCreate, user_id: int) -> AIJob:
    job = AIJob(created_by=user_id, **payload.model_dump())
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def get_ai_job(db: AsyncSession, job_id: int) -> AIJob | None:
    return await db.get(AIJob, job_id)


async def list_ai_jobs(db: AsyncSession, project_id: int) -> list[AIJob]:
    result = await db.execute(
        select(AIJob)
        .join(MLModel, AIJob.model_id == MLModel.id)
        .where(MLModel.project_id == project_id)
        .order_by(AIJob.created_at.desc())
    )
    return list(result.scalars().all())
