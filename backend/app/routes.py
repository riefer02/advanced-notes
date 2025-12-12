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
from .services.ai_categorizer import AICategorizationService
from .services.ask_service import AskService, RetrievedNote
from .services.embeddings import (
    EmbeddingsService,
    build_note_embedding_text,
    content_hash,
    vector_to_json,
    vector_to_pg_literal,
)
from .services.query_planner import QueryPlanner
from .services.summarizer import AISummarizerService
from .services.storage import NoteStorage
from .services.models import NoteMetadata, FolderNode

bp = Blueprint("api", __name__)

# Initialize services
categorizer = AICategorizationService()
summarizer = AISummarizerService()
storage = NoteStorage()
planner = QueryPlanner()
asker = AskService()
embeddings = EmbeddingsService()


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
    
    try:
        # 1. Fetch recent notes
        recent_notes = storage.get_recent_notes(user_id, limit=10)
        
        if not recent_notes:
            return jsonify({
                "summary": "No recent notes found to summarize. Record some thoughts first!",
                "key_themes": [],
                "action_items": [],
                "digest_id": None
            })
            
        # 2. Extract content
        notes_content = [f"Title: {n.title}\nContent: {n.content}" for n in recent_notes]
        
        # 3. Generate summary
        digest_result = summarizer.summarize(notes_content)
        
        # 4. Save to database
        # We store the full structured result (summary + themes + actions) as a JSON string
        # so we can retrieve the rich format later.
        import json
        digest_json = digest_result.model_dump_json()
        digest_id = storage.save_digest(user_id, digest_json)
        
        return jsonify({
            **digest_result.model_dump(),
            "digest_id": digest_id
        })
        
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
                return jsonify({
                    "error": "Audio format not supported or corrupted. Please try recording again."
                }), 400
            raise

        # Step 2: Get AI categorization (user-scoped folders)
        folder_tree = storage.get_folder_tree(user_id)

        # Extract all folder paths from tree for AI context
        def extract_folder_paths(node: "FolderNode", paths: list = None) -> list:
            if paths is None:
                paths = []
            if node.path:  # Skip empty root
                paths.append(node.path)
            for subfolder in node.subfolders:
                extract_folder_paths(subfolder, paths)
            return paths

        existing_folders = extract_folder_paths(folder_tree)
        categorization_result = categorizer.categorize(text, existing_folders)

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

        note_id = storage.save_note(user_id=user_id, content=text, metadata=note_metadata)

        # Step 3.5: Upsert embedding for semantic search (best-effort)
        try:
            embedding_text = build_note_embedding_text(
                title=note_metadata.title,
                content=text,
                tags=note_metadata.tags,
            )
            h = content_hash(embedding_text)
            vec = embeddings.embed_text(embedding_text)
            emb_value = (
                vector_to_pg_literal(vec) if storage.dialect == "postgresql" else vector_to_json(vec)
            )
            storage.upsert_note_embedding(
                user_id=user_id,
                note_id=note_id,
                embedding_model=embeddings.model,
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
    
    try:
        folder = request.args.get("folder")
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))

        notes = storage.list_notes(user_id=user_id, folder=folder, limit=limit, offset=offset)

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
    
    try:
        note = storage.get_note(user_id, note_id)

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
    
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Get existing note (user-scoped)
        note = storage.get_note(user_id, note_id)
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

        success = storage.update_note(user_id, note_id, content, metadata)

        if not success:
            return jsonify({"error": "Failed to update note"}), 500

        # Return updated note
        updated_note = storage.get_note(user_id, note_id)

        # Best-effort embedding refresh
        try:
            if updated_note:
                embedding_text = build_note_embedding_text(
                    title=updated_note.title,
                    content=updated_note.content,
                    tags=updated_note.tags,
                )
                h = content_hash(embedding_text)
                vec = embeddings.embed_text(embedding_text)
                emb_value = (
                    vector_to_pg_literal(vec) if storage.dialect == "postgresql" else vector_to_json(vec)
                )
                storage.upsert_note_embedding(
                    user_id=user_id,
                    note_id=updated_note.id,
                    embedding_model=embeddings.model,
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
    
    try:
        success = storage.delete_note(user_id, note_id)

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
    
    try:
        folder_tree = storage.get_folder_tree(user_id)

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
    
    try:
        stats = storage.get_folder_stats(user_id, folder_path)

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
    
    try:
        tags = storage.get_all_tags(user_id)

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
    
    try:
        notes = storage.get_notes_by_tag(user_id, tag)

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
    
    try:
        query = request.args.get("q")

        if not query:
            return jsonify({"error": "Query parameter 'q' is required"}), 400

        results = storage.search_notes(user_id, query)

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
    data = request.get_json(silent=True) or {}

    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "Body field 'query' is required"}), 400

    max_results = int(data.get("max_results", 12) or 12)
    max_results = max(1, min(max_results, 50))
    debug = bool(data.get("debug", False))

    try:
        known_tags = storage.get_all_tags(user_id)
        folder_tree = storage.get_folder_tree(user_id)

        def extract_folder_paths(node: FolderNode, paths: list[str] | None = None) -> list[str]:
            if paths is None:
                paths = []
            if node.path:
                paths.append(node.path)
            for sub in node.subfolders:
                extract_folder_paths(sub, paths)
            return paths

        known_folders = extract_folder_paths(folder_tree)

        plan = planner.plan(
            question=query,
            known_tags=known_tags,
            known_folders=known_folders,
            result_limit=max_results,
        )

        q_vec = embeddings.embed_query(plan.semantic_query)
        q_literal = (
            vector_to_pg_literal(q_vec) if storage.dialect == "postgresql" else vector_to_json(q_vec)
        )

        fts_query = " ".join(plan.keywords).strip() if plan.keywords else plan.semantic_query

        retrieval = storage.retrieve_for_question(
            user_id=user_id,
            fts_query=fts_query,
            query_embedding_literal=q_literal,
            folder_paths=plan.folder_paths,
            include_tags=plan.include_tags,
            exclude_tags=plan.exclude_tags,
            start_date=plan.time_range.start_date if plan.time_range else None,
            end_date=plan.time_range.end_date if plan.time_range else None,
            limit=plan.result_limit,
            embedding_model=embeddings.model,
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
                    updated_at=note.updated_at.isoformat() if hasattr(note.updated_at, "isoformat") else str(note.updated_at),
                    tags=note.tags,
                    snippet=item.get("snippet") or "",
                    score=float(item.get("score") or 0.0),
                    content_excerpt=excerpt,
                )
            )

        answer = asker.answer(query, plan, retrieved_notes)

        # Persist ask history (compact)
        import json as _json

        source_scores = {item["note"].id: float(item.get("score") or 0.0) for item in retrieval}
        ask_id = storage.save_ask_history(
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
                    "updated_at": note.updated_at.isoformat() if hasattr(note.updated_at, "isoformat") else str(note.updated_at),
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
                "embedding_model": embeddings.model,
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
    try:
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))
        digests = storage.list_digests(user_id, limit=limit, offset=offset)
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
    try:
        digest = storage.get_digest(user_id, digest_id)
        if not digest:
            return jsonify({"error": "Digest not found"}), 404
        return jsonify(digest.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.delete("/digests/<digest_id>")
@require_auth
def delete_digest(digest_id: str):
    user_id = g.user_id
    try:
        success = storage.delete_digest(user_id, digest_id)
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
    try:
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))
        items = storage.list_ask_history(user_id, limit=limit, offset=offset)
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
    try:
        item = storage.get_ask_history(user_id, ask_id)
        if not item:
            return jsonify({"error": "Ask history item not found"}), 404
        return jsonify(item.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.delete("/ask-history/<ask_id>")
@require_auth
def delete_ask_history(ask_id: str):
    user_id = g.user_id
    try:
        success = storage.delete_ask_history(user_id, ask_id)
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
