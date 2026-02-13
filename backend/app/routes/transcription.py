from uuid import uuid4

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services import s3_audio
from ..services.container import get_services
from ..services.folder_utils import extract_folder_paths
from ..services.models import NoteMetadata
from ._helpers import (
    _AudioTranscriptionError,
    _cleanup_stale_pending_audio_clips,
    _maybe_send_cost_alert,
    _transcribe_audio_clip,
    api_error,
    require_audio_clips,
    require_quota,
)

bp = Blueprint("transcription", __name__)


@bp.post("/summarize")
@require_auth
@require_quota("ai_calls")
def summarize_notes():
    """Generate a smart summary digest from recent notes."""
    user_id = g.user_id
    svc = get_services()

    try:
        recent_notes = svc.storage.get_recent_notes(user_id, limit=10)

        if not recent_notes:
            return jsonify(
                {
                    "summary": "No recent notes found to summarize. Record some thoughts first!",
                    "key_themes": [],
                    "action_items": [],
                    "digest_id": None,
                }
            )

        notes_content = [f"Title: {n.title}\nContent: {n.content}" for n in recent_notes]

        summarization_result = svc.summarizer.summarize(notes_content, return_usage=True)
        digest_result = summarization_result.digest

        if summarization_result.usage:
            svc.usage_tracking.record_usage(
                user_id=user_id,
                service_type="summarization",
                model=summarization_result.model,
                prompt_tokens=summarization_result.usage.prompt_tokens,
                completion_tokens=summarization_result.usage.completion_tokens,
                total_tokens=summarization_result.usage.total_tokens,
                endpoint="/api/summarize",
            )
            _maybe_send_cost_alert(svc)

        digest_json = digest_result.model_dump_json()
        digest_id = svc.storage.save_digest(user_id, digest_json)

        return jsonify({**digest_result.model_dump(), "digest_id": digest_id})

    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/transcribe")
@require_auth
@require_audio_clips
@require_quota("transcription")
def transcribe():
    """Transcribe audio and automatically categorize/save to database (user-scoped)."""
    user_id = g.user_id
    svc = get_services()

    try:
        text, meta, audio_clip_id, audio_storage_key = _transcribe_audio_clip(
            user_id, svc, "/api/transcribe"
        )
    except _AudioTranscriptionError as e:
        return api_error(str(e), e.status)
    except Exception as e:
        return api_error(str(e), 500)

    try:
        folder_tree = svc.storage.get_folder_tree(user_id)

        existing_folders = extract_folder_paths(folder_tree)
        cat_result = svc.categorizer.categorize(text, existing_folders, return_usage=True)
        categorization_result = cat_result.suggestion

        if cat_result.usage:
            svc.usage_tracking.record_usage(
                user_id=user_id,
                service_type="categorization",
                model=cat_result.model,
                prompt_tokens=cat_result.usage.prompt_tokens,
                completion_tokens=cat_result.usage.completion_tokens,
                total_tokens=cat_result.usage.total_tokens,
                endpoint="/api/transcribe",
            )
            _maybe_send_cost_alert(svc)

        note_metadata = NoteMetadata(
            title=categorization_result.filename.replace(".md", "").replace("-", " ").title(),
            folder_path=categorization_result.folder_path,
            tags=categorization_result.tags,
            confidence=categorization_result.confidence,
            transcription_duration=meta.get("duration"),
            model_version=meta.get("model"),
        )

        note_id = svc.storage.save_note(user_id=user_id, content=text, metadata=note_metadata)

        svc.storage.mark_audio_clip_ready(
            user_id,
            audio_clip_id,
            note_id=note_id,
            duration_ms=None,
        )

        svc.embeddings.upsert_for_note(
            storage=svc.storage,
            user_id=user_id,
            note_id=note_id,
            title=note_metadata.title,
            content=text,
            tags=note_metadata.tags,
        )

        created_todos = []
        try:
            extracted_todos = getattr(categorization_result, "todos", []) or []
            if extracted_todos:
                user_settings = svc.storage.get_user_settings(user_id)
                todo_status = "accepted" if user_settings.auto_accept_todos else "suggested"

                for extracted in extracted_todos:
                    todo = svc.storage.create_todo(
                        user_id=user_id,
                        title=extracted.title,
                        note_id=note_id,
                        description=extracted.description,
                        status=todo_status,
                        confidence=extracted.confidence,
                        extraction_context=text[:500] if text else None,
                    )
                    created_todos.append(todo.model_dump())
        except Exception as e:
            print(f"Todo creation failed for note {note_id}: {e}")

        return jsonify(
            {
                "text": text,
                "meta": meta,
                "audio": {
                    "clip_id": audio_clip_id,
                    "storage_key": audio_storage_key,
                },
                "categorization": {
                    "note_id": note_id,
                    "action": categorization_result.action,
                    "folder_path": categorization_result.folder_path,
                    "filename": categorization_result.filename,
                    "tags": categorization_result.tags,
                    "confidence": categorization_result.confidence,
                    "reasoning": categorization_result.reasoning,
                },
                "todos": created_todos,
            }
        )

    except Exception as e:
        return api_error(str(e), 500)


