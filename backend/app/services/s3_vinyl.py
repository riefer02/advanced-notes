"""
S3 helper utilities for vinyl record image storage.

Mirrors the s3_audio.py pattern. Uses the same S3 bucket/credentials.
"""

from __future__ import annotations

from app.config import Config
from app.services import s3_audio

_MIME_TO_EXT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
}


def _base_mime(mime_type: str) -> str:
    return (mime_type or "").split(";")[0].strip().lower()


def s3_available() -> bool:
    """Check if S3 is configured (bucket is set)."""
    return bool(Config.S3_BUCKET)


def object_key_for_image(*, user_id: str, image_id: str, mime_type: str) -> str:
    ext = _MIME_TO_EXT.get(_base_mime(mime_type), ".jpg")
    prefix = Config.effective_s3_key_prefix()
    base = f"vinyl/{user_id}/{image_id}{ext}"
    if prefix:
        return f"{prefix}/{base}"
    return base


def presign_put_object(*, storage_key: str, content_type: str) -> s3_audio.PresignedRequest:
    return s3_audio.presign_put_object(storage_key=storage_key, content_type=content_type)


def presign_get_object(*, storage_key: str) -> s3_audio.PresignedRequest:
    return s3_audio.presign_get_object(storage_key=storage_key)


def head_object(*, storage_key: str) -> s3_audio.ObjectHead:
    return s3_audio.head_object(storage_key=storage_key)


def upload_object(*, storage_key: str, content_type: str, data: bytes) -> None:
    s3_audio.put_object_bytes(storage_key=storage_key, content_type=content_type, data=data)


def delete_object(*, storage_key: str) -> None:
    s3_audio.delete_object(storage_key=storage_key)
