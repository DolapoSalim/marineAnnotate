"""
Secure file upload utilities.
Fixes: path traversal (CWE-22), MIME spoofing, upload DoS (CWE-400).
"""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import AsyncIterator

import aiofiles
from fastapi import HTTPException, UploadFile

from app.core.config import settings

# ── Whitelists ────────────────────────────────────────────────────────────────

IMAGE_EXTENSIONS: frozenset[str] = frozenset({".jpg", ".jpeg", ".png", ".tiff", ".webp"})
MODEL_EXTENSIONS: frozenset[str] = frozenset({".pt", ".pth"})

IMAGE_MAGIC: dict[bytes, str] = {
    b"\xff\xd8\xff": ".jpg",
    b"\x89PNG": ".png",
    b"II*\x00": ".tiff",
    b"MM\x00*": ".tiff",
    b"RIFF": ".webp",
}
# PyTorch .pt files are ZIP archives
PYTORCH_MAGIC = b"PK\x03\x04"


def _safe_extension(filename: str, allowed: frozenset[str]) -> str:
    """Extract and validate file extension against a whitelist."""
    ext = Path(filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"File type '{ext}' is not allowed")
    return ext


def _resolve_safe(path: Path, root: Path) -> Path:
    """Resolve path and assert it stays inside root (anti path-traversal)."""
    resolved = path.resolve()
    root_resolved = root.resolve()
    try:
        resolved.relative_to(root_resolved)
    except ValueError:
        raise HTTPException(400, "Invalid file path")
    return resolved


async def _verify_image_magic(path: Path) -> None:
    """Read first 8 bytes and validate against known image magic numbers."""
    async with aiofiles.open(path, "rb") as f:
        header = await f.read(8)
    for magic, _ in IMAGE_MAGIC.items():
        if header.startswith(magic):
            return
    raise HTTPException(400, "File content does not match an allowed image type")


async def _verify_model_magic(path: Path) -> None:
    """Verify .pt file is a ZIP archive (PyTorch format)."""
    async with aiofiles.open(path, "rb") as f:
        header = await f.read(4)
    if not header.startswith(PYTORCH_MAGIC):
        raise HTTPException(400, "Model file does not appear to be a valid PyTorch file")


async def stream_to_disk(
    upload: UploadFile,
    dest: Path,
    max_bytes: int,
) -> int:
    """
    Stream upload to disk in chunks — never buffers full file in memory.
    Returns bytes written.
    """
    total = 0
    async with aiofiles.open(dest, "wb") as f:
        while True:
            chunk = await upload.read(65536)  # 64 KB chunks
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                dest.unlink(missing_ok=True)
                raise HTTPException(413, f"File exceeds {max_bytes // 1024 // 1024} MB limit")
            await f.write(chunk)
    return total


def safe_image_path(storage_root: Path, batch_id: int, file_id: str, ext: str) -> Path:
    batch_dir = storage_root / str(batch_id)
    batch_dir.mkdir(parents=True, exist_ok=True)
    path = batch_dir / f"{file_id}{ext}"
    return _resolve_safe(path, storage_root)


def safe_model_path(models_root: Path, project_id: int, file_id: str, ext: str) -> Path:
    project_dir = models_root / str(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)
    path = project_dir / f"{file_id}{ext}"
    return _resolve_safe(path, models_root)
