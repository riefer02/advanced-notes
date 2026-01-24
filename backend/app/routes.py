"""
REST API routes for the ASR application.

Organized into logical groups:
- Transcription: Audio transcription and categorization
- Notes: CRUD operations for notes
- Folders: Folder hierarchy and statistics
- Tags: Tag management
- Search: Full-text search

All routes require authentication and are user-scoped.
"""

from contextlib import suppress
from functools import wraps

from flask import Blueprint, g, jsonify, request

from .asr import transcribe_bytes
from .auth import require_auth
from .config import Config
from .services import s3_audio
from .services.ask_service import RetrievedNote
from .services.container import get_services
from .services.embeddings import vector_to_json, vector_to_pg_literal
from .services.folder_utils import extract_folder_paths
from .services.models import NoteMetadata

bp = Blueprint("api", __name__)


# ============================================================================
# ROUTE UTILITIES
# ============================================================================


def api_error(message: str, status: int = 400) -> tuple[dict, int]:
    """
    Return a standardized JSON error response.

    Args:
        message: Error message to include in response
        status: HTTP status code (default: 400)

    Returns:
        Tuple of (JSON response, status code)
    """
    return jsonify({"error": message}), status


def parse_pagination(default_limit: int = 50, max_limit: int = 100) -> tuple[int, int]:
    """
    Parse limit and offset from query parameters with bounds checking.

    Args:
        default_limit: Default limit if not provided (default: 50)
        max_limit: Maximum allowed limit (default: 100)

    Returns:
        Tuple of (limit, offset)
    """
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
    """
    Decorator that ensures audio clips feature is enabled.

    Returns 501 error if AUDIO_CLIPS_ENABLED is not true.
    """

    @wraps(f)
    def decorated(*args, **kwargs):
        if not Config.audio_clips_enabled():
            return api_error(
                "Audio clips are disabled. Set AUDIO_CLIPS_ENABLED=true to enable.", 501
            )
        return f(*args, **kwargs)

    return decorated


def validate_uuid(value: str, name: str = "id") -> bool:
    """
    Validate that a string is a valid UUID format.

    Args:
        value: The string to validate
        name: Name of the parameter for error messages

    Returns:
        True if valid UUID format

    Raises:
        ValueError: If the value is not a valid UUID
    """
    from uuid import UUID

    try:
        UUID(value)
        return True
    except ValueError as exc:
        raise ValueError(f"Invalid {name} format: must be a valid UUID") from exc


def _cleanup_stale_pending_audio_clips(user_id: str, svc) -> None:  # noqa: ANN001 - small route helper
    """
    Opportunistically clean up old pending clips for the current user.

    This avoids needing a separate cron/janitor job for v1 while preventing cost leakage
    from abandoned uploads.
    """
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

    # Best-effort: delete objects first, then delete DB rows.
    for clip in stale:
        with suppress(Exception):
            s3_audio.delete_object(storage_key=clip.storage_key)
    with suppress(Exception):
        svc.storage.delete_audio_clips(user_id, [c.id for c in stale])


def require_quota(service_type: str):
    """
    Decorator that checks user quota before allowing the request.

    Args:
        service_type: The service type to check ("transcription" or "ai_calls")

    Returns 429 with quota details when exceeded.
    """

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

            # Execute the decorated function
            return f(*args, **kwargs)

        return decorated

    return decorator


# ============================================================================
# TRANSCRIPTION ENDPOINTS
# ============================================================================


@bp.post("/summarize")
@require_auth
@require_quota("ai_calls")
def summarize_notes():
    """
    Generate a smart summary digest from recent notes.

    Returns:
        JSON: {
            "summary": str,
            "key_themes": List[str],
            "action_items": List[str],
            "digest_id": str
        }
    """
    user_id = g.user_id
    svc = get_services()

    try:
        # 1. Fetch recent notes
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

        # 2. Extract content
        notes_content = [f"Title: {n.title}\nContent: {n.content}" for n in recent_notes]

        # 3. Generate summary with usage tracking
        summarization_result = svc.summarizer.summarize(notes_content, return_usage=True)
        digest_result = summarization_result.digest

        # 4. Record usage
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

        # 5. Save to database (store the structured result as JSON string)
        digest_json = digest_result.model_dump_json()
        digest_id = svc.storage.save_digest(user_id, digest_json)

        return jsonify({**digest_result.model_dump(), "digest_id": digest_id})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/transcribe")
