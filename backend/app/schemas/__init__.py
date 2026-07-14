from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models import (
    AnnotationStatus, AnnotationType, ImageStatus,
    JobStatus, JobType, ProjectRole, UserRole,
)


# ── Shared ───────────────────────────────────────────────────────────────────

class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Auth ─────────────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: int


# ── User ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8)
    role: UserRole = UserRole.ANNOTATOR
    avatar_color: str = "#1D9E75"

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=255)
    avatar_color: str | None = None
    is_active: bool | None = None
    role: UserRole | None = None


class UserResponse(OrmBase):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    avatar_color: str
    created_at: datetime
    last_login: datetime | None = None


# ── Project ───────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    is_archived: bool | None = None


class ProjectResponse(OrmBase):
    id: int
    name: str
    description: str
    created_by: int
    created_at: datetime
    updated_at: datetime
    is_archived: bool
    member_count: int = 0
    image_count: int = 0


class ProjectMemberAdd(BaseModel):
    user_id: int
    role: ProjectRole = ProjectRole.ANNOTATOR


class ProjectMemberResponse(OrmBase):
    id: int
    user_id: int
    project_id: int
    role: ProjectRole
    joined_at: datetime
    user: UserResponse


# ── Label Classes ─────────────────────────────────────────────────────────────

class LabelClassCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    supercategory: str | None = None
    color: str = "#EF9F27"
    description: str = ""
    annotation_type: AnnotationType = AnnotationType.BBOX
    sort_order: int = 0


class LabelClassResponse(OrmBase):
    id: int
    project_id: int
    name: str
    supercategory: str | None
    color: str
    description: str
    annotation_type: AnnotationType
    sort_order: int


# ── Image Batch & Images ──────────────────────────────────────────────────────

class ImageBatchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class ImageBatchResponse(OrmBase):
    id: int
    project_id: int
    name: str
    created_at: datetime
    image_count: int = 0
    annotated_count: int = 0


class ImageResponse(OrmBase):
    id: int
    batch_id: int
    filename: str
    width: int
    height: int
    file_size: int
    status: ImageStatus
    assigned_to: int | None
    uploaded_at: datetime
    annotation_count: int = 0
    thumbnail_url: str | None = None
    image_url: str | None = None


class ImageAssign(BaseModel):
    user_id: int | None = None


# ── Annotations ───────────────────────────────────────────────────────────────

class BBoxGeometry(BaseModel):
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    w: float = Field(ge=0.0, le=1.0)
    h: float = Field(ge=0.0, le=1.0)


class PolygonGeometry(BaseModel):
    points: list[list[float]]

    @field_validator("points")
    @classmethod
    def at_least_three(cls, v: list) -> list:
        if len(v) < 3:
            raise ValueError("Polygon must have at least 3 points")
        return v


class KeypointGeometry(BaseModel):
    points: list[dict[str, float]]


class AnnotationCreate(BaseModel):
    label_class_id: int
    annotation_type: AnnotationType
    geometry: dict[str, Any]
    status: AnnotationStatus = AnnotationStatus.MANUAL
    confidence: float | None = Field(None, ge=0.0, le=1.0)
    note: str = ""


class AnnotationUpdate(BaseModel):
    label_class_id: int | None = None
    geometry: dict[str, Any] | None = None
    status: AnnotationStatus | None = None
    note: str | None = None


class AnnotationResponse(OrmBase):
    id: int
    image_id: int
    label_class_id: int
    annotation_type: AnnotationType
    status: AnnotationStatus
    geometry: dict[str, Any]
    confidence: float | None
    created_by: int
    reviewed_by: int | None
    created_at: datetime
    updated_at: datetime
    note: str


class AIReviewAction(BaseModel):
    annotation_id: int
    action: str = Field(pattern="^(accept|edit|reject)$")
    geometry: dict[str, Any] | None = None
    label_class_id: int | None = None


# ── ML Models ─────────────────────────────────────────────────────────────────

class MLModelResponse(OrmBase):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: int
    project_id: int
    name: str
    description: str
    model_type: str
    is_active: bool
    uploaded_by: int
    uploaded_at: datetime
    metrics: dict[str, Any]
    class_mapping: dict[str, Any]


# ── AI Jobs ───────────────────────────────────────────────────────────────────

class AIJobCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_id: int
    batch_id: int
    job_type: JobType = JobType.INFERENCE
    confidence_threshold: float = Field(default=0.5, ge=0.1, le=1.0)


class AIJobResponse(OrmBase):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: int
    model_id: int
    batch_id: int
    job_type: JobType
    status: JobStatus
    created_by: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    result_summary: dict[str, Any]
    error_message: str
    confidence_threshold: float


# ── WebSocket events (broadcasted) ────────────────────────────────────────────

class WSEvent(BaseModel):
    event: str
    data: dict[str, Any]
    user_id: int
    project_id: int