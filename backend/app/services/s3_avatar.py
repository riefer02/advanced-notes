"""
S3 helper utilities for user avatar image storage.

Mirrors the s3_vinyl.py pattern. Uses the same S3 bucket/credentials.
"""

from __future__ import annotations

from app.config import Config
from app.services import s3_audio

_MIME_TO_EXT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _base_mime(mime_type: str) -> str:
    return (mime_type or "").split(";")[0].strip().lower()


def mime_to_ext(mime_type: str) -> str:
    return _MIME_TO_EXT.get(_base_mime(mime_type), ".jpg")


def s3_available() -> bool:
    """Check if S3 is configured (bucket is set)."""
    return bool(Config.S3_BUCKET)


def object_key_for_avatar(*, user_id: str, mime_type: str) -> str:
    ext = mime_to_ext(mime_type)
    prefix = Config.effective_s3_key_prefix()
    base = f"avatars/{user_id}/avatar{ext}"
    if prefix:
        return f"{prefix}/{base}"
    return base


def upload_avatar(*, storage_key: str, content_type: str, data: bytes) -> None:
    s3_audio.put_object_bytes(storage_key=storage_key, content_type=content_type, data=data)


def presign_get_avatar(*, storage_key: str) -> str:
    """Return a presigned GET URL string for an avatar."""
    result = s3_audio.presign_get_object(storage_key=storage_key)
    return result.url


def delete_avatar(*, storage_key: str) -> None:
    s3_audio.delete_object(storage_key=storage_key)