@require_auth
@require_audio_clips
@require_quota("transcription")
def transcribe():
    """
    Transcribe audio and automatically categorize/save to database (user-scoped).

    Accepts:
        - multipart/form-data with 'file' field
        - raw audio bytes in request body

    Returns:
        JSON: {
            "text": str,
            "meta": dict,
            "categorization": {
                "note_id": str,
                "folder_path": str,
                "filename": str,
                "tags": list,
                "confidence": float
            }
        }
    """
    user_id = g.user_id  # Get authenticated user ID
    svc = get_services()

    # Check for file upload
    content_type = None
    if "file" in request.files:
        file = request.files["file"]
        data = file.read()
        content_type = file.content_type
    else:
        # Raw bytes in body
        data = request.get_data()
        content_type = request.content_type

    if not data:
        return jsonify({"error": "No audio data provided"}), 400

    try:
        _cleanup_stale_pending_audio_clips(user_id, svc)

        # Create a pending audio clip row first (so we never have silent S3 orphans without DB metadata).
        # Then upload bytes to S3; we only mark the clip ready after the full flow succeeds.
        from uuid import uuid4

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
            # Upload failed: mark clip failed and bubble up.
            svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
            raise

        # Step 1: Transcribe audio
        try:
            text, meta = transcribe_bytes(data, content_type)
        except ValueError as e:
            # Validation errors (empty audio, too small, etc.)
            with suppress(Exception):
                s3_audio.delete_object(storage_key=audio_storage_key)
            svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            # OpenAI API errors
            error_msg = str(e)
            if "corrupted" in error_msg.lower() or "unsupported" in error_msg.lower():
                with suppress(Exception):
                    s3_audio.delete_object(storage_key=audio_storage_key)
                svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
                return jsonify(
                    {
                        "error": "Audio format not supported or corrupted. Please try recording again."
                    }
                ), 400
            with suppress(Exception):
                s3_audio.delete_object(storage_key=audio_storage_key)
            svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
            raise

        # Record transcription usage
        audio_duration = meta.get("duration")
        if audio_duration is not None:
            svc.usage_tracking.record_usage(
                user_id=user_id,
                service_type="transcription",
                model=meta.get("model", "gpt-4o-mini-transcribe"),
                audio_seconds=float(audio_duration),
                endpoint="/api/transcribe",
            )

        # Step 2: Get AI categorization (user-scoped folders)
        folder_tree = svc.storage.get_folder_tree(user_id)

        existing_folders = extract_folder_paths(folder_tree)
        cat_result = svc.categorizer.categorize(text, existing_folders, return_usage=True)
        categorization_result = cat_result.suggestion

        # Record categorization usage
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

        # Step 3: Save to database (user-scoped)
        note_metadata = NoteMetadata(
            title=categorization_result.filename.replace(".md", "").replace("-", " ").title(),
            folder_path=categorization_result.folder_path,
            tags=categorization_result.tags,
            confidence=categorization_result.confidence,
            transcription_duration=meta.get("duration"),
            model_version=meta.get("model"),
        )

        note_id = svc.storage.save_note(user_id=user_id, content=text, metadata=note_metadata)

        # Persist audio clip metadata linked to the new note + mark ready.
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
            note_id=note_id,
            duration_ms=duration_ms,
        )

        # Step 3.5: Upsert embedding for semantic search (best-effort)
        svc.embeddings.upsert_for_note(
            storage=svc.storage,
            user_id=user_id,
            note_id=note_id,
            title=note_metadata.title,
            content=text,
            tags=note_metadata.tags,
        )

        # Step 3.6: Create todos from AI extraction (best-effort)
        created_todos = []
        try:
            extracted_todos = getattr(categorization_result, "todos", []) or []
            if extracted_todos:
                # Check user settings for auto-accept preference
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
            # Do not fail the transcription flow if todo creation fails.
            print(f"Todo creation failed for note {note_id}: {e}")

        # Step 4: Return comprehensive response
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
        # Best-effort cleanup if we already staged an S3 object.
        try:
            if "audio_storage_key" in locals():
                s3_audio.delete_object(storage_key=audio_storage_key)
        except Exception:
            pass
        try:
            if "audio_clip_id" in locals():
                svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
        except Exception:
            pass
        return jsonify({"error": str(e)}), 500


# ============================================================================
# AUDIO CLIPS (UPLOAD + PLAYBACK)
# ============================================================================


@bp.post("/audio-clips")
@require_auth
@require_audio_clips
def create_audio_clip_upload():
    """
    Create a pending audio clip row and return a presigned S3 PUT URL for direct upload.

    Body JSON:
      { note_id?: str, mime_type: str, bytes: int, duration_ms?: int }
    """
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

    # Create DB row first so clip_id is stable for key generation.
    # We'll fill storage_key deterministically as {user_id}/{clip_id}{ext}.
    from uuid import uuid4

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
    """
    Mark a pending clip as ready after the client successfully PUTs to S3.
    """
    user_id = g.user_id
    svc = get_services()

    clip = svc.storage.get_audio_clip(user_id, clip_id)
    if not clip:
        return api_error("Audio clip not found", 404)

    # Idempotent: if already ready, return current state.
    if clip.status == "ready":
        return jsonify({"clip": clip.model_dump()})

    # Verify upload exists and matches expected metadata before marking ready.
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
    """
    Return a presigned GET URL for playback.
    """
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
    """
    Delete audio clip metadata row + best-effort delete the S3 object.
    """
    user_id = g.user_id
    svc = get_services()

    clip = svc.storage.get_audio_clip(user_id, clip_id)
    if not clip:
        return api_error("Audio clip not found", 404)

    warning = None
    try:
        s3_audio.delete_object(storage_key=clip.storage_key)
    except Exception as e:
        # Keep deletion idempotent and user-friendly; record for logs.
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
    """
    Convenience endpoint: return the note's primary (most recent ready) audio clip + playback URL.
    """
    user_id = g.user_id
    svc = get_services()

    clip = svc.storage.get_primary_audio_clip_for_note(user_id, note_id)
    if not clip:
        return api_error("Audio clip not found", 404)

    dl = s3_audio.presign_get_object(storage_key=clip.storage_key)
    return jsonify(
        {"clip": clip.model_dump(), "playback": {"url": dl.url, "expires_at": dl.expires_at}}
    )