# ============================================================================
# AUDIO CLIPS (UPLOAD + PLAYBACK)
# ============================================================================


@bp.post("/audio-clips")
@require_auth
@require_audio_clips
def create_audio_clip_upload():
    """Create a pending audio clip row and return a presigned S3 PUT URL for direct upload."""
    user_id = g.user_id
    svc = get_services()
    data = request.get_json(silent=True) or {}

    _cleanup_stale_pending_audio_clips(user_id, svc)

    mime_type = (data.get("mime_type") or "").strip()
    if not mime_type:
        return api_error("Body field 'mime_type' is required")

    try:
        bytes_value = int(data.get("bytes") or 0)
    except Exception:
        return api_error("Body field 'bytes' must be an integer")
    if bytes_value <= 0:
        return api_error("Body field 'bytes' must be > 0")

    note_id = data.get("note_id")
    duration_ms = data.get("duration_ms")
    if duration_ms is not None:
        try:
            duration_ms = int(duration_ms)
        except Exception:
            return api_error("Body field 'duration_ms' must be an integer")

    clip_id = str(uuid4())
    storage_key = s3_audio.object_key_for_clip(
        user_id=user_id, clip_id=clip_id, mime_type=mime_type
    )

    clip = svc.storage.create_audio_clip_pending(
        user_id,
        clip_id=clip_id,
        note_id=note_id,
        mime_type=mime_type,
        bytes=bytes_value,
        duration_ms=duration_ms,
        storage_key=storage_key,
        bucket=None,
    )

    upload = s3_audio.presign_put_object(storage_key=storage_key, content_type=mime_type)
    return jsonify(
        {
            "clip": clip.model_dump(),
            "upload": {
                "url": upload.url,
                "method": upload.method,
                "headers": upload.headers,
                "storage_key": storage_key,
                "expires_at": upload.expires_at,
            },
        }
    )


@bp.post("/audio-clips/<clip_id>/complete")
@require_auth
@require_audio_clips
def complete_audio_clip_upload(clip_id: str):
    """Mark a pending clip as ready after the client successfully PUTs to S3."""
    user_id = g.user_id
    svc = get_services()

    clip = svc.storage.get_audio_clip(user_id, clip_id)
    if not clip:
        return api_error("Audio clip not found", 404)

    if clip.status == "ready":
        return jsonify({"clip": clip.model_dump()})

    try:
        head = s3_audio.head_object(storage_key=clip.storage_key)
    except Exception:
        return api_error("Audio upload not found", 409)

    if int(head.content_length or 0) != int(clip.bytes or 0):
        return api_error("Uploaded audio size does not match expected bytes", 409)

    expected = s3_audio.base_mime(clip.mime_type)
    actual = s3_audio.base_mime(head.content_type or "")
    if expected and actual and expected != actual:
        return api_error("Uploaded audio content-type does not match expected mime_type", 409)

    updated = svc.storage.mark_audio_clip_ready(user_id, clip_id)
    if not updated:
        return api_error("Audio clip not found", 404)
    return jsonify({"clip": updated.model_dump()})


@bp.get("/audio-clips/<clip_id>/playback")
@require_auth
@require_audio_clips
def get_audio_clip_playback(clip_id: str):
    """Return a presigned GET URL for playback."""
    user_id = g.user_id
    svc = get_services()

    clip = svc.storage.get_audio_clip(user_id, clip_id)
    if not clip:
        return api_error("Audio clip not found", 404)
    if clip.status != "ready":
        return api_error("Audio clip is not ready", 409)

    dl = s3_audio.presign_get_object(storage_key=clip.storage_key)
    return jsonify({"url": dl.url, "expires_at": dl.expires_at})


@bp.delete("/audio-clips/<clip_id>")
@require_auth
@require_audio_clips
def delete_audio_clip(clip_id: str):
    """Delete audio clip metadata row + best-effort delete the S3 object."""
    user_id = g.user_id
    svc = get_services()

    clip = svc.storage.get_audio_clip(user_id, clip_id)
    if not clip:
        return api_error("Audio clip not found", 404)

    warning = None
    try:
        s3_audio.delete_object(storage_key=clip.storage_key)
    except Exception as e:
        warning = f"Failed to delete audio object from storage: {e}"
        print(warning)

    success = svc.storage.delete_audio_clip(user_id, clip_id)
    if not success:
        return api_error("Audio clip not found", 404)
    payload = {"success": True}
    if warning:
        payload["warning"] = warning
    return jsonify(payload)


@bp.get("/notes/<note_id>/audio")
@require_auth
@require_audio_clips
def get_primary_audio_clip_for_note(note_id: str):
    """Convenience endpoint: return the note's primary audio clip + playback URL."""
    user_id = g.user_id
    svc = get_services()

    clip = svc.storage.get_primary_audio_clip_for_note(user_id, note_id)
    if not clip:
        return api_error("Audio clip not found", 404)

    dl = s3_audio.presign_get_object(storage_key=clip.storage_key)
    return jsonify(
        {"clip": clip.model_dump(), "playback": {"url": dl.url, "expires_at": dl.expires_at}}
    )
