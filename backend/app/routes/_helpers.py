"""
Shared helpers for API routes.

Contains utility functions, decorators, and the shared audio transcription
lifecycle used across route modules.
"""

import logging
from contextlib import suppress
from datetime import UTC, datetime
from functools import wraps

from flask import g, jsonify, request

from ..asr import transcribe_bytes
from ..config import Config
from ..services import s3_audio
from ..services.container import get_services

logger = logging.getLogger(__name__)

# Dedup state for cost alerts — resets on deploy (acceptable for personal project)
_cost_alert_sent_for_month: str | None = None


def _maybe_send_cost_alert(svc) -> None:  # noqa: ANN001
    """Send a cost threshold alert if monthly spend exceeds the configured limit."""
    global _cost_alert_sent_for_month  # noqa: PLW0603

    threshold = Config.MONTHLY_COST_ALERT_THRESHOLD_USD
    if threshold <= 0:
        return

    now = datetime.now(UTC)
    current_month = now.strftime("%Y-%m")
    if _cost_alert_sent_for_month == current_month:
        return

    try:
        cost = svc.usage_tracking.get_monthly_aggregate_cost()
        if cost >= threshold:
            svc.email.send_cost_threshold_alert(
                current_cost=cost,
                threshold=threshold,
                period=current_month,
            )
            _cost_alert_sent_for_month = current_month
    except Exception:
        logger.debug("Cost alert check failed", exc_info=True)


# ============================================================================
# ROUTE UTILITIES
# ============================================================================


def api_error(message: str, status: int = 400) -> tuple[dict, int]:
    """Return a standardized JSON error response."""
    return jsonify({"error": message}), status


def parse_pagination(default_limit: int = 50, max_limit: int = 100) -> tuple[int, int]:
    """Parse limit and offset from query parameters with bounds checking."""
    try:
        limit = int(request.args.get("limit", default_limit))
    except (ValueError, TypeError):
        limit = default_limit
    try:
        offset = int(request.args.get("offset", 0))
    except (ValueError, TypeError):
        offset = 0

    limit = max(1, min(limit, max_limit))
    offset = max(0, offset)
    return limit, offset


def require_audio_clips(f):
    """Decorator that ensures audio clips feature is enabled."""

    @wraps(f)
    def decorated(*args, **kwargs):
        if not Config.audio_clips_enabled():
            return api_error(
                "Audio clips are disabled. Set AUDIO_CLIPS_ENABLED=true to enable.", 501
            )
        return f(*args, **kwargs)

    return decorated


def validate_uuid(value: str, name: str = "id") -> bool:
    """Validate that a string is a valid UUID format."""
    from uuid import UUID

    try:
        UUID(value)
        return True
    except ValueError as exc:
        raise ValueError(f"Invalid {name} format: must be a valid UUID") from exc


def _cleanup_stale_pending_audio_clips(user_id: str, svc) -> None:  # noqa: ANN001
    """Opportunistically clean up old pending clips for the current user."""
    try:
        stale = svc.storage.list_stale_pending_audio_clips(
            user_id,
            older_than_minutes=60,
            limit=100,
        )
    except Exception:
        return

    if not stale:
        return

    for clip in stale:
        with suppress(Exception):
            s3_audio.delete_object(storage_key=clip.storage_key)
    with suppress(Exception):
        svc.storage.delete_audio_clips(user_id, [c.id for c in stale])


def require_quota(service_type: str):
    """Decorator that checks user quota before allowing the request."""

    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user_id = g.user_id
            svc = get_services()

            quota_check = svc.usage_tracking.check_quota(user_id, service_type)

            if not quota_check.allowed:
                return (
                    jsonify(
                        {
                            "error": "Monthly quota exceeded",
                            "quota": {
                                "service": quota_check.service_type,
                                "used": quota_check.used,
                                "limit": quota_check.limit,
                                "unit": quota_check.unit,
                                "resets_at": quota_check.resets_at.isoformat(),
                            },
                        }
                    ),
                    429,
                )

            return f(*args, **kwargs)

        return decorated

    return decorator