# ============================================================================
# NOTES ENDPOINTS
# ============================================================================


@bp.get("/notes")
@require_auth
def list_notes():
    """
    List notes with optional filtering (user-scoped).

    Query params:
        - folder: Filter by folder path (optional)
        - limit: Max results (default: 50)
        - offset: Pagination offset (default: 0)

    Returns:
        JSON: {"notes": [...], "total": int, "limit": int, "offset": int}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        folder = request.args.get("folder")
        limit, offset = parse_pagination(default_limit=50, max_limit=100)

        notes = svc.storage.list_notes(user_id=user_id, folder=folder, limit=limit, offset=offset)

        return jsonify(
            {
                "notes": [note.model_dump() for note in notes],
                "total": len(notes),
                "limit": limit,
                "offset": offset,
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/notes/<note_id>")
@require_auth
def get_note(note_id: str):
    """
    Get a specific note by ID (user-scoped).

    Returns:
        JSON: Note object or 404 error
    """
    user_id = g.user_id
    svc = get_services()

    try:
        note = svc.storage.get_note(user_id, note_id)

        if not note:
            return jsonify({"error": "Note not found"}), 404

        return jsonify(note.model_dump())

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.put("/notes/<note_id>")
@require_auth
def update_note(note_id: str):
    """
    Update an existing note (user-scoped).

    Body:
        JSON: {
            "content": str (optional),
            "title": str (optional),
            "folder_path": str (optional),
            "tags": list (optional)
        }

    Returns:
        JSON: Updated note object or 404 error
    """
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Get existing note (user-scoped)
        note = svc.storage.get_note(user_id, note_id)
        if not note:
            return jsonify({"error": "Note not found"}), 404

        # Update fields
        content = data.get("content", note.content)

        metadata = NoteMetadata(
            title=data.get("title", note.title),
            folder_path=data.get("folder_path", note.folder_path),
            tags=data.get("tags", note.tags),
            confidence=note.confidence,
            transcription_duration=note.transcription_duration,
            model_version=note.model_version,
        )

        success = svc.storage.update_note(user_id, note_id, content, metadata)

        if not success:
            return jsonify({"error": "Failed to update note"}), 500

        # Return updated note
        updated_note = svc.storage.get_note(user_id, note_id)

        # Best-effort embedding refresh
        if updated_note:
            svc.embeddings.upsert_for_note(
                storage=svc.storage,
                user_id=user_id,
                note_id=updated_note.id,
                title=updated_note.title,
                content=updated_note.content,
                tags=updated_note.tags,
            )

        return jsonify(updated_note.model_dump())

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.delete("/notes/<note_id>")
@require_auth
def delete_note(note_id: str):
    """
    Delete a note by ID (user-scoped).

    Returns:
        JSON: {"success": bool, "message": str}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        # Privacy-first cascade: when audio clips are enabled, delete associated audio clips + objects.
        warning = None
        if Config.audio_clips_enabled():
            try:
                clips = svc.storage.list_audio_clips_for_note(user_id, note_id)
                for clip in clips:
                    try:
                        s3_audio.delete_object(storage_key=clip.storage_key)
                    except Exception as e:
                        # Keep the UX simple: note deletion still succeeds; we may retry later via opportunistic cleanup.
                        warning = f"Failed to delete one or more audio objects: {e}"
            except Exception as e:
                warning = f"Failed to list/delete note audio clips: {e}"

            try:
                svc.storage.delete_audio_clips_for_note(user_id, note_id)
            except Exception as e:
                # If we can't delete clip rows, abort the note deletion to avoid a confusing half-state.
                return jsonify({"error": f"Failed to delete note audio clips: {e}"}), 500

        success = svc.storage.delete_note(user_id, note_id)

        if not success:
            return jsonify({"error": "Note not found"}), 404

        payload = {"success": True, "message": f"Note {note_id} deleted successfully"}
        if warning:
            payload["warning"] = warning
        return jsonify(payload)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# FOLDER ENDPOINTS
# ============================================================================


@bp.get("/folders")
@require_auth
def get_folders():
    """
    Get the complete folder hierarchy tree (user-scoped).

    Returns:
        JSON: {"folders": FolderNode} (root node with nested subfolders)
    """
    user_id = g.user_id
    svc = get_services()

    try:
        folder_tree = svc.storage.get_folder_tree(user_id)

        return jsonify({"folders": folder_tree.model_dump()})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/folders/<path:folder_path>/stats")
@require_auth
def get_folder_stats(folder_path: str):
    """
    Get statistics for a specific folder (user-scoped).

    Returns:
        JSON: FolderStats object
    """
    user_id = g.user_id
    svc = get_services()

    try:
        stats = svc.storage.get_folder_stats(user_id, folder_path)

        return jsonify(stats.model_dump())

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# TAG ENDPOINTS
# ============================================================================


@bp.get("/tags")
@require_auth
def get_tags():
    """
    Get all unique tags across user's notes.

    Returns:
        JSON: {"tags": [...]}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        tags = svc.storage.get_all_tags(user_id)

        return jsonify({"tags": tags})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/tags/<tag>/notes")
@require_auth
def get_notes_by_tag(tag: str):
    """
    Get all notes with a specific tag (user-scoped).

    Returns:
        JSON: {"notes": [...], "tag": str}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        notes = svc.storage.get_notes_by_tag(user_id, tag)

        return jsonify({"tag": tag, "notes": [note.model_dump() for note in notes]})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# SEARCH ENDPOINTS
