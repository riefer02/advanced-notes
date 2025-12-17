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

from flask import Blueprint, request, jsonify, g

from .asr import transcribe_bytes
from .auth import require_auth
from .services.ask_service import RetrievedNote
from .services import s3_audio
from .services.embeddings import (
    build_note_embedding_text,
    content_hash,
    vector_to_json,
    vector_to_pg_literal,
)
from .services.models import NoteMetadata
from .services.container import get_services
from .services.folder_utils import extract_folder_paths

bp = Blueprint("api", __name__)

def _json_error(message: str, status: int = 400):
    return jsonify({"error": message}), status


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
        # Pre-allocate an audio clip + upload raw bytes to S3 so the original audio is preserved.
        # This is the canonical "audio note" flow: note text is derived from audio, but we always keep the source.
        from uuid import uuid4

        audio_clip_id = str(uuid4())
        # Ensure we always derive a stable extension from the MIME type.
        audio_storage_key = s3_audio.object_key_for_clip(
            user_id=user_id,
            clip_id=audio_clip_id,
            mime_type=content_type or "application/octet-stream",
        )
        # Store the bytes immediately; if transcription fails, the clip will remain orphaned and can be cleaned up later.
        # (We can tighten this later by uploading only after successful transcription.)
        s3_audio.put_object_bytes(
            storage_key=audio_storage_key,
            content_type=content_type or "application/octet-stream",
            data=data,
        )

        # Step 1: Transcribe audio
        try:
            text, meta = transcribe_bytes(data, content_type)
        except ValueError as e:
            # Validation errors (empty audio, too small, etc.)
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            # OpenAI API errors
            error_msg = str(e)
            if "corrupted" in error_msg.lower() or "unsupported" in error_msg.lower():
                return jsonify(
                    {
                        "error": "Audio format not supported or corrupted. Please try recording again."
                    }
                ), 400
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

        # Persist audio clip metadata linked to the new note.
        duration_ms = None
        try:
            dur = meta.get("duration")
            if dur is not None:
                duration_ms = int(float(dur) * 1000.0)
        except Exception:
            duration_ms = None

        svc.storage.create_audio_clip_pending(
            user_id,
            clip_id=audio_clip_id,
            note_id=note_id,
            mime_type=content_type or "application/octet-stream",
            bytes=len(data),
            duration_ms=duration_ms,
            storage_key=audio_storage_key,
            bucket=None,
        )
        svc.storage.mark_audio_clip_ready(user_id, audio_clip_id)

        # Step 3.5: Upsert embedding for semantic search (best-effort)
        try:
            embedding_text = build_note_embedding_text(
                title=note_metadata.title,
                content=text,
                tags=note_metadata.tags,
            )
            h = content_hash(embedding_text)
            vec = svc.embeddings.embed_text(embedding_text)
            emb_value = (
                vector_to_pg_literal(vec)
                if svc.storage.dialect == "postgresql"
                else vector_to_json(vec)
            )
            svc.storage.upsert_note_embedding(
                user_id=user_id,
                note_id=note_id,
                embedding_model=svc.embeddings.model,
                content_hash=h,
                embedding_value=emb_value,
            )
        except Exception as e:
            # Do not fail the transcription flow if embeddings fail.
            print(f"Embedding upsert failed for note {note_id}: {e}")

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
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# AUDIO CLIPS (UPLOAD + PLAYBACK)
# ============================================================================


@bp.post("/audio-clips")
@require_auth
def create_audio_clip_upload():
    """
    Create a pending audio clip row and return a presigned S3 PUT URL for direct upload.

    Body JSON:
      { note_id?: str, mime_type: str, bytes: int, duration_ms?: int }
    """
    user_id = g.user_id
    svc = get_services()
    data = request.get_json(silent=True) or {}

    mime_type = (data.get("mime_type") or "").strip()
    if not mime_type:
        return _json_error("Body field 'mime_type' is required")

    try:
        bytes_value = int(data.get("bytes") or 0)
    except Exception:
        return _json_error("Body field 'bytes' must be an integer")
    if bytes_value <= 0:
        return _json_error("Body field 'bytes' must be > 0")

    note_id = data.get("note_id")
    duration_ms = data.get("duration_ms")
    if duration_ms is not None:
        try:
            duration_ms = int(duration_ms)
        except Exception:
            return _json_error("Body field 'duration_ms' must be an integer")

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
def complete_audio_clip_upload(clip_id: str):
    """
    Mark a pending clip as ready after the client successfully PUTs to S3.
    """
    user_id = g.user_id
    svc = get_services()

    clip = svc.storage.mark_audio_clip_ready(user_id, clip_id)
    if not clip:
        return _json_error("Audio clip not found", 404)
    return jsonify({"clip": clip.model_dump()})


@bp.get("/audio-clips/<clip_id>/playback")
@require_auth
def get_audio_clip_playback(clip_id: str):
    """
    Return a presigned GET URL for playback.
    """
    user_id = g.user_id
    svc = get_services()

    clip = svc.storage.get_audio_clip(user_id, clip_id)
    if not clip:
        return _json_error("Audio clip not found", 404)
    if clip.status != "ready":
        return _json_error("Audio clip is not ready", 409)

    dl = s3_audio.presign_get_object(storage_key=clip.storage_key)
    return jsonify({"url": dl.url, "expires_at": dl.expires_at})


@bp.delete("/audio-clips/<clip_id>")
@require_auth
def delete_audio_clip(clip_id: str):
    """
    Delete audio clip metadata row (best-effort; does not delete S3 object in v1).
    """
    user_id = g.user_id
    svc = get_services()

    success = svc.storage.delete_audio_clip(user_id, clip_id)
    if not success:
        return _json_error("Audio clip not found", 404)
    return jsonify({"success": True})


@bp.get("/notes/<note_id>/audio")
@require_auth
def get_primary_audio_clip_for_note(note_id: str):
    """
    Convenience endpoint: return the note's primary (most recent ready) audio clip + playback URL.
    """
    user_id = g.user_id
    svc = get_services()

    clip = svc.storage.get_primary_audio_clip_for_note(user_id, note_id)
    if not clip:
        return _json_error("Audio clip not found", 404)

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
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))

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
        try:
            if updated_note:
                embedding_text = build_note_embedding_text(
                    title=updated_note.title,
                    content=updated_note.content,
                    tags=updated_note.tags,
                )
                h = content_hash(embedding_text)
                vec = svc.embeddings.embed_text(embedding_text)
                emb_value = (
                    vector_to_pg_literal(vec)
                    if svc.storage.dialect == "postgresql"
                    else vector_to_json(vec)
                )
                svc.storage.upsert_note_embedding(
                    user_id=user_id,
                    note_id=updated_note.id,
                    embedding_model=svc.embeddings.model,
                    content_hash=h,
                    embedding_value=emb_value,
                )
        except Exception as e:
            print(f"Embedding upsert failed for note {note_id}: {e}")

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
        success = svc.storage.delete_note(user_id, note_id)

        if not success:
            return jsonify({"error": "Note not found"}), 404

        return jsonify(
            {"success": True, "message": f"Note {note_id} deleted successfully"}
        )

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
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))
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
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))
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
# UTILITY ENDPOINTS
# ============================================================================


@bp.get("/health")
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})
