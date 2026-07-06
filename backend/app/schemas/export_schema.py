from pydantic import BaseModel, Field


class SplitConfig(BaseModel):
    train: float = Field(default=0.7, ge=0.0, le=1.0)
    val: float = Field(default=0.2, ge=0.0, le=1.0)
    test: float = Field(default=0.1, ge=0.0, le=1.0)


class ExportRequest(BaseModel):
    batch_id: int
    format: str = Field(pattern="^(coco|yolo|yolo_seg|voc|csv)$")
    include_ai_suggestions: bool = False
    include_images: bool = True
    split: SplitConfig = SplitConfig()
