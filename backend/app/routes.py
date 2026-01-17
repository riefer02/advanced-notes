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

from functools import wraps
from typing import Tuple

from flask import Blueprint, request, jsonify, g

from .asr import transcribe_bytes
from .auth import require_auth
from .config import Config
from .services.ask_service import RetrievedNote
from .services import s3_audio
from .services.embeddings import vector_to_json, vector_to_pg_literal
from .services.models import NoteMetadata
from .services.container import get_services
from .services.folder_utils import extract_folder_paths

bp = Blueprint("api", __name__)


# ============================================================================
# ROUTE UTILITIES
# ============================================================================


def api_error(message: str, status: int = 400) -> Tuple[dict, int]:
    """
    Return a standardized JSON error response.

    Args:
        message: Error message to include in response
        status: HTTP status code (default: 400)

    Returns:
        Tuple of (JSON response, status code)
    """
    return jsonify({"error": message}), status


def parse_pagination(default_limit: int = 50, max_limit: int = 100) -> Tuple[int, int]:
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
                "Audio clips are disabled. Set AUDIO_CLIPS_ENABLED=true to enable.",
                501
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
    except ValueError:
        raise ValueError(f"Invalid {name} format: must be a valid UUID")


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
        try:
            s3_audio.delete_object(storage_key=clip.storage_key)
        except Exception:
            pass
    try:
        svc.storage.delete_audio_clips(user_id, [c.id for c in stale])
    except Exception:
        pass


# ============================================================================
# TRANSCRIPTION ENDPOINTS
# ============================================================================


@bp.post("/summarize")
@require_auth
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
        notes_content = [
            f"Title: {n.title}\nContent: {n.content}" for n in recent_notes
        ]

        # 3. Generate summary
        digest_result = svc.summarizer.summarize(notes_content)

        # 4. Save to database (store the structured result as JSON string)
        digest_json = digest_result.model_dump_json()
        digest_id = svc.storage.save_digest(user_id, digest_json)

        return jsonify({**digest_result.model_dump(), "digest_id": digest_id})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/transcribe")
@require_auth
@require_audio_clips
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
            try:
                s3_audio.delete_object(storage_key=audio_storage_key)
            except Exception:
                pass
            svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            # OpenAI API errors
            error_msg = str(e)
            if "corrupted" in error_msg.lower() or "unsupported" in error_msg.lower():
                try:
                    s3_audio.delete_object(storage_key=audio_storage_key)
                except Exception:
                    pass
                svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
                return jsonify(
                    {
                        "error": "Audio format not supported or corrupted. Please try recording again."
                    }
                ), 400
            try:
                s3_audio.delete_object(storage_key=audio_storage_key)
            except Exception:
                pass
            svc.storage.mark_audio_clip_failed(user_id, audio_clip_id)
            raise

        # Step 2: Get AI categorization (user-scoped folders)
        folder_tree = svc.storage.get_folder_tree(user_id)

        existing_folders = extract_folder_paths(folder_tree)
        categorization_result = svc.categorizer.categorize(text, existing_folders)

        # Step 3: Save to database (user-scoped)
        note_metadata = NoteMetadata(
            title=categorization_result.filename.replace(".md", "")
            .replace("-", " ")
            .title(),
            folder_path=categorization_result.folder_path,
            tags=categorization_result.tags,
            confidence=categorization_result.confidence,
            transcription_duration=meta.get("duration"),
            model_version=meta.get("model"),
        )

        note_id = svc.storage.save_note(
            user_id=user_id, content=text, metadata=note_metadata
        )

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
    return jsonify({"clip": clip.model_dump(), "playback": {"url": dl.url, "expires_at": dl.expires_at}})


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

        notes = svc.storage.list_notes(
            user_id=user_id, folder=folder, limit=limit, offset=offset
        )

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

        return jsonify(
            {"query": query, "results": [result.model_dump() for result in results]}
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# ASK NOTES (AI QUERY + SUMMARY)
# ============================================================================


@bp.post("/ask")
@require_auth
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

        fts_query = (
            " ".join(plan.keywords).strip() if plan.keywords else plan.semantic_query
        )

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

        answer = svc.asker.answer(query, plan, retrieved_notes)

        # Persist ask history (compact)
        import json as _json

        source_scores = {
            item["note"].id: float(item.get("score") or 0.0) for item in retrieval
        }
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
# UTILITY ENDPOINTS
# ============================================================================


@bp.get("/health")
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})
