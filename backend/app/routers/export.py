"""
Export annotations for CNN training pipelines.

Format correctness notes:
- YOLO:      class cx cy w h (normalised 0-1). One .txt per image. data.yaml included.
             Images are bundled in images/train + images/val, labels in labels/train + labels/val
             — this is the exact folder structure `yolo train data=data.yaml` expects.
- YOLO seg:  Same structure, polygon points instead of bbox.
- COCO JSON: Pixel-space bbox [x,y,w,h]. category_id remapped to 1-based sequential ints.
             Images bundled at zip root alongside annotations.json (pycocotools convention).
- Pascal VOC: Pixel-space xmin/ymin/xmax/ymax in XML. Images bundled in images/, annotations in annotations/.
- CSV:        Pixel-space + normalised coords. Images bundled in images/ if requested.
"""
import csv
import io
import json
import random
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
from app.models import (
    Annotation, AnnotationStatus, AnnotationType,
    Image, ImageBatch, LabelClass, ProjectMember,
)
from app.schemas import ExportRequest

router = APIRouter(prefix="/api/export", tags=["export"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

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

    labels_result = await db.execute(
        select(LabelClass).where(LabelClass.project_id == batch.project_id)
        .order_by(LabelClass.sort_order, LabelClass.id)
    )
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


def _train_val_split(images: list[Image], val_split: float) -> tuple[set[int], set[int]]:
    """Deterministic shuffle (seeded) so repeated exports of the same batch are reproducible."""
    ids = [img.id for img in images]
    rng = random.Random(42)
    rng.shuffle(ids)
    n_val = max(1, int(len(ids) * val_split)) if len(ids) > 1 and val_split > 0 else 0
    val_ids = set(ids[:n_val])
    train_ids = set(ids[n_val:])
    return train_ids, val_ids


def _add_image_to_zip(zf: zipfile.ZipFile, img: Image, arcname: str) -> bool:
    """Add the actual image file bytes to the zip. Returns False if file missing."""
    p = Path(img.storage_path)
    if not p.exists():
        return False
    zf.write(p, arcname)
    return True


@router.post("/")
async def export_annotations(payload: ExportRequest, user_id: CurrentUserID, db: DbDep) -> StreamingResponse:
    batch, images, labels, annotations = await _load_batch_data(
        db, payload.batch_id, user_id, payload.include_ai_suggestions
    )
    if payload.format == "yolo":
        return _export_yolo(batch, images, labels, annotations, payload.include_images, payload.val_split)
    elif payload.format == "yolo_seg":
        return _export_yolo_seg(batch, images, labels, annotations, payload.include_images, payload.val_split)
    elif payload.format == "coco":
        return _export_coco(batch, images, labels, annotations, payload.include_images)
    elif payload.format == "voc":
        return _export_voc(images, labels, annotations, payload.include_images)
    elif payload.format == "csv":
        return _export_csv(images, labels, annotations, payload.include_images)
    else:
        raise HTTPException(status_code=400, detail="Unsupported format")


# ── YOLO Detection (bbox) ─────────────────────────────────────────────────────

def _export_yolo(batch, images, labels, annotations, include_images: bool, val_split: float) -> StreamingResponse:
    """
    Ultralytics YOLO detection format — ready to train with zero restructuring.
    Structure:
      images/train/<file>.jpg   images/val/<file>.jpg     (if include_images=True)
      labels/train/<stem>.txt   labels/val/<stem>.txt
      data.yaml                 — point `yolo train data=data.yaml` straight at this
      classes.txt
    """
    buf = io.BytesIO()
    id_to_idx = {lc_id: i for i, lc_id in enumerate(labels.keys())}
    class_names = [lc.name for lc in labels.values()]
    train_ids, val_ids = _train_val_split(images, val_split)

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        yaml_content = (
            f"path: .  # dataset root — unzip and point here\n"
            f"train: images/train\n"
            f"val: images/val\n\n"
            f"nc: {len(class_names)}\n"
            f"names: {json.dumps(class_names)}\n"
        )
        zf.writestr("data.yaml", yaml_content)
        zf.writestr("classes.txt", "\n".join(class_names))

        missing_images = []
        for img in images:
            split = "val" if img.id in val_ids else "train"
            stem = Path(img.filename).stem
            ext = Path(img.filename).suffix or ".jpg"

            lines = []
            for ann in annotations.get(img.id, []):
                if ann.annotation_type != AnnotationType.BBOX:
                    continue
                g = ann.geometry
                cx = g["x"] + g["w"] / 2.0
                cy = g["y"] + g["h"] / 2.0
                cls = id_to_idx.get(ann.label_class_id, 0)
                lines.append(f"{cls} {cx:.6f} {cy:.6f} {g['w']:.6f} {g['h']:.6f}")
            zf.writestr(f"labels/{split}/{stem}.txt", "\n".join(lines))

            if include_images:
                ok = _add_image_to_zip(zf, img, f"images/{split}/{stem}{ext}")
                if not ok:
                    missing_images.append(img.filename)

        if missing_images:
            zf.writestr("MISSING_IMAGES.txt",
                "These image files were not found on disk and could not be included:\n" +
                "\n".join(missing_images))

    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="yolo_detection.zip"'})


# ── YOLO Segmentation (polygon) ───────────────────────────────────────────────

def _export_yolo_seg(batch, images, labels, annotations, include_images: bool, val_split: float) -> StreamingResponse:
    """Ultralytics YOLOv8 segmentation format, same bundling approach as detection."""
    buf = io.BytesIO()
    id_to_idx = {lc_id: i for i, lc_id in enumerate(labels.keys())}
    class_names = [lc.name for lc in labels.values()]
    train_ids, val_ids = _train_val_split(images, val_split)

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        yaml_content = (
            f"path: .\ntrain: images/train\nval: images/val\n\n"
            f"nc: {len(class_names)}\nnames: {json.dumps(class_names)}\n"
        )
        zf.writestr("data.yaml", yaml_content)
        zf.writestr("classes.txt", "\n".join(class_names))

        missing_images = []
        for img in images:
            split = "val" if img.id in val_ids else "train"
            stem = Path(img.filename).stem
            ext = Path(img.filename).suffix or ".jpg"

            lines = []
            for ann in annotations.get(img.id, []):
                cls = id_to_idx.get(ann.label_class_id, 0)
                if ann.annotation_type == AnnotationType.POLYGON:
                    pts = ann.geometry.get("points", [])
                    flat = " ".join(f"{p[0]:.6f} {p[1]:.6f}" for p in pts)
                    lines.append(f"{cls} {flat}")
                elif ann.annotation_type == AnnotationType.BBOX:
                    g = ann.geometry
                    x1, y1 = g["x"], g["y"]
                    x2, y2 = x1 + g["w"], y1
                    x3, y3 = x1 + g["w"], y1 + g["h"]
                    x4, y4 = x1, y1 + g["h"]
                    lines.append(f"{cls} {x1:.6f} {y1:.6f} {x2:.6f} {y2:.6f} {x3:.6f} {y3:.6f} {x4:.6f} {y4:.6f}")
            zf.writestr(f"labels/{split}/{stem}.txt", "\n".join(lines))

            if include_images:
                ok = _add_image_to_zip(zf, img, f"images/{split}/{stem}{ext}")
                if not ok:
                    missing_images.append(img.filename)

        if missing_images:
            zf.writestr("MISSING_IMAGES.txt", "\n".join(missing_images))

    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="yolo_segmentation.zip"'})


# ── COCO JSON ────────────────────────────────────────────────────────────────

def _export_coco(batch, images, labels, annotations, include_images: bool) -> StreamingResponse:
    """
    MS COCO format. annotations.json + images/ folder, matching pycocotools'
    expected layout: COCO(annotation_file='annotations.json') with image_root='images/'.
    """
    id_to_coco_cat = {lc_id: i + 1 for i, lc_id in enumerate(labels.keys())}

    coco: dict = {
        "info": {"description": batch.name, "version": "1.0", "year": 2024, "contributor": "MarineAnnotate"},
        "licenses": [],
        "categories": [
            {"id": id_to_coco_cat[lc_id], "name": lc.name, "supercategory": lc.supercategory or "marine"}
            for lc_id, lc in labels.items()
        ],
        "images": [],
        "annotations": [],
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        ann_id = 1
        missing_images = []
        for img in images:
            W = max(img.width, 1)
            H = max(img.height, 1)
            coco["images"].append({
                "id": img.id, "file_name": img.filename, "width": W, "height": H,
                "license": 0, "flickr_url": "", "coco_url": "", "date_captured": "",
            })

            if include_images:
                ok = _add_image_to_zip(zf, img, f"images/{img.filename}")
                if not ok:
                    missing_images.append(img.filename)

            for ann in annotations.get(img.id, []):
                cat_id = id_to_coco_cat.get(ann.label_class_id)
                if cat_id is None:
                    continue
                if ann.annotation_type == AnnotationType.BBOX:
                    g = ann.geometry
                    x_px, y_px = g["x"] * W, g["y"] * H
                    w_px, h_px = g["w"] * W, g["h"] * H
                    bbox = [round(x_px, 2), round(y_px, 2), round(w_px, 2), round(h_px, 2)]
                    area = round(w_px * h_px, 2)
                    seg = [[x_px, y_px, x_px + w_px, y_px, x_px + w_px, y_px + h_px, x_px, y_px + h_px]]
                elif ann.annotation_type == AnnotationType.POLYGON:
                    pts = ann.geometry.get("points", [])
                    if len(pts) < 3:
                        continue
                    flat = [c for pt in pts for c in [round(pt[0] * W, 2), round(pt[1] * H, 2)]]
                    seg = [flat]
                    xs = [pt[0] * W for pt in pts]; ys = [pt[1] * H for pt in pts]
                    bx, by = min(xs), min(ys)
                    bw, bh = max(xs) - bx, max(ys) - by
                    bbox = [round(bx, 2), round(by, 2), round(bw, 2), round(bh, 2)]
                    area = round(bw * bh, 2)
                else:
                    continue

                coco["annotations"].append({
                    "id": ann_id, "image_id": img.id, "category_id": cat_id,
                    "segmentation": seg, "bbox": bbox, "area": area, "iscrowd": 0,
                })
                ann_id += 1

        zf.writestr("annotations.json", json.dumps(coco, indent=2))
        if missing_images:
            zf.writestr("MISSING_IMAGES.txt", "\n".join(missing_images))

    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="coco_dataset.zip"'})


# ── Pascal VOC ────────────────────────────────────────────────────────────────

def _export_voc(images, labels, annotations, include_images: bool) -> StreamingResponse:
    """Pascal VOC 2012 XML format with images/ + annotations/ folders."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        label_map_lines = ["item {", "  id: 0", "  name: '__background__'", "}"]
        for i, (lc_id, lc) in enumerate(labels.items(), start=1):
            label_map_lines += [f"item {{", f"  id: {i}", f"  name: '{lc.name}'", "}"]
        zf.writestr("label_map.pbtxt", "\n".join(label_map_lines))

        missing_images = []
        for img in images:
            W = max(img.width, 1)
            H = max(img.height, 1)
            root = Element("annotation")
            SubElement(root, "folder").text = "images"
            SubElement(root, "filename").text = img.filename
            SubElement(root, "path").text = f"images/{img.filename}"
            source = SubElement(root, "source")
            SubElement(source, "database").text = "MarineAnnotate"
            size = SubElement(root, "size")
            SubElement(size, "width").text = str(W)
            SubElement(size, "height").text = str(H)
            SubElement(size, "depth").text = "3"
            SubElement(root, "segmented").text = "0"

            for ann in annotations.get(img.id, []):
                if ann.annotation_type != AnnotationType.BBOX:
                    continue
                g = ann.geometry
                lc = labels.get(ann.label_class_id)
                obj = SubElement(root, "object")
                SubElement(obj, "name").text = lc.name if lc else "unknown"
                SubElement(obj, "pose").text = "Unspecified"
                SubElement(obj, "truncated").text = "0"
                SubElement(obj, "difficult").text = "0"
                bndbox = SubElement(obj, "bndbox")
                SubElement(bndbox, "xmin").text = str(max(0, int(g["x"] * W)))
                SubElement(bndbox, "ymin").text = str(max(0, int(g["y"] * H)))
                SubElement(bndbox, "xmax").text = str(min(W, int((g["x"] + g["w"]) * W)))
                SubElement(bndbox, "ymax").text = str(min(H, int((g["y"] + g["h"]) * H)))

            stem = Path(img.filename).stem
            zf.writestr(f"annotations/{stem}.xml", tostring(root, encoding="unicode"))

            if include_images:
                ok = _add_image_to_zip(zf, img, f"images/{img.filename}")
                if not ok:
                    missing_images.append(img.filename)

        if missing_images:
            zf.writestr("MISSING_IMAGES.txt", "\n".join(missing_images))

    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="voc_dataset.zip"'})


# ── CSV ───────────────────────────────────────────────────────────────────────

def _export_csv(images, labels, annotations, include_images: bool) -> StreamingResponse:
    """CSV + optional images/ folder bundled in a zip for custom Dataset classes."""
    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf)
    writer.writerow([
        "image_id", "filename", "img_width", "img_height",
        "label", "supercategory", "annotation_type",
        "x_norm", "y_norm", "w_norm", "h_norm",
        "x_px", "y_px", "w_px", "h_px",
        "polygon_points_norm", "confidence", "status",
    ])
    for img in images:
        W = max(img.width, 1)
        H = max(img.height, 1)
        for ann in annotations.get(img.id, []):
            lc = labels.get(ann.label_class_id)
            g = ann.geometry
            x_n = y_n = w_n = h_n = ""
            x_px = y_px = w_px = h_px = ""
            poly = ""
            if ann.annotation_type == AnnotationType.BBOX:
                x_n, y_n, w_n, h_n = g["x"], g["y"], g["w"], g["h"]
                x_px = round(g["x"] * W, 2); y_px = round(g["y"] * H, 2)
                w_px = round(g["w"] * W, 2); h_px = round(g["h"] * H, 2)
            elif ann.annotation_type == AnnotationType.POLYGON:
                pts = g.get("points", [])
                poly = json.dumps(pts)
                if pts:
                    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
                    x_n, y_n = min(xs), min(ys)
                    w_n, h_n = max(xs) - x_n, max(ys) - y_n
                    x_px = round(x_n * W, 2); y_px = round(y_n * H, 2)
                    w_px = round(w_n * W, 2); h_px = round(h_n * H, 2)
            writer.writerow([
                img.id, img.filename, W, H,
                lc.name if lc else "", lc.supercategory if lc else "",
                ann.annotation_type.value,
                x_n, y_n, w_n, h_n, x_px, y_px, w_px, h_px,
                poly, ann.confidence or "", ann.status.value,
            ])

    if not include_images:
        content = csv_buf.getvalue().encode("utf-8-sig")
        return StreamingResponse(io.BytesIO(content), media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="annotations.csv"'})

    # Bundle CSV + images into a zip
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("annotations.csv", csv_buf.getvalue().encode("utf-8-sig"))
        missing_images = []
        for img in images:
            ok = _add_image_to_zip(zf, img, f"images/{img.filename}")
            if not ok:
                missing_images.append(img.filename)
        if missing_images:
            zf.writestr("MISSING_IMAGES.txt", "\n".join(missing_images))

    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="csv_dataset.zip"'})