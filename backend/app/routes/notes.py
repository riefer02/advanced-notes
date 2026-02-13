from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..config import Config
from ..services import s3_audio
from ..services.container import get_services
from ..services.models import NoteMetadata
from ._helpers import api_error, parse_pagination

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

        return jsonify(
            {
                "notes": [note.model_dump() for note in notes],
                "total": len(notes),
                "limit": limit,
                "offset": offset,
            }
        )

    except Exception as e:
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)


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
                        warning = f"Failed to delete one or more audio objects: {e}"
            except Exception as e:
                warning = f"Failed to list/delete note audio clips: {e}"

            try:
                svc.storage.delete_audio_clips_for_note(user_id, note_id)
            except Exception as e:
                return api_error(f"Failed to delete note audio clips: {e}", 500)

        success = svc.storage.delete_note(user_id, note_id)

        if not success:
            return api_error("Note not found", 404)

        payload = {"success": True, "message": f"Note {note_id} deleted successfully"}
        if warning:
            payload["warning"] = warning
        return jsonify(payload)

    except Exception as e:
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)
