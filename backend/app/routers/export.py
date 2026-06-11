"""
Export annotations in COCO JSON, YOLO TXT, Pascal VOC XML, or CSV format.
"""
import csv
import io
import json
import zipfile
from pathlib import Path
from typing import Annotated
from xml.etree.ElementTree import Element, SubElement, tostring

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import CurrentUserID
from app.models import Annotation, AnnotationStatus, AnnotationType, Image, ImageBatch, LabelClass, ProjectMember
from app.schemas import ExportRequest

router = APIRouter(prefix="/api/export", tags=["export"])

DbDep = Annotated[AsyncSession, Depends(get_db)]

# Exclude unreviewed AI suggestions from export by default
EXPORTABLE_STATUSES = {
    AnnotationStatus.MANUAL,
    AnnotationStatus.AI_ACCEPTED,
    AnnotationStatus.AI_EDITED,
}


async def _load_batch_data(db: AsyncSession, batch_id: int, user_id: int, include_ai: bool = False):
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

    images_result = await db.execute(select(Image).where(Image.batch_id == batch_id))
    images = list(images_result.scalars().all())

    labels_result = await db.execute(select(LabelClass).where(LabelClass.project_id == batch.project_id))
    labels = {lc.id: lc for lc in labels_result.scalars().all()}

    statuses = EXPORTABLE_STATUSES | ({AnnotationStatus.AI_SUGGESTION} if include_ai else set())

    annotations: dict[int, list[Annotation]] = {}
    for img in images:
        ann_result = await db.execute(
            select(Annotation).where(
                Annotation.image_id == img.id,
                Annotation.status.in_(statuses),
            )
        )
        annotations[img.id] = list(ann_result.scalars().all())

    return batch, images, labels, annotations


@router.post("/")
async def export_annotations(
    payload: ExportRequest, user_id: CurrentUserID, db: DbDep
) -> StreamingResponse:
    batch, images, labels, annotations = await _load_batch_data(
        db, payload.batch_id, user_id, payload.include_ai_suggestions
    )

    if payload.format == "coco":
        return _export_coco(batch, images, labels, annotations)
    elif payload.format == "yolo":
        return _export_yolo(images, labels, annotations)
    elif payload.format == "voc":
        return _export_voc(images, labels, annotations)
    elif payload.format == "csv":
        return _export_csv(images, labels, annotations)
    else:
        raise HTTPException(status_code=400, detail="Unsupported format")


def _export_coco(batch, images, labels, annotations) -> StreamingResponse:
    coco = {
        "info": {"description": batch.name, "version": "1.0"},
        "licenses": [],
        "categories": [
            {"id": lc.id, "name": lc.name, "supercategory": lc.supercategory or ""}
            for lc in labels.values()
        ],
        "images": [],
        "annotations": [],
    }
    ann_id = 1
    for img in images:
        coco["images"].append({
            "id": img.id, "file_name": img.filename,
            "width": img.width, "height": img.height,
        })
        for ann in annotations.get(img.id, []):
            g = ann.geometry
            if ann.annotation_type == AnnotationType.BBOX:
                x = g["x"] * img.width
                y = g["y"] * img.height
                w = g["w"] * img.width
                h = g["h"] * img.height
                seg = [[x, y, x + w, y, x + w, y + h, x, y + h]]
                bbox = [x, y, w, h]
                area = w * h
            elif ann.annotation_type == AnnotationType.POLYGON:
                pts = g.get("points", [])
                flat = [c for pt in pts for c in [pt[0] * img.width, pt[1] * img.height]]
                seg = [flat]
                xs = [p[0] * img.width for p in pts]
                ys = [p[1] * img.height for p in pts]
                bbox = [min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)]
                area = bbox[2] * bbox[3]
            else:
                continue

            coco["annotations"].append({
                "id": ann_id, "image_id": img.id,
                "category_id": ann.label_class_id,
                "segmentation": seg, "bbox": bbox,
                "area": area, "iscrowd": 0,
            })
            ann_id += 1

    content = json.dumps(coco, indent=2).encode()
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="annotations_coco.json"'},
    )


def _export_yolo(images, labels, annotations) -> StreamingResponse:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Write label names
        names = "\n".join(f"{lc.name}" for lc in labels.values())
        zf.writestr("classes.txt", names)
        # Map label_class_id to 0-based index
        id_to_idx = {lc_id: i for i, lc_id in enumerate(labels.keys())}

        for img in images:
            lines = []
            for ann in annotations.get(img.id, []):
                if ann.annotation_type != AnnotationType.BBOX:
                    continue
                g = ann.geometry
                cx = g["x"] + g["w"] / 2
                cy = g["y"] + g["h"] / 2
                cls_idx = id_to_idx.get(ann.label_class_id, 0)
                lines.append(f"{cls_idx} {cx:.6f} {cy:.6f} {g['w']:.6f} {g['h']:.6f}")
            stem = Path(img.filename).stem
            zf.writestr(f"labels/{stem}.txt", "\n".join(lines))

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="annotations_yolo.zip"'},
    )


def _export_voc(images, labels, annotations) -> StreamingResponse:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for img in images:
            root = Element("annotation")
            SubElement(root, "filename").text = img.filename
            size = SubElement(root, "size")
            SubElement(size, "width").text = str(img.width)
            SubElement(size, "height").text = str(img.height)
            SubElement(size, "depth").text = "3"

            for ann in annotations.get(img.id, []):
                if ann.annotation_type != AnnotationType.BBOX:
                    continue
                g = ann.geometry
                lc = labels.get(ann.label_class_id)
                obj = SubElement(root, "object")
                SubElement(obj, "name").text = lc.name if lc else "unknown"
                SubElement(obj, "difficult").text = "0"
                bndbox = SubElement(obj, "bndbox")
                SubElement(bndbox, "xmin").text = str(int(g["x"] * img.width))
                SubElement(bndbox, "ymin").text = str(int(g["y"] * img.height))
                SubElement(bndbox, "xmax").text = str(int((g["x"] + g["w"]) * img.width))
                SubElement(bndbox, "ymax").text = str(int((g["y"] + g["h"]) * img.height))

            stem = Path(img.filename).stem
            zf.writestr(f"{stem}.xml", tostring(root, encoding="unicode"))

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="annotations_voc.zip"'},
    )


def _export_csv(images, labels, annotations) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "image_id", "filename", "label", "supercategory",
        "type", "x_norm", "y_norm", "w_norm", "h_norm",
        "confidence", "status",
    ])
    for img in images:
        for ann in annotations.get(img.id, []):
            lc = labels.get(ann.label_class_id)
            g = ann.geometry
            writer.writerow([
                img.id, img.filename,
                lc.name if lc else "", lc.supercategory if lc else "",
                ann.annotation_type.value,
                g.get("x", ""), g.get("y", ""), g.get("w", ""), g.get("h", ""),
                ann.confidence or "", ann.status.value,
            ])

    content = buf.getvalue().encode()
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="annotations.csv"'},
    )
