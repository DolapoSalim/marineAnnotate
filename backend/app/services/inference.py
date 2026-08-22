"""
AI Inference Service
Runs YOLO inference on images and saves predictions as AI_SUGGESTION annotations.
Designed to be called from Celery tasks or directly for small batches.
"""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models import (
    AIJob, Annotation, AnnotationStatus, AnnotationType,
    Image, ImageBatch, ImageStatus, JobStatus, MLModel,
)
from datetime import datetime, timezone


async def run_inference_job(job_id: int) -> None:
    """Entry point called by Celery worker."""
    async with AsyncSessionLocal() as db:
        job = await db.get(AIJob, job_id)
        if not job:
            return

        job.status = JobStatus.RUNNING
        job.started_at = datetime.now(timezone.utc)
        await db.commit()

        try:
            model_record = await db.get(MLModel, job.model_id)
            batch = await db.get(ImageBatch, job.batch_id)

            if not model_record or not batch:
                raise ValueError("Model or batch not found")

            # Load YOLO model
            from ultralytics import YOLO
            yolo = YOLO(model_record.model_path)

            # Get pending images in the batch
            from sqlalchemy import select
            images_result = await db.execute(
                select(Image).where(
                    Image.batch_id == job.batch_id,
                    Image.status == ImageStatus.PENDING,
                )
            )
            images = list(images_result.scalars().all())

            total_suggestions = 0
            images_processed = 0
            images_skipped: list[str] = []
            class_mapping: dict[str, int] = model_record.class_mapping  # YOLO class_id -> label_class_id

            for img in images:
                if not Path(img.storage_path).exists():
                    images_skipped.append(f"{img.filename} (file missing)")
                    continue
                if img.width <= 0 or img.height <= 0:
                    # Thumbnailing failed at upload time and stored 0x0 — dividing
                    # by these below would crash the whole job, not just this image.
                    images_skipped.append(f"{img.filename} (unknown dimensions)")
                    continue

                try:
                    results = yolo(img.storage_path, conf=job.confidence_threshold, verbose=False)

                    for result in results:
                        boxes = result.boxes
                        if boxes is None:
                            continue

                        for box in boxes:
                            cls_id = int(box.cls[0].item())
                            conf = float(box.conf[0].item())
                            label_class_id = class_mapping.get(str(cls_id))

                            if label_class_id is None:
                                continue

                            # Convert xyxy to normalised xywh
                            x1, y1, x2, y2 = box.xyxy[0].tolist()
                            w_norm = (x2 - x1) / img.width
                            h_norm = (y2 - y1) / img.height
                            x_norm = x1 / img.width
                            y_norm = y1 / img.height

                            annotation = Annotation(
                                image_id=img.id,
                                label_class_id=label_class_id,
                                annotation_type=AnnotationType.BBOX,
                                status=AnnotationStatus.AI_SUGGESTION,
                                geometry={"x": x_norm, "y": y_norm, "w": w_norm, "h": h_norm},
                                confidence=conf,
                                created_by=job.created_by,
                            )
                            db.add(annotation)
                            total_suggestions += 1

                    img.status = ImageStatus.IN_PROGRESS
                    images_processed += 1
                except Exception as e:
                    # One bad image (corrupt file, decode error) shouldn't fail
                    # the whole batch — skip it and keep going.
                    images_skipped.append(f"{img.filename} ({e})")

            await db.commit()

            job.status = JobStatus.DONE
            job.finished_at = datetime.now(timezone.utc)
            job.result_summary = {
                "images_processed": images_processed,
                "total_suggestions": total_suggestions,
                "images_skipped": images_skipped,
            }
            await db.commit()

        except Exception as e:
            job.status = JobStatus.FAILED
            job.finished_at = datetime.now(timezone.utc)
            job.error_message = str(e)
            await db.commit()
            raise


from app.core.celery_app import celery_app  # noqa: E402


@celery_app.task(name="run_inference_job")
def run_inference_job_task(job_id: int) -> None:
    """
    Celery entry point. Celery task functions are called synchronously (one
    per worker process/thread) — this just runs the async implementation
    above to completion via its own fresh event loop. Kept as a thin wrapper
    so run_inference_job itself stays plain async code, independently
    testable without Celery in the loop.
    """
    import asyncio

    asyncio.run(run_inference_job(job_id))
