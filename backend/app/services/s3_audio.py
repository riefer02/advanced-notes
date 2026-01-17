"""
S3 helper utilities for audio clip storage.

We keep this module small and focused:
- deterministic object keys
- presigned PUT/GET URLs

Routes and storage code should not talk to boto3 directly; they should call this module.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.config import Config


@dataclass(frozen=True)
class PresignedRequest:
    url: str
    method: str
    expires_at: str
    # Optional headers a client should set (we keep this empty for now)
    headers: dict[str, str]


@dataclass(frozen=True)
class ObjectHead:
    content_length: int
    content_type: str | None


_MIME_TO_EXT: dict[str, str] = {
    "audio/webm": ".webm",
    "audio/mp4": ".mp4",
    "audio/m4a": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/wave": ".wav",
    "audio/ogg": ".ogg",
}


def _base_mime(mime_type: str) -> str:
    return (mime_type or "").split(";")[0].strip().lower()


def base_mime(mime_type: str) -> str:
    """Public helper for normalizing MIME types (drops parameters, lowercases)."""
    return _base_mime(mime_type)


def object_key_for_clip(*, user_id: str, clip_id: str, mime_type: str) -> str:
    ext = _MIME_TO_EXT.get(_base_mime(mime_type), "")
    # Keep keys stable and prefix by environment + user for easier admin + lifecycle rules.
    # By default, we isolate by APP_ENV/ENV (or FLASK_ENV fallback) so dev/prod can share a bucket safely.
    prefix = Config.effective_s3_key_prefix()
    if prefix:
        return f"{prefix}/{user_id}/{clip_id}{ext}"
    return f"{user_id}/{clip_id}{ext}"


def _require_s3_config() -> tuple[str, str | None, str | None, str | None, str | None]:
    bucket = Config.S3_BUCKET
    if not bucket:
        raise ValueError("S3_BUCKET is required for audio clip storage")
    return (
        bucket,
        Config.AWS_REGION,
        Config.AWS_ACCESS_KEY_ID,
        Config.AWS_SECRET_ACCESS_KEY,
        Config.S3_ENDPOINT_URL,
    )


def _client():
    # Import boto3 lazily so tests can monkeypatch this module without boto3 installed.
    import boto3  # type: ignore

    bucket, region, access_key, secret_key, endpoint_url = _require_s3_config()
    # region can be None for some S3-compatible setups, but AWS S3 expects it.
    return (
        boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            endpoint_url=endpoint_url,
        ),
        bucket,
    )


def presign_put_object(*, storage_key: str, content_type: str) -> PresignedRequest:
    s3, bucket = _client()
    expires = int(getattr(Config, "S3_PRESIGN_PUT_EXPIRES_SECONDS", 900))
    url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={"Bucket": bucket, "Key": storage_key, "ContentType": content_type},
        ExpiresIn=expires,
    )
    expires_at = (datetime.now(UTC) + timedelta(seconds=expires)).isoformat()
    # Many S3 providers require the client to send the same Content-Type that was presigned.
    return PresignedRequest(
        url=url,
        method="PUT",
        expires_at=expires_at,
        headers={"Content-Type": content_type},
    )


def presign_get_object(*, storage_key: str) -> PresignedRequest:
    s3, bucket = _client()
    expires = int(getattr(Config, "S3_PRESIGN_GET_EXPIRES_SECONDS", 900))
    url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": bucket, "Key": storage_key},
        ExpiresIn=expires,
    )
    expires_at = (datetime.now(UTC) + timedelta(seconds=expires)).isoformat()
    return PresignedRequest(url=url, method="GET", expires_at=expires_at, headers={})


def head_object(*, storage_key: str) -> ObjectHead:
    if not storage_key:
        raise ValueError("storage_key is required")
    s3, bucket = _client()
    resp = s3.head_object(Bucket=bucket, Key=storage_key)
    return ObjectHead(
        content_length=int(resp.get("ContentLength") or 0),
        content_type=resp.get("ContentType"),
    )


def put_object_bytes(*, storage_key: str, content_type: str, data: bytes) -> None:
    """
    Upload raw bytes to S3.

    This is used when the backend already has the audio bytes (e.g. /api/transcribe uploads).
    For mobile direct-to-S3 flows, prefer presigned PUT.
    """
    if not data:
        raise ValueError("Cannot upload empty object")
    s3, bucket = _client()
    s3.put_object(Bucket=bucket, Key=storage_key, Body=data, ContentType=content_type)


def delete_object(*, storage_key: str) -> None:
    """
    Best-effort delete an object from S3.

    Note: S3 delete is idempotent; deleting a non-existent key is not an error for many providers.
    """
    if not storage_key:
        raise ValueError("storage_key is required")
    s3, bucket = _client()
    s3.delete_object(Bucket=bucket, Key=storage_key)
