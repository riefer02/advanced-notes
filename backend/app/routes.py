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
from .services.storage import NoteStorage
from .services.models import NoteMetadata, FolderNode

bp = Blueprint("api", __name__)

# Initialize services
categorizer = AICategorizationService()
storage = NoteStorage()


# ============================================================================
# TRANSCRIPTION ENDPOINTS
# ============================================================================


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
# UTILITY ENDPOINTS
# ============================================================================


@bp.get("/health")
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})