def resolve_target_user(
    resource_type: str, min_permission: str = "view", param_name: str = "owner"
) -> str | tuple[dict, int]:
    """Return the target user_id for a request, or an error response tuple.

    If no owner param, returns g.user_id (backward-compatible).
    If owner param provided, verifies accepted share with min_permission.
    Returns (error_dict, 403) on access denied — caller must check with isinstance.
    """
    owner = request.args.get(param_name)
    if not owner or owner == g.user_id:
        return g.user_id
    svc = get_services()
    if not svc.storage.has_access(g.user_id, owner, resource_type, min_permission):
        return api_error("Not authorized to access this resource", 403)
    return owner


# ============================================================================
# TRANSCRIPTION HELPERS
# ============================================================================


class _AudioTranscriptionError(Exception):
    """Raised by _transcribe_audio_clip for errors that should return an HTTP response."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _transcribe_audio_clip(
    user_id: str,
    svc,  # noqa: ANN001
    endpoint: str,
) -> tuple[str, dict, str, str]:
    """Shared audio upload + transcription lifecycle.

    Handles: request parsing, pending clip creation, S3 upload,
    transcription, error cleanup, usage recording, marking clip ready.

    Returns:
        (transcription_text, meta, audio_clip_id, audio_storage_key)

    Raises:
        _AudioTranscriptionError: For validation/format errors (caller converts to api_error).
    """
    from uuid import uuid4

    content_type = None
    if "file" in request.files:
        file = request.files["file"]
        data = file.read()
        content_type = file.content_type
    else:
        data = request.get_data()
        content_type = request.content_type

    if not data:
        raise _AudioTranscriptionError("No audio data provided", 400)

    _cleanup_stale_pending_audio_clips(user_id, svc)

    audio_clip_id = str(uuid4())
    resolved_mime = content_type or "application/octet-stream"
    audio_storage_key = s3_audio.object_key_for_clip(
        user_id=user_id,
        clip_id=audio_clip_id,
        mime_type=resolved_mime,
    )

    svc.storage.create_audio_clip_pending(
        user_id,
        clip_id=audio_clip_id,
        note_id=None,
        mime_type=resolved_mime,
        bytes=len(data),
        duration_ms=None,
        storage_key=audio_storage_key,
        bucket=None,
    )

    try:
        s3_audio.put_object_bytes(
            storage_key=audio_storage_key,
            content_type=resolved_mime,
            data=data,
        )
    except Exception:
        svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
        raise

    try:
        text, meta = transcribe_bytes(data, content_type)
    except ValueError as e:
        with suppress(Exception):
            s3_audio.delete_object(storage_key=audio_storage_key)
        svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
        raise _AudioTranscriptionError(str(e), 400) from e
    except Exception as e:
        error_msg = str(e)
        if "corrupted" in error_msg.lower() or "unsupported" in error_msg.lower():
            with suppress(Exception):
                s3_audio.delete_object(storage_key=audio_storage_key)
            svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
            raise _AudioTranscriptionError(
                "Audio format not supported or corrupted. Please try recording again.",
                400,
            ) from e
        with suppress(Exception):
            s3_audio.delete_object(storage_key=audio_storage_key)
        svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
        raise

    audio_duration = meta.get("duration")
    if audio_duration is not None:
        svc.usage_tracking.record_usage(
            user_id=user_id,
            service_type="transcription",
            model=meta.get("model", "gpt-4o-mini-transcribe"),
            audio_seconds=float(audio_duration),
            endpoint=endpoint,
        )
        _maybe_send_cost_alert(svc)

    duration_ms = None
    try:
        dur = meta.get("duration")
        if dur is not None:
            duration_ms = int(float(dur) * 1000.0)
    except Exception:
        duration_ms = None

    svc.storage.mark_audio_clip_ready(
        user_id,
        audio_clip_id,
        note_id=None,
        duration_ms=duration_ms,
    )

    return text, meta, audio_clip_id, audio_storage_key
