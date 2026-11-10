import logging

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..config import Config
from ..services import s3_audio
from ..services.container import get_services
from ..services.models import NoteMetadata
from ..services.resilience import with_fallback
from ._helpers import api_error, api_error_from_exception, parse_pagination

logger = logging.getLogger(__name__)

bp = Blueprint("notes", __name__)


@bp.get("/notes")
@require_auth
def list_notes():
    """List notes with optional filtering (user-scoped)."""
    user_id = g.user_id
    svc = get_services()

    try:
        folder = request.args.get("folder")
        limit, offset = parse_pagination(default_limit=50, max_limit=100)

        notes = svc.storage.list_notes(user_id=user_id, folder=folder, limit=limit, offset=offset)
        total = svc.storage.get_note_count(user_id=user_id, folder=folder)

        return jsonify(
            {
                "notes": [note.model_dump() for note in notes],
                "total": total,
                "limit": limit,
                "offset": offset,
            }
        )

    except Exception as e:
        return api_error_from_exception(e)


@bp.post("/notes")
@require_auth
def create_note():
    """Create a manual (typed) note without audio transcription.

    The AI pipeline is optional here: the user's text is saved exactly as
    written, with a lightweight embedding refresh so it is still reachable
    from semantic search.
    """
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json(silent=True) or {}

        content = str(data.get("content") or "").strip()
        if not content:
            return api_error("content is required", 400)
        if len(content) > 200_000:
            return api_error("content must be 200,000 characters or less", 400)

        raw_title = str(data.get("title") or "").strip()
        first_line = content.splitlines()[0].strip()
        title = (raw_title or first_line or "Untitled note")[:500]

        summary_value = data.get("summary")
        summary = str(summary_value).strip()[:1000] if summary_value else None

        raw_folder = str(data.get("folder_path") or "").strip()
        folder_path = "/".join(part.strip() for part in raw_folder.split("/") if part.strip())
        folder_path = folder_path[:500] or "inbox"

        raw_tags = data.get("tags") or []
        if isinstance(raw_tags, str):
            raw_tags = raw_tags.split(",")
        tags: list[str] = []
        for tag in raw_tags if isinstance(raw_tags, list) else []:
            cleaned = str(tag).strip().lower()[:50]
            if cleaned and cleaned not in tags:
                tags.append(cleaned)
            if len(tags) >= 20:
                break

        metadata = NoteMetadata(
            title=title,
            summary=summary,
            folder_path=folder_path,
            tags=tags,
            confidence=1.0,  # human-authored, not an AI guess
            transcription_duration=None,
            model_version="manual",
        )

        note_id = svc.storage.save_note(user_id, content, metadata)
        note = svc.storage.get_note(user_id, note_id)

        if note is None:
            return api_error("Failed to create note", 500)

        # Best-effort: never fail a saved note because the embedding call failed.
        with_fallback(
            lambda: svc.embeddings.upsert_for_note(
                storage=svc.storage,
                user_id=user_id,
                note_id=note.id,
                title=note.title,
                content=note.content,
                tags=note.tags,
                summary=note.summary,
            ),
            fallback=None,
            service="embeddings",
        )

        return jsonify(note.model_dump()), 201

    except Exception as e:
        return api_error_from_exception(e)


@bp.get("/notes/<note_id>")
@require_auth
def get_note(note_id: str):
    """Get a specific note by ID (user-scoped)."""
    user_id = g.user_id
    svc = get_services()

    try:
        note = svc.storage.get_note(user_id, note_id)

        if not note:
            return api_error("Note not found", 404)

        return jsonify(note.model_dump())

    except Exception as e:
        return api_error_from_exception(e)


