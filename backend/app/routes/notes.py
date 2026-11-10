import logging

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..config import Config
from ..services import s3_audio
from ..services.container import get_services
from ..services.models import NoteMetadata
from ..services.resilience import with_fallback
from ..services.storage.notes import NOTE_VIEWS
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
        view = (request.args.get("view") or "active").strip().lower()
        if view not in NOTE_VIEWS:
            return api_error(f"view must be one of {sorted(NOTE_VIEWS)}", 400)
        limit, offset = parse_pagination(default_limit=50, max_limit=100)

        notes = svc.storage.list_notes(
            user_id=user_id,
            folder=folder,
            limit=limit,
            offset=offset,
            view=view,
        )
        total = svc.storage.get_note_count(user_id=user_id, folder=folder, view=view)

        return jsonify(
            {
                "notes": [note.model_dump() for note in notes],
                "total": total,
                "limit": limit,
                "offset": offset,
                "view": view,
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
            source="manual",
            language=(str(data.get("language") or "").strip()[:10] or None),
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
        if note.deleted_at is not None:
            return api_error("Restore this note from Trash before editing it", 409)

        content = data.get("content", note.content)

        metadata = NoteMetadata(
            title=data.get("title", note.title),
            summary=data.get("summary", note.summary),
            folder_path=data.get("folder_path", note.folder_path),
            tags=data.get("tags", note.tags),
            confidence=note.confidence,
            transcription_duration=note.transcription_duration,
            model_version=note.model_version,
            source=note.source,
            language=note.language,
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
    """Move a note to Trash (user-scoped). Audio and history are preserved."""
    user_id = g.user_id
    svc = get_services()

    try:
        success = svc.storage.delete_note(user_id, note_id)
        if not success:
            return api_error("Note not found", 404)

        return jsonify(
            {
                "success": True,
                "message": f"Note {note_id} moved to trash",
                "deleted": True,
            }
        )

    except Exception as e:
        return api_error_from_exception(e)


@bp.post("/notes/<note_id>/restore")
@require_auth
def restore_note(note_id: str):
    """Restore a note from Trash back to the active list."""
    user_id = g.user_id
    svc = get_services()

    try:
        if not svc.storage.restore_deleted_note(user_id, note_id):
            return api_error("Note not found in trash", 404)
        note = svc.storage.get_note(user_id, note_id)
        return jsonify(note.model_dump() if note else {"success": True})

    except Exception as e:
        return api_error_from_exception(e)


@bp.delete("/notes/<note_id>/permanent")
@require_auth
def purge_note(note_id: str):
    """Permanently delete a trashed note, its audio, vectors, and revisions."""
    user_id = g.user_id
    svc = get_services()

    try:
        note = svc.storage.get_note(user_id, note_id)
        if not note:
            return api_error("Note not found", 404)
        if note.deleted_at is None:
            return api_error("Move the note to Trash before deleting it permanently", 409)

        warning = None
        if Config.audio_clips_enabled():
            try:
                clips = svc.storage.list_audio_clips_for_note(user_id, note_id)
                for clip in clips:
                    try:
                        s3_audio.delete_object(storage_key=clip.storage_key)
                    except Exception as e:
                        logger.warning(
                            "Failed to delete an audio object for note %s: %s",
                            note_id,
                            e,
                        )
                        warning = "Failed to delete one or more audio objects"
            except Exception as e:
                logger.warning(
                    "Failed to list/delete audio clips for note %s: %s", note_id, e
                )
                warning = "Failed to list or delete note audio clips"

            try:
                svc.storage.delete_audio_clips_for_note(user_id, note_id)
            except Exception as e:
                return api_error_from_exception(
                    e, message="Failed to delete note audio clips"
                )

        if not svc.storage.purge_note(user_id, note_id):
            return api_error("Note not found", 404)

        payload = {"success": True, "message": f"Note {note_id} permanently deleted"}
        if warning:
            payload["warning"] = warning
        return jsonify(payload)

    except Exception as e:
        return api_error_from_exception(e)


@bp.post("/notes/<note_id>/pin")
@require_auth
def pin_note(note_id: str):
    """Pin or unpin a note. Body: {"pinned": true|false}."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json(silent=True) or {}
        pinned = bool(data.get("pinned", True))
        if not svc.storage.set_note_pinned(user_id, note_id, pinned):
            return api_error("Note not found", 404)
        note = svc.storage.get_note(user_id, note_id)
        return jsonify(note.model_dump() if note else {"success": True})

    except Exception as e:
        return api_error_from_exception(e)


@bp.post("/notes/<note_id>/archive")
@require_auth
def archive_note(note_id: str):
    """Archive or unarchive a note. Body: {"archived": true|false}."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json(silent=True) or {}
        archived = bool(data.get("archived", True))
        if not svc.storage.set_note_archived(user_id, note_id, archived):
            return api_error("Note not found", 404)
        note = svc.storage.get_note(user_id, note_id)
        return jsonify(note.model_dump() if note else {"success": True})

    except Exception as e:
        return api_error_from_exception(e)


@bp.get("/notes/<note_id>/revisions")
@require_auth
def list_note_revisions(note_id: str):
    """List saved snapshots for a note, newest first."""
    user_id = g.user_id
    svc = get_services()

    try:
        note = svc.storage.get_note(user_id, note_id)
        if not note:
            return api_error("Note not found", 404)
        limit, offset = parse_pagination(default_limit=50, max_limit=100)
        revisions = svc.storage.list_note_revisions(
            user_id, note_id, limit=limit, offset=offset
        )
        return jsonify(
            {
                "revisions": [revision.model_dump() for revision in revisions],
                "current_version": note.version,
                "limit": limit,
                "offset": offset,
            }
        )

    except Exception as e:
        return api_error_from_exception(e)


@bp.post("/notes/<note_id>/revisions/<int:version>/restore")
@require_auth
def restore_note_revision(note_id: str, version: int):
    """Replace the note with a saved snapshot (the current state is snapshotted)."""
    user_id = g.user_id
    svc = get_services()

    try:
        if not svc.storage.restore_note_revision(user_id, note_id, version):
            return api_error("Note or revision not found", 404)
        note = svc.storage.get_note(user_id, note_id)
        if note is None:
            return api_error("Note not found", 404)

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

        return jsonify(note.model_dump())

    except Exception as e:
        return api_error_from_exception(e)


@bp.get("/notes/<note_id>/transcripts")
@require_auth
def list_transcripts(note_id: str):
    """List raw ASR transcripts stored for a note."""
    user_id = g.user_id
    svc = get_services()

    try:
        note = svc.storage.get_note(user_id, note_id)
        if not note:
            return api_error("Note not found", 404)
        return jsonify(
            {
                "transcripts": svc.storage.list_transcripts_for_note(
                    user_id, note_id
                )
            }
        )

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


@bp.post("/folders/<path:folder_path>/rename")
@require_auth
def rename_folder(folder_path: str):
    """Rename a folder subtree (user-scoped)."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json(silent=True) or {}
        new_path = str(data.get("new_path") or "").strip()
        if not new_path:
            return api_error("new_path is required", 400)

        result = svc.storage.rename_folder(user_id, folder_path, new_path)
        if result == -1:
            return api_error("Folder not found", 404)
        if result == -2:
            return api_error("Target folder already exists", 409)
        if result == -3:
            return api_error("Cannot move a folder into itself", 400)

        return jsonify(
            {
                "success": True,
                "old_path": folder_path,
                "new_path": new_path,
                "renamed_notes": result,
            }
        )

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
        if stats is None:
            return api_error("Folder not found", 404)

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
