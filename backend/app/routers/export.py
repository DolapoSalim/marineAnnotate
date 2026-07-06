"""
Export annotations for CNN training — with actual image files bundled.
Train / Val / Test 3-way split for YOLO formats.
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
from app.schemas.export_schema import ExportRequest

router = APIRouter(prefix="/api/export", tags=["export"])
DbDep = Annotated[AsyncSession, Depends(get_db)]

EXPORTABLE_STATUSES = {
    AnnotationStatus.MANUAL,
    AnnotationStatus.AI_ACCEPTED,
    AnnotationStatus.AI_EDITED,
}


async def _load_batch_data(db, batch_id, user_id, include_ai=False):
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
        select(LabelClass)
        .where(LabelClass.project_id == batch.project_id)
        .order_by(LabelClass.sort_order, LabelClass.id)
    )
    labels = {lc.id: lc for lc in labels_result.scalars().all()}

    statuses = EXPORTABLE_STATUSES | ({AnnotationStatus.AI_SUGGESTION} if include_ai else set())
    annotations: dict[int, list] = {}
    for img in images:
        ann_result = await db.execute(
            select(Annotation).where(
                Annotation.image_id == img.id,
                Annotation.status.in_(statuses),
            )
        )
        annotations[img.id] = list(ann_result.scalars().all())

    return batch, images, labels, annotations


def _three_way_split(images, train_r, val_r, test_r):
    """Deterministic reproducible train/val/test split."""
    total = train_r + val_r + test_r
    if total == 0:
        return {img.id: "train" for img in images}
    ids = [img.id for img in images]
    rng = random.Random(42)
    rng.shuffle(ids)
    n = len(ids)
    n_test = max(0, round(n * test_r / total))
    n_val  = max(0, round(n * val_r  / total))
    n_train = n - n_test - n_val
    split_map = {}
    for i, img_id in enumerate(ids):
        if i < n_train:
            split_map[img_id] = "train"
        elif i < n_train + n_val:
            split_map[img_id] = "val"
        else:
            split_map[img_id] = "test"
    return split_map


def _add_image(zf, img, arcname):
    p = Path(img.storage_path)
    if p.exists():
        zf.write(p, arcname)
        return True
    return False


@router.post("/")
async def export_annotations(
    payload: ExportRequest, user_id: CurrentUserID, db: DbDep
) -> StreamingResponse:
    batch, images, labels, annotations = await _load_batch_data(
        db, payload.batch_id, user_id, payload.include_ai_suggestions
    )
    sp = payload.split
    split_map = _three_way_split(images, sp.train, sp.val, sp.test)

    if payload.format == "yolo":
        return _yolo(batch, images, labels, annotations, split_map, payload.include_images)
    elif payload.format == "yolo_seg":
        return _yolo_seg(batch, images, labels, annotations, split_map, payload.include_images)
    elif payload.format == "coco":
        return _coco(batch, images, labels, annotations, payload.include_images)
    elif payload.format == "voc":
        return _voc(images, labels, annotations, payload.include_images)
    elif payload.format == "csv":
        return _csv(images, labels, annotations, payload.include_images)
    raise HTTPException(status_code=400, detail="Unsupported format")


def _yolo(batch, images, labels, annotations, split_map, include_images):
    buf = io.BytesIO()
    id_to_idx = {lc_id: i for i, lc_id in enumerate(labels.keys())}
    names = [lc.name for lc in labels.values()]

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # data.yaml — plug straight into yolo train data=data.yaml
        has_test = any(s == "test" for s in split_map.values())
        yaml = (
            f"path: .\n"
            f"train: images/train\n"
            f"val: images/val\n"
            + (f"test: images/test\n" if has_test else "")
            + f"\nnc: {len(names)}\nnames: {json.dumps(names)}\n"
        )
        zf.writestr("data.yaml", yaml)
        zf.writestr("classes.txt", "\n".join(names))

        missing = []
        for img in images:
            split = split_map.get(img.id, "train")
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
                ok = _add_image(zf, img, f"images/{split}/{stem}{ext}")
                if not ok:
                    missing.append(img.filename)

        if missing:
            zf.writestr("MISSING_IMAGES.txt", "\n".join(missing))

    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="yolo_detection.zip"'})


def _yolo_seg(batch, images, labels, annotations, split_map, include_images):
    buf = io.BytesIO()
    id_to_idx = {lc_id: i for i, lc_id in enumerate(labels.keys())}
    names = [lc.name for lc in labels.values()]

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        has_test = any(s == "test" for s in split_map.values())
        yaml = (
            f"path: .\ntrain: images/train\nval: images/val\n"
            + (f"test: images/test\n" if has_test else "")
            + f"\nnc: {len(names)}\nnames: {json.dumps(names)}\n"
        )
        zf.writestr("data.yaml", yaml)
        zf.writestr("classes.txt", "\n".join(names))

        missing = []
        for img in images:
            split = split_map.get(img.id, "train")
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
                ok = _add_image(zf, img, f"images/{split}/{stem}{ext}")
                if not ok:
                    missing.append(img.filename)
        if missing:
            zf.writestr("MISSING_IMAGES.txt", "\n".join(missing))

    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="yolo_segmentation.zip"'})


def _coco(batch, images, labels, annotations, include_images):
    id_to_cat = {lc_id: i + 1 for i, lc_id in enumerate(labels.keys())}
    coco = {
        "info": {"description": batch.name, "version": "1.0"},
        "categories": [
            {"id": id_to_cat[lc_id], "name": lc.name, "supercategory": lc.supercategory or "marine"}
            for lc_id, lc in labels.items()
        ],
        "images": [], "annotations": [],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        ann_id = 1
        missing = []
        for img in images:
            W, H = max(img.width, 1), max(img.height, 1)
            coco["images"].append({"id": img.id, "file_name": img.filename, "width": W, "height": H})
            if include_images:
                ok = _add_image(zf, img, f"images/{img.filename}")
                if not ok:
                    missing.append(img.filename)
            for ann in annotations.get(img.id, []):
                cat_id = id_to_cat.get(ann.label_class_id)
                if not cat_id:
                    continue
                if ann.annotation_type == AnnotationType.BBOX:
                    g = ann.geometry
                    xp, yp, wp, hp = g["x"]*W, g["y"]*H, g["w"]*W, g["h"]*H
                    bbox = [round(xp,2), round(yp,2), round(wp,2), round(hp,2)]
                    seg = [[xp, yp, xp+wp, yp, xp+wp, yp+hp, xp, yp+hp]]
                    area = round(wp * hp, 2)
                elif ann.annotation_type == AnnotationType.POLYGON:
                    pts = ann.geometry.get("points", [])
                    if len(pts) < 3:
                        continue
                    flat = [c for pt in pts for c in [round(pt[0]*W,2), round(pt[1]*H,2)]]
                    seg = [flat]
                    xs, ys = [pt[0]*W for pt in pts], [pt[1]*H for pt in pts]
                    bx, by = min(xs), min(ys)
                    bw, bh = max(xs)-bx, max(ys)-by
                    bbox = [round(bx,2), round(by,2), round(bw,2), round(bh,2)]
                    area = round(bw*bh, 2)
                else:
                    continue
                coco["annotations"].append({
                    "id": ann_id, "image_id": img.id, "category_id": cat_id,
                    "segmentation": seg, "bbox": bbox, "area": area, "iscrowd": 0,
                })
                ann_id += 1
        zf.writestr("annotations.json", json.dumps(coco, indent=2))
        if missing:
            zf.writestr("MISSING_IMAGES.txt", "\n".join(missing))

    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="coco_dataset.zip"'})


def _voc(images, labels, annotations, include_images):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        label_map = ["item {\n  id: 0\n  name: '__background__'\n}"]
        for i, (lc_id, lc) in enumerate(labels.items(), 1):
            label_map.append(f"item {{\n  id: {i}\n  name: '{lc.name}'\n}}")
        zf.writestr("label_map.pbtxt", "\n".join(label_map))

        missing = []
        for img in images:
            W, H = max(img.width, 1), max(img.height, 1)
            root = Element("annotation")
            SubElement(root, "filename").text = img.filename
            size = SubElement(root, "size")
            SubElement(size, "width").text = str(W)
            SubElement(size, "height").text = str(H)
            SubElement(size, "depth").text = "3"
            for ann in annotations.get(img.id, []):
                if ann.annotation_type != AnnotationType.BBOX:
                    continue
                g, lc = ann.geometry, labels.get(ann.label_class_id)
                obj = SubElement(root, "object")
                SubElement(obj, "name").text = lc.name if lc else "unknown"
                SubElement(obj, "difficult").text = "0"
                bb = SubElement(obj, "bndbox")
                SubElement(bb, "xmin").text = str(max(0, int(g["x"]*W)))
                SubElement(bb, "ymin").text = str(max(0, int(g["y"]*H)))
                SubElement(bb, "xmax").text = str(min(W, int((g["x"]+g["w"])*W)))
                SubElement(bb, "ymax").text = str(min(H, int((g["y"]+g["h"])*H)))
            zf.writestr(f"annotations/{Path(img.filename).stem}.xml", tostring(root, encoding="unicode"))
            if include_images:
                ok = _add_image(zf, img, f"images/{img.filename}")
                if not ok:
                    missing.append(img.filename)
        if missing:
            zf.writestr("MISSING_IMAGES.txt", "\n".join(missing))

    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="voc_dataset.zip"'})


def _csv(images, labels, annotations, include_images):
    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf)
    writer.writerow(["image_id","filename","img_width","img_height","label","supercategory",
                     "annotation_type","x_norm","y_norm","w_norm","h_norm",
                     "x_px","y_px","w_px","h_px","polygon_points_norm","confidence","status"])
    for img in images:
        W, H = max(img.width, 1), max(img.height, 1)
        for ann in annotations.get(img.id, []):
            lc = labels.get(ann.label_class_id)
            g = ann.geometry
            xn=yn=wn=hn=xp=yp=wp=hp=poly=""
            if ann.annotation_type == AnnotationType.BBOX:
                xn,yn,wn,hn = g["x"],g["y"],g["w"],g["h"]
                xp,yp,wp,hp = round(g["x"]*W,2),round(g["y"]*H,2),round(g["w"]*W,2),round(g["h"]*H,2)
            elif ann.annotation_type == AnnotationType.POLYGON:
                pts = g.get("points", [])
                poly = json.dumps(pts)
                if pts:
                    xs,ys = [p[0] for p in pts],[p[1] for p in pts]
                    xn,yn = min(xs),min(ys)
                    wn,hn = max(xs)-xn, max(ys)-yn
                    xp,yp,wp,hp = round(xn*W,2),round(yn*H,2),round(wn*W,2),round(hn*H,2)
            writer.writerow([img.id,img.filename,W,H,
                             lc.name if lc else "",lc.supercategory if lc else "",
                             ann.annotation_type.value,xn,yn,wn,hn,xp,yp,wp,hp,
                             poly,ann.confidence or "",ann.status.value])

    if not include_images:
        content = csv_buf.getvalue().encode("utf-8-sig")
        return StreamingResponse(io.BytesIO(content), media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="annotations.csv"'})

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("annotations.csv", csv_buf.getvalue().encode("utf-8-sig"))
        missing = []
        for img in images:
            ok = _add_image(zf, img, f"images/{img.filename}")
            if not ok:
                missing.append(img.filename)
        if missing:
            zf.writestr("MISSING_IMAGES.txt", "\n".join(missing))
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="csv_dataset.zip"'})
