// ── Auth ─────────────────────────────────────────────────────────────────────
export interface Token {
  access_token: string;
  token_type: string;
}

// ── Users ─────────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'reviewer' | 'annotator';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_color: string;
  created_at: string;
  last_login: string | null;
}

// ── Projects ──────────────────────────────────────────────────────────────────
export type ProjectRole = 'owner' | 'reviewer' | 'annotator';

export interface Project {
  id: number;
  name: string;
  description: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  member_count: number;
  image_count: number;
}

export interface ProjectMember {
  id: number;
  user_id: number;
  project_id: number;
  role: ProjectRole;
  joined_at: string;
  user: User;
}

// ── Labels ────────────────────────────────────────────────────────────────────
export type AnnotationType = 'bbox' | 'polygon' | 'keypoint' | 'classification';

export interface LabelClass {
  id: number;
  project_id: number;
  name: string;
  supercategory: string | null;
  color: string;
  description: string;
  annotation_type: AnnotationType;
  sort_order: number;
}

// ── Images ────────────────────────────────────────────────────────────────────
export type ImageStatus = 'pending' | 'in_progress' | 'annotated' | 'reviewed' | 'skipped';

export interface ImageBatch {
  id: number;
  project_id: number;
  name: string;
  created_at: string;
  image_count: number;
  annotated_count: number;
}

export interface AnnotationImage {
  id: number;
  batch_id: number;
  filename: string;
  width: number;
  height: number;
  file_size: number;
  status: ImageStatus;
  assigned_to: number | null;
  uploaded_at: string;
  annotation_count: number;
  thumbnail_url: string | null;
  image_url: string | null;
}

// ── Annotations ───────────────────────────────────────────────────────────────
export type AnnotationStatus =
  | 'manual'
  | 'ai_suggestion'
  | 'ai_accepted'
  | 'ai_edited'
  | 'ai_rejected';

export interface BBoxGeometry {
  x: number; y: number; w: number; h: number;
}

export interface PolygonGeometry {
  points: [number, number][];
}

export interface KeypointGeometry {
  points: { x: number; y: number; v: number }[];
}

export type Geometry = BBoxGeometry | PolygonGeometry | KeypointGeometry | Record<string, never>;

export interface Annotation {
  id: number;
  image_id: number;
  label_class_id: number;
  annotation_type: AnnotationType;
  status: AnnotationStatus;
  geometry: Geometry;
  confidence: number | null;
  created_by: number;
  reviewed_by: number | null;
  created_at: string;
  updated_at: string;
  note: string;
}

export interface AIReviewAction {
  annotation_id: number;
  action: 'accept' | 'edit' | 'reject';
  geometry?: Geometry;
  label_class_id?: number;
}

// ── ML Models ─────────────────────────────────────────────────────────────────
export interface MLModel {
  id: number;
  project_id: number;
  name: string;
  description: string;
  model_type: string;
  is_active: boolean;
  uploaded_by: number;
  uploaded_at: string;
  metrics: Record<string, unknown>;
  class_mapping: Record<string, number>;
}

// ── AI Jobs ───────────────────────────────────────────────────────────────────
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type JobType = 'inference' | 'export' | 'training';

export interface AIJob {
  id: number;
  model_id: number;
  batch_id: number;
  job_type: JobType;
  status: JobStatus;
  created_by: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result_summary: Record<string, unknown>;
  error_message: string;
  confidence_threshold: number;
}

// ── WebSocket Events ──────────────────────────────────────────────────────────
export interface WSEvent {
  event: string;
  data: Record<string, unknown>;
  user_id?: number;
  project_id?: number;
}

// ── Canvas drawing state ──────────────────────────────────────────────────────
export type DrawingTool = 'select' | 'bbox' | 'polygon' | 'keypoint' | 'pan';

export interface CanvasState {
  tool: DrawingTool;
  selectedAnnotationId: number | null;
  zoom: number;
  panX: number;
  panY: number;
  isDrawing: boolean;
  drawingPoints: { x: number; y: number }[];
}