# ============================================================================


@bp.get("/search")
@require_auth
def search_notes():
    """
    Full-text search across user's notes.

    Query params:
        - q: Search query (required)

    Returns:
        JSON: {"results": [...], "query": str}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        query = request.args.get("q")

        if not query:
            return jsonify({"error": "Query parameter 'q' is required"}), 400

        results = svc.storage.search_notes(user_id, query)

        return jsonify({"query": query, "results": [result.model_dump() for result in results]})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# ASK NOTES (AI QUERY + SUMMARY)
# ============================================================================


@bp.post("/ask")
@require_auth
@require_quota("ai_calls")
def ask_notes():
    """
    Ask a natural-language question about your notes.

    Body:
        { "query": str, "max_results": int?, "debug": bool? }

    Returns:
        {
          "answer_markdown": str,
          "query_plan": object,
          "sources": [{note_id,title,updated_at,tags,snippet,score}],
          "warnings": [str],
          "debug": object? (if requested)
        }
    """
    user_id = g.user_id
    svc = get_services()
    data = request.get_json(silent=True) or {}

    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "Body field 'query' is required"}), 400

    max_results = int(data.get("max_results", 12) or 12)
    max_results = max(1, min(max_results, 50))
    debug = bool(data.get("debug", False))

    try:
        known_tags = svc.storage.get_all_tags(user_id)
        folder_tree = svc.storage.get_folder_tree(user_id)

        known_folders = extract_folder_paths(folder_tree)

        plan = svc.planner.plan(
            question=query,
            known_tags=known_tags,
            known_folders=known_folders,
            result_limit=max_results,
        )

        q_vec = svc.embeddings.embed_query(plan.semantic_query)
        q_literal = (
            vector_to_pg_literal(q_vec)
            if svc.storage.dialect == "postgresql"
            else vector_to_json(q_vec)
        )

        fts_query = " ".join(plan.keywords).strip() if plan.keywords else plan.semantic_query

        retrieval = svc.storage.retrieve_for_question(
            user_id=user_id,
            fts_query=fts_query,
            query_embedding_literal=q_literal,
            folder_paths=plan.folder_paths,
            include_tags=plan.include_tags,
            exclude_tags=plan.exclude_tags,
            start_date=plan.time_range.start_date if plan.time_range else None,
            end_date=plan.time_range.end_date if plan.time_range else None,
            limit=plan.result_limit,
            embedding_model=svc.embeddings.model,
        )

        warnings: list[str] = []
        if not retrieval:
            warnings.append("No matching notes found for this question.")

        retrieved_notes: list[RetrievedNote] = []
        for item in retrieval:
            note = item["note"]
            excerpt = (note.content or "")[:2000]
            retrieved_notes.append(
                RetrievedNote(
                    note_id=note.id,
                    title=note.title,
                    updated_at=note.updated_at.isoformat()
                    if hasattr(note.updated_at, "isoformat")
                    else str(note.updated_at),
                    tags=note.tags,
                    snippet=item.get("snippet") or "",
                    score=float(item.get("score") or 0.0),
                    content_excerpt=excerpt,
                )
            )

        ask_result = svc.asker.answer(query, plan, retrieved_notes, return_usage=True)
        answer = ask_result.answer

        # Record chat usage
        if ask_result.usage:
            svc.usage_tracking.record_usage(
                user_id=user_id,
                service_type="chat",
                model=ask_result.model,
                prompt_tokens=ask_result.usage.prompt_tokens,
                completion_tokens=ask_result.usage.completion_tokens,
                total_tokens=ask_result.usage.total_tokens,
                endpoint="/api/ask",
            )

        # Persist ask history (compact)
        import json as _json

        source_scores = {item["note"].id: float(item.get("score") or 0.0) for item in retrieval}
        ask_id = svc.storage.save_ask_history(
            user_id=user_id,
            query=query,
            query_plan_json=plan.model_dump_json(),
            answer_markdown=answer.answer_markdown,
            cited_note_ids_json=_json.dumps(answer.cited_note_ids),
            source_scores_json=_json.dumps(source_scores),
        )

        sources = []
        for item in retrieval:
            note = item["note"]
            sources.append(
                {
                    "note_id": note.id,
                    "title": note.title,
                    "updated_at": note.updated_at.isoformat()
                    if hasattr(note.updated_at, "isoformat")
                    else str(note.updated_at),
                    "tags": note.tags,
                    "snippet": item.get("snippet") or "",
                    "score": float(item.get("score") or 0.0),
                }
            )

        response = {
            "answer_markdown": answer.answer_markdown,
            "query_plan": plan.model_dump(),
            "sources": sources,
            "warnings": warnings,
            "followups": answer.followups,
            "ask_id": ask_id,
        }
        if debug:
            response["debug"] = {
                "fts_query": fts_query,
                "embedding_model": svc.embeddings.model,
            }
        return jsonify(response)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# DIGEST HISTORY
# ============================================================================


@bp.get("/digests")
@require_auth
def list_digests():
    user_id = g.user_id
    svc = get_services()
    try:
        limit, offset = parse_pagination(default_limit=50, max_limit=100)
        digests = svc.storage.list_digests(user_id, limit=limit, offset=offset)
        return jsonify(
            {
                "digests": [d.model_dump() for d in digests],
                "total": len(digests),
                "limit": limit,
                "offset": offset,
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/digests/<digest_id>")
@require_auth
def get_digest(digest_id: str):
    user_id = g.user_id
    svc = get_services()
    try:
        digest = svc.storage.get_digest(user_id, digest_id)
        if not digest:
            return jsonify({"error": "Digest not found"}), 404
        return jsonify(digest.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.delete("/digests/<digest_id>")
@require_auth
def delete_digest(digest_id: str):
    user_id = g.user_id
    svc = get_services()
    try:
        success = svc.storage.delete_digest(user_id, digest_id)
        if not success:
            return jsonify({"error": "Digest not found"}), 404
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# ASK HISTORY
# ============================================================================


@bp.get("/ask-history")
@require_auth
def list_ask_history():
    user_id = g.user_id
    svc = get_services()
    try:
        limit, offset = parse_pagination(default_limit=50, max_limit=100)
        items = svc.storage.list_ask_history(user_id, limit=limit, offset=offset)
        return jsonify(
            {
                "items": [i.model_dump() for i in items],
                "total": len(items),
                "limit": limit,
                "offset": offset,
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/ask-history/<ask_id>")
@require_auth
def get_ask_history(ask_id: str):
    user_id = g.user_id
    svc = get_services()
    try:
        item = svc.storage.get_ask_history(user_id, ask_id)
        if not item:
            return jsonify({"error": "Ask history item not found"}), 404
        return jsonify(item.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.delete("/ask-history/<ask_id>")
@require_auth
def delete_ask_history(ask_id: str):
    user_id = g.user_id
    svc = get_services()
    try:
        success = svc.storage.delete_ask_history(user_id, ask_id)
        if not success:
            return jsonify({"error": "Ask history item not found"}), 404
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# USER SETTINGS ENDPOINTS
# ============================================================================


@bp.get("/settings")
@require_auth
def get_settings():
    """
    Get user settings.

    Returns:
        JSON: UserSettings object
    """
    user_id = g.user_id
    svc = get_services()

    try:
        settings = svc.storage.get_user_settings(user_id)
        return jsonify(settings.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.put("/settings")
@require_auth
def update_settings():
    """
    Update user settings.

    Body:
        JSON: {
            "auto_accept_todos": bool (optional)
        }

    Returns:
        JSON: Updated UserSettings object
    """
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json() or {}

        settings = svc.storage.update_user_settings(
            user_id,
            auto_accept_todos=data.get("auto_accept_todos"),
        )
        return jsonify(settings.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# TODO ENDPOINTS
# ============================================================================


@bp.get("/todos")
@require_auth
def list_todos():
    """
    List todos with optional filtering.

    Query params:
        - status: Filter by status (suggested/accepted/completed)
        - note_id: Filter by note ID
        - limit: Max results (default: 100)
        - offset: Pagination offset (default: 0)

    Returns:
        JSON: {"todos": [...], "total": int, "limit": int, "offset": int}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        status = request.args.get("status")
        note_id = request.args.get("note_id")
        limit, offset = parse_pagination(default_limit=100, max_limit=200)

        todos = svc.storage.list_todos(
            user_id,
            status=status,
            note_id=note_id,
            limit=limit,
            offset=offset,
        )

        return jsonify(
            {
                "todos": [t.model_dump() for t in todos],
                "total": len(todos),
                "limit": limit,
                "offset": offset,
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/todos/<todo_id>")
@require_auth
def get_todo(todo_id: str):
    """
    Get a specific todo by ID.

    Returns:
        JSON: Todo object or 404 error
    """
    user_id = g.user_id
    svc = get_services()

    try:
        todo = svc.storage.get_todo(user_id, todo_id)
        if not todo:
            return jsonify({"error": "Todo not found"}), 404
        return jsonify(todo.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/todos")
@require_auth
def create_todo():
    """
    Create a new todo (manual creation).

    Body:
        JSON: {
            "title": str (required),
            "description": str (optional),
            "note_id": str (optional)
        }

    Returns:
        JSON: Created Todo object
    """
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        title = data.get("title", "").strip()
        if not title:
            return jsonify({"error": "Title is required"}), 400

        todo = svc.storage.create_todo(
            user_id=user_id,
            title=title,
            note_id=data.get("note_id"),
            description=data.get("description"),
            status="accepted",  # Manual todos are auto-accepted
            confidence=None,
            extraction_context=None,
        )

        return jsonify(todo.model_dump()), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.put("/todos/<todo_id>")
@require_auth
def update_todo(todo_id: str):
    """
    Update a todo.

    Body:
        JSON: {
            "title": str (optional),
            "description": str (optional)
        }

    Returns:
        JSON: Updated Todo object or 404 error
    """
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json() or {}

        todo = svc.storage.update_todo(
            user_id,
            todo_id,
            title=data.get("title"),
            description=data.get("description"),
        )

        if not todo:
            return jsonify({"error": "Todo not found"}), 404

        return jsonify(todo.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.delete("/todos/<todo_id>")
@require_auth
def delete_todo(todo_id: str):
    """
    Delete a todo.

    Returns:
        JSON: {"success": bool}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        success = svc.storage.delete_todo(user_id, todo_id)
        if not success:
            return jsonify({"error": "Todo not found"}), 404
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/todos/<todo_id>/accept")
@require_auth
def accept_todo(todo_id: str):
    """
    Accept a suggested todo.

    Returns:
        JSON: Updated Todo object or 404 error
    """
    user_id = g.user_id
    svc = get_services()

    try:
        todo = svc.storage.accept_todo(user_id, todo_id)
        if not todo:
            return jsonify({"error": "Todo not found"}), 404
        return jsonify(todo.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/todos/<todo_id>/complete")
@require_auth
def complete_todo(todo_id: str):
    """
    Mark a todo as completed.

    Returns:
        JSON: Updated Todo object or 404 error
    """
    user_id = g.user_id
    svc = get_services()

    try:
        todo = svc.storage.complete_todo(user_id, todo_id)
        if not todo:
            return jsonify({"error": "Todo not found"}), 404
        return jsonify(todo.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/todos/<todo_id>/dismiss")
@require_auth
def dismiss_todo(todo_id: str):
    """
    Dismiss (delete) a suggested todo.

    Returns:
        JSON: {"success": bool}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        success = svc.storage.dismiss_todo(user_id, todo_id)
        if not success:
            return jsonify({"error": "Todo not found"}), 404
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# NOTE-SPECIFIC TODO ENDPOINTS
# ============================================================================


@bp.get("/notes/<note_id>/todos")
@require_auth
def get_note_todos(note_id: str):
    """
    Get all todos for a specific note.

    Returns:
        JSON: {"todos": [...]}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        todos = svc.storage.list_todos_for_note(user_id, note_id)
        return jsonify({"todos": [t.model_dump() for t in todos]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/notes/<note_id>/todos/accept")
@require_auth
def accept_note_todos(note_id: str):
    """
    Accept selected todos for a note.

    Body:
        JSON: {"todo_ids": [...]}

    Returns:
        JSON: {"accepted": int}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json() or {}
        todo_ids = data.get("todo_ids", [])

        if not todo_ids:
            return jsonify({"error": "No todo_ids provided"}), 400

        # Verify all todos belong to this note
        todos_for_note = svc.storage.list_todos_for_note(user_id, note_id)
        valid_ids = {t.id for t in todos_for_note}
        invalid_ids = [tid for tid in todo_ids if tid not in valid_ids]

        if invalid_ids:
            return jsonify({"error": f"Todos not found for this note: {invalid_ids}"}), 400

        accepted = svc.storage.accept_todos_bulk(user_id, todo_ids)
        return jsonify({"accepted": accepted})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# MEAL TRACKING ENDPOINTS
# ============================================================================


@bp.post("/meals/transcribe")
@require_auth
@require_audio_clips
@require_quota("transcription")
def transcribe_meal():
    """
    Transcribe audio and extract meal data.

    Accepts:
        - multipart/form-data with 'file' field
        - raw audio bytes in request body

    Returns:
        JSON: {
            "text": str,
            "meta": dict,
            "meal": {
                "id": str,
                "meal_type": str,
                "meal_date": str,
                "meal_time": str | null,
                "items": [...]
            },
            "extraction": {
                "confidence": float,
                "reasoning": str
            }
        }
    """
    from datetime import date

    user_id = g.user_id
    svc = get_services()

    # Check for file upload
    content_type = None
    if "file" in request.files:
        file = request.files["file"]
        data = file.read()
        content_type = file.content_type
    else:
        data = request.get_data()
        content_type = request.content_type

    if not data:
        return api_error("No audio data provided", 400)

    try:
        _cleanup_stale_pending_audio_clips(user_id, svc)

        from uuid import uuid4

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

        # Step 1: Transcribe audio
        try:
            text, meta = transcribe_bytes(data, content_type)
        except ValueError as e:
            with suppress(Exception):
                s3_audio.delete_object(storage_key=audio_storage_key)
            svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
            return api_error(str(e), 400)
        except Exception as e:
            error_msg = str(e)
            if "corrupted" in error_msg.lower() or "unsupported" in error_msg.lower():
                with suppress(Exception):
                    s3_audio.delete_object(storage_key=audio_storage_key)
                svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
                return api_error(
                    "Audio format not supported or corrupted. Please try recording again.",
                    400,
                )
            with suppress(Exception):
                s3_audio.delete_object(storage_key=audio_storage_key)
            svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
            raise

        # Record transcription usage
        audio_duration = meta.get("duration")
        if audio_duration is not None:
            svc.usage_tracking.record_usage(
                user_id=user_id,
                service_type="transcription",
                model=meta.get("model", "gpt-4o-mini-transcribe"),
                audio_seconds=float(audio_duration),
                endpoint="/api/meals/transcribe",
            )

        # Step 2: Extract meal data using AI
        current_date = date.today().isoformat()
        extraction_result = svc.meal_extractor.extract(text, current_date)

        # Resolve meal date
        meal_date = extraction_result.meal_date or current_date

        # Step 3: Save meal entry to database
        from .services.models import MealEntryMetadata

        meal_metadata = MealEntryMetadata(
            meal_type=extraction_result.meal_type.value,
            meal_date=meal_date,
            meal_time=extraction_result.meal_time,
            confidence=extraction_result.confidence,
            transcription_duration=meta.get("duration"),
            model_version=meta.get("model"),
        )

        food_items = [
            {
                "name": item.name,
                "portion": item.portion,
                "confidence": item.confidence,
            }
            for item in extraction_result.food_items
        ]

        meal_id = svc.storage.save_meal_entry(
            user_id=user_id,
            transcription=text,
            metadata=meal_metadata,
            food_items=food_items,
        )

        # Mark audio clip ready
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

        # Step 4: Generate embedding for meal (best-effort)
        try:
            import hashlib

            from .services.embeddings import vector_to_json, vector_to_pg_literal

            content_for_embedding = f"{extraction_result.meal_type.value}: {text}"
            vec = svc.embeddings.embed_query(content_for_embedding)
            content_hash = hashlib.sha256(content_for_embedding.encode()).hexdigest()
            embedding_value = (
                vector_to_pg_literal(vec)
                if svc.storage.dialect == "postgresql"
                else vector_to_json(vec)
            )
            svc.storage.upsert_meal_embedding(
                user_id=user_id,
                meal_entry_id=meal_id,
                embedding_model=svc.embeddings.model,
                content_hash=content_hash,
                embedding_value=embedding_value,
            )
        except Exception as e:
            print(f"Meal embedding failed for {meal_id}: {e}")

        # Get the saved meal to return
        saved_meal = svc.storage.get_meal_entry(user_id, meal_id)

        return jsonify(
            {
                "text": text,
                "meta": meta,
                "audio": {
                    "clip_id": audio_clip_id,
                    "storage_key": audio_storage_key,
                },
                "meal": saved_meal.model_dump() if saved_meal else None,
                "extraction": {
                    "confidence": extraction_result.confidence,
                    "reasoning": extraction_result.reasoning,
                },
            }
        )

    except Exception as e:
        try:
            if "audio_storage_key" in locals():
                s3_audio.delete_object(storage_key=audio_storage_key)
        except Exception:
            pass
        try:
            if "audio_clip_id" in locals():
                svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
        except Exception:
            pass
        return jsonify({"error": str(e)}), 500


@bp.get("/meals")
@require_auth
def list_meals():
    """
    List meals with optional filtering.

    Query params:
        - start_date: Start date in ISO format (required)
        - end_date: End date in ISO format (required)
        - meal_type: Filter by type (optional)
        - limit: Max results (default: 100)
        - offset: Pagination offset (default: 0)

    Returns:
        JSON: {"meals": [...], "total": int}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")

        if not start_date or not end_date:
            return api_error("Query params 'start_date' and 'end_date' are required", 400)

        meal_type = request.args.get("meal_type")
        limit, offset = parse_pagination(default_limit=100, max_limit=500)

        meals = svc.storage.list_meals_by_date_range(
            user_id,
            start_date=start_date,
            end_date=end_date,
            meal_type=meal_type,
            limit=limit,
            offset=offset,
        )

        return jsonify({
            "meals": [m.model_dump() for m in meals],
            "total": len(meals),
            "limit": limit,
            "offset": offset,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/meals/calendar")
@require_auth
def get_meals_calendar():
    """
    Get meals grouped by date for calendar view.

    Query params:
        - year: Year (required)
        - month: Month 1-12 (required)

    Returns:
        JSON: {"calendar": {"2026-01-15": [{id, meal_type, item_count}], ...}}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        year = request.args.get("year")
        month = request.args.get("month")

        if not year or not month:
            return api_error("Query params 'year' and 'month' are required", 400)

        try:
            year_int = int(year)
            month_int = int(month)
            if month_int < 1 or month_int > 12:
                raise ValueError("Month must be 1-12")
        except ValueError as e:
            return api_error(str(e), 400)

        calendar_data = svc.storage.get_meals_calendar(user_id, year_int, month_int)

        return jsonify({"calendar": calendar_data, "year": year_int, "month": month_int})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/meals/<meal_id>")
@require_auth
def get_meal(meal_id: str):
    """
    Get a specific meal by ID.

    Returns:
        JSON: MealEntry object with items
    """
    user_id = g.user_id
    svc = get_services()

    try:
        meal = svc.storage.get_meal_entry(user_id, meal_id)

        if not meal:
            return api_error("Meal not found", 404)

        return jsonify(meal.model_dump())

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.put("/meals/<meal_id>")
@require_auth
def update_meal(meal_id: str):
    """
    Update a meal entry.

    Body:
        JSON: {
            "meal_type": str (optional),
            "meal_date": str (optional),
            "meal_time": str (optional),
            "transcription": str (optional)
        }

    Returns:
        JSON: Updated MealEntry object
    """
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json()
        if not data:
            return api_error("No data provided", 400)

        success = svc.storage.update_meal_entry(
            user_id,
            meal_id,
            meal_type=data.get("meal_type"),
            meal_date=data.get("meal_date"),
            meal_time=data.get("meal_time"),
            transcription=data.get("transcription"),
        )

        if not success:
            return api_error("Meal not found", 404)

        updated_meal = svc.storage.get_meal_entry(user_id, meal_id)
        return jsonify(updated_meal.model_dump() if updated_meal else {})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.delete("/meals/<meal_id>")
@require_auth
def delete_meal(meal_id: str):
    """
    Delete a meal entry.

    Returns:
        JSON: {"success": bool}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        success = svc.storage.delete_meal_entry(user_id, meal_id)

        if not success:
            return api_error("Meal not found", 404)

        return jsonify({"success": True})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/meals/<meal_id>/items")
@require_auth
def add_meal_item(meal_id: str):
    """
    Add a food item to a meal.

    Body:
        JSON: { "name": str, "portion": str (optional) }

    Returns:
        JSON: Created MealItem object
    """
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json()
        if not data:
            return api_error("No data provided", 400)

        name = (data.get("name") or "").strip()
        if not name:
            return api_error("'name' is required", 400)

        item = svc.storage.add_meal_item(
            user_id,
            meal_id,
            name=name,
            portion=data.get("portion"),
        )

        if not item:
            return api_error("Meal not found", 404)

        return jsonify(item.model_dump()), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.put("/meals/<meal_id>/items/<item_id>")
@require_auth
def update_meal_item(meal_id: str, item_id: str):
    """
    Update a food item.

    Body:
        JSON: { "name": str (optional), "portion": str (optional) }

    Returns:
        JSON: Updated MealItem object
    """
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json() or {}

        item = svc.storage.update_meal_item(
            user_id,
            item_id,
            name=data.get("name"),
            portion=data.get("portion"),
        )

        if not item:
            return api_error("Item not found", 404)

        return jsonify(item.model_dump())

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.delete("/meals/<meal_id>/items/<item_id>")
@require_auth
def delete_meal_item(meal_id: str, item_id: str):
    """
    Delete a food item.

    Returns:
        JSON: {"success": bool}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        success = svc.storage.delete_meal_item(user_id, item_id)

        if not success:
            return api_error("Item not found", 404)

        return jsonify({"success": True})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# USAGE TRACKING ENDPOINTS
# ============================================================================


@bp.get("/usage")
@require_auth
def get_usage():
    """
    Get current usage summary and quota status.

    Returns:
        JSON: {
            "user_id": str,
            "period_start": str,
            "period_end": str,
            "transcription_minutes_used": float,
            "transcription_minutes_limit": int,
            "ai_calls_used": int,
            "ai_calls_limit": int,
            "estimated_cost_usd": float,
            "tier": str
        }
    """
    user_id = g.user_id
    svc = get_services()

    try:
        usage = svc.usage_tracking.get_current_usage(user_id)
        return jsonify(usage.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/usage/history")
@require_auth
def get_usage_history():
    """
    Get detailed usage history (paginated).

    Query params:
        - limit: Max results (default: 50)
        - offset: Pagination offset (default: 0)
        - service_type: Filter by service type (optional)

    Returns:
        JSON: {"records": [...], "total": int, "limit": int, "offset": int}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        limit, offset = parse_pagination(default_limit=50, max_limit=100)
        service_type = request.args.get("service_type")

        records = svc.usage_tracking.get_usage_history(
            user_id,
            limit=limit,
            offset=offset,
            service_type=service_type,
        )

        return jsonify(
            {
                "records": [r.model_dump() for r in records],
                "total": len(records),
                "limit": limit,
                "offset": offset,
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# FEEDBACK ENDPOINTS
# ============================================================================


@bp.post("/feedback")
@require_auth
def create_feedback():
    """
    Submit user feedback (bug reports, feature requests, general feedback).

    Body:
        JSON: {
            "feedback_type": str (required: "bug", "feature", "general"),
            "title": str (required),
            "description": str (optional),
            "rating": int (optional: 1-5)
        }

    Returns:
        JSON: FeedbackResponse object
    """
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json()
        if not data:
            return api_error("No data provided", 400)

        feedback_type = (data.get("feedback_type") or "").strip()
        if feedback_type not in ("bug", "feature", "general"):
            return api_error("feedback_type must be 'bug', 'feature', or 'general'", 400)

        title = (data.get("title") or "").strip()
        if not title:
            return api_error("title is required", 400)
        if len(title) > 255:
            return api_error("title must be 255 characters or less", 400)

        description = data.get("description")
        if description:
            description = description.strip()
            if len(description) > 5000:
                return api_error("description must be 5000 characters or less", 400)

        rating = data.get("rating")
        if rating is not None:
            try:
                rating = int(rating)
                if rating < 1 or rating > 5:
                    return api_error("rating must be between 1 and 5", 400)
            except (TypeError, ValueError):
                return api_error("rating must be an integer", 400)

        feedback = svc.storage.create_feedback(
            user_id=user_id,
            feedback_type=feedback_type,
            title=title,
            description=description,
            rating=rating,
        )

        return jsonify(feedback.model_dump()), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/feedback")
@require_auth
def list_feedback():
    """
    List user's feedback submissions.

    Query params:
        - limit: Max results (default: 50)
        - offset: Pagination offset (default: 0)

    Returns:
        JSON: {"feedback": [...], "total": int, "limit": int, "offset": int}
    """
    user_id = g.user_id
    svc = get_services()

    try:
        limit, offset = parse_pagination(default_limit=50, max_limit=100)

        feedback_list = svc.storage.list_feedback(user_id, limit=limit, offset=offset)

        return jsonify(
            {
                "feedback": [f.model_dump() for f in feedback_list],
                "total": len(feedback_list),
                "limit": limit,
                "offset": offset,
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# UTILITY ENDPOINTS
# ============================================================================


@bp.get("/health")
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})