@bp.put("/notes/<note_id>")
@require_auth
def update_note(note_id: str):
    """Update an existing note (user-scoped)."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json()

        if not data:
            return api_error("No data provided", 400)

        note = svc.storage.get_note(user_id, note_id)
        if not note:
            return api_error("Note not found", 404)

        content = data.get("content", note.content)

        metadata = NoteMetadata(
            title=data.get("title", note.title),
            summary=data.get("summary", note.summary),
            folder_path=data.get("folder_path", note.folder_path),
            tags=data.get("tags", note.tags),
            confidence=note.confidence,
            transcription_duration=note.transcription_duration,
            model_version=note.model_version,
        )

        success = svc.storage.update_note(user_id, note_id, content, metadata)

        if not success:
            return api_error("Failed to update note", 500)

        updated_note = svc.storage.get_note(user_id, note_id)

        # Best-effort embedding refresh: never fail a saved update over it.
        if updated_note:
            with_fallback(
                lambda: svc.embeddings.upsert_for_note(
                    storage=svc.storage,
                    user_id=user_id,
                    note_id=updated_note.id,
                    title=updated_note.title,
                    content=updated_note.content,
                    tags=updated_note.tags,
                    summary=updated_note.summary,
                ),
                fallback=None,
                service="embeddings",
            )

        return jsonify(updated_note.model_dump())

    except Exception as e:
        return api_error_from_exception(e)


@bp.delete("/notes/<note_id>")
@require_auth
def delete_note(note_id: str):
    """Delete a note by ID (user-scoped)."""
    user_id = g.user_id
    svc = get_services()

    try:
        warning = None
        if Config.audio_clips_enabled():
            try:
                clips = svc.storage.list_audio_clips_for_note(user_id, note_id)
                for clip in clips:
                    try:
                        s3_audio.delete_object(storage_key=clip.storage_key)
                    except Exception as e:
                        logger.warning(
                            "Failed to delete an audio object for note %s: %s", note_id, e
                        )
                        warning = "Failed to delete one or more audio objects"
            except Exception as e:
                logger.warning("Failed to list/delete audio clips for note %s: %s", note_id, e)
                warning = "Failed to list or delete note audio clips"

            try:
                svc.storage.delete_audio_clips_for_note(user_id, note_id)
            except Exception as e:
                return api_error_from_exception(
                    e, message="Failed to delete note audio clips"
                )

        success = svc.storage.delete_note(user_id, note_id)

        if not success:
            return api_error("Note not found", 404)

        payload = {"success": True, "message": f"Note {note_id} deleted successfully"}
        if warning:
            payload["warning"] = warning
        return jsonify(payload)

    except Exception as e:
        return api_error_from_exception(e)


# ============================================================================
# FOLDER ENDPOINTS
# ============================================================================


@bp.get("/folders")
@require_auth
def get_folders():
    """Get the complete folder hierarchy tree (user-scoped)."""
    user_id = g.user_id
    svc = get_services()

    try:
        folder_tree = svc.storage.get_folder_tree(user_id)

        return jsonify({"folders": folder_tree.model_dump()})

    except Exception as e:
        return api_error_from_exception(e)


@bp.get("/folders/<path:folder_path>/stats")
@require_auth
def get_folder_stats(folder_path: str):
    """Get statistics for a specific folder (user-scoped)."""
    user_id = g.user_id
    svc = get_services()

    try:
        stats = svc.storage.get_folder_stats(user_id, folder_path)

        return jsonify(stats.model_dump())

    except Exception as e:
        return api_error_from_exception(e)


# ============================================================================
# TAG ENDPOINTS
# ============================================================================


@bp.get("/tags")
@require_auth
def get_tags():
    """Get all unique tags across user's notes."""
    user_id = g.user_id
    svc = get_services()

    try:
        tags = svc.storage.get_all_tags(user_id)

        return jsonify({"tags": tags})

    except Exception as e:
        return api_error_from_exception(e)


@bp.get("/tags/<tag>/notes")
@require_auth
def get_notes_by_tag(tag: str):
    """Get all notes with a specific tag (user-scoped)."""
    user_id = g.user_id
    svc = get_services()

    try:
        notes = svc.storage.get_notes_by_tag(user_id, tag)

        return jsonify({"tag": tag, "notes": [note.model_dump() for note in notes]})

    except Exception as e:
        return api_error_from_exception(e)


# ============================================================================
# SEARCH ENDPOINTS
# ============================================================================


@bp.get("/search")
@require_auth
def search_notes():
    """Full-text search across user's notes."""
    user_id = g.user_id
    svc = get_services()

    try:
        query = request.args.get("q")

        if not query:
            return api_error("Query parameter 'q' is required", 400)

        results = svc.storage.search_notes(user_id, query)

        return jsonify({"query": query, "results": [result.model_dump() for result in results]})

    except Exception as e:
        return api_error_from_exception(e)
