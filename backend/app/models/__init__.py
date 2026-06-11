from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Enum, Float, ForeignKey,
    Integer, String, Text, JSON, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    REVIEWER = "reviewer"
    ANNOTATOR = "annotator"


class ProjectRole(str, enum.Enum):
    OWNER = "owner"
    REVIEWER = "reviewer"
    ANNOTATOR = "annotator"


class AnnotationType(str, enum.Enum):
    BBOX = "bbox"
    POLYGON = "polygon"
    KEYPOINT = "keypoint"
    CLASSIFICATION = "classification"


class AnnotationStatus(str, enum.Enum):
    MANUAL = "manual"          # drawn by human
    AI_SUGGESTION = "ai_suggestion"  # AI predicted, not yet reviewed
    AI_ACCEPTED = "ai_accepted"      # confirmed as-is
    AI_EDITED = "ai_edited"          # corrected then accepted
    AI_REJECTED = "ai_rejected"      # discarded


class ImageStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    ANNOTATED = "annotated"
    REVIEWED = "reviewed"
    SKIPPED = "skipped"


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class JobType(str, enum.Enum):
    INFERENCE = "inference"
    EXPORT = "export"
    TRAINING = "training"


# ── Models ───────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.ANNOTATOR, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    avatar_color: Mapped[str] = mapped_column(String(7), default="#1D9E75")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    memberships: Mapped[list[ProjectMember]] = relationship(back_populates="user")
    annotations: Mapped[list[Annotation]] = relationship(back_populates="created_by_user")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    members: Mapped[list[ProjectMember]] = relationship(back_populates="project", cascade="all, delete-orphan")
    label_classes: Mapped[list[LabelClass]] = relationship(back_populates="project", cascade="all, delete-orphan")
    image_batches: Mapped[list[ImageBatch]] = relationship(back_populates="project", cascade="all, delete-orphan")
    models: Mapped[list[MLModel]] = relationship(back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[ProjectRole] = mapped_column(Enum(ProjectRole), default=ProjectRole.ANNOTATOR)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped[Project] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class LabelClass(Base):
    __tablename__ = "label_classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    supercategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    color: Mapped[str] = mapped_column(String(7), default="#EF9F27")
    description: Mapped[str] = mapped_column(Text, default="")
    annotation_type: Mapped[AnnotationType] = mapped_column(Enum(AnnotationType), default=AnnotationType.BBOX)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    project: Mapped[Project] = relationship(back_populates="label_classes")
    annotations: Mapped[list[Annotation]] = relationship(back_populates="label_class")


class ImageBatch(Base):
    __tablename__ = "image_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped[Project] = relationship(back_populates="image_batches")
    images: Mapped[list[Image]] = relationship(back_populates="batch", cascade="all, delete-orphan")


class Image(Base):
    __tablename__ = "images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("image_batches.id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    thumbnail_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, default=0)
    status: Mapped[ImageStatus] = mapped_column(Enum(ImageStatus), default=ImageStatus.PENDING)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)

    batch: Mapped[ImageBatch] = relationship(back_populates="images")
    annotations: Mapped[list[Annotation]] = relationship(back_populates="image", cascade="all, delete-orphan")


class Annotation(Base):
    __tablename__ = "annotations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True)
    label_class_id: Mapped[int] = mapped_column(ForeignKey("label_classes.id", ondelete="CASCADE"), nullable=False)
    annotation_type: Mapped[AnnotationType] = mapped_column(Enum(AnnotationType), nullable=False)
    status: Mapped[AnnotationStatus] = mapped_column(Enum(AnnotationStatus), default=AnnotationStatus.MANUAL)

    # Geometry — stored as JSON for flexibility across all types
    # bbox: {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4}  (normalised 0-1)
    # polygon: {"points": [[x1,y1],[x2,y2],...]}         (normalised 0-1)
    # keypoints: {"points": [{"x":0.1,"y":0.2,"v":2}]}  (v=visibility)
    # classification: {}
    geometry: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)  # AI confidence score
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    note: Mapped[str] = mapped_column(Text, default="")

    image: Mapped[Image] = relationship(back_populates="annotations")
    label_class: Mapped[LabelClass] = relationship(back_populates="annotations")
    created_by_user: Mapped[User] = relationship(foreign_keys=[created_by], back_populates="annotations")
    history: Mapped[list[AnnotationHistory]] = relationship(back_populates="annotation", cascade="all, delete-orphan")


class AnnotationHistory(Base):
    """Full history of every annotation change for rollback."""
    __tablename__ = "annotation_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    annotation_id: Mapped[int] = mapped_column(ForeignKey("annotations.id", ondelete="CASCADE"), nullable=False, index=True)
    changed_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    previous_geometry: Mapped[dict] = mapped_column(JSON, nullable=False)
    previous_status: Mapped[AnnotationStatus] = mapped_column(Enum(AnnotationStatus), nullable=False)
    previous_label_class_id: Mapped[int] = mapped_column(Integer, nullable=False)
    change_note: Mapped[str] = mapped_column(Text, default="")

    annotation: Mapped[Annotation] = relationship(back_populates="history")


class MLModel(Base):
    __tablename__ = "ml_models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    model_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    model_type: Mapped[str] = mapped_column(String(50), default="yolov9")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    class_mapping: Mapped[dict] = mapped_column(JSON, default=dict)

    project: Mapped[Project] = relationship(back_populates="models")
    jobs: Mapped[list[AIJob]] = relationship(back_populates="model")


class AIJob(Base):
    __tablename__ = "ai_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("ml_models.id", ondelete="CASCADE"), nullable=False)
    batch_id: Mapped[int] = mapped_column(ForeignKey("image_batches.id", ondelete="CASCADE"), nullable=False)
    job_type: Mapped[JobType] = mapped_column(Enum(JobType), nullable=False)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.QUEUED)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    result_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    error_message: Mapped[str] = mapped_column(Text, default="")
    confidence_threshold: Mapped[float] = mapped_column(Float, default=0.5)

    model: Mapped[MLModel] = relationship(back_populates="jobs")
