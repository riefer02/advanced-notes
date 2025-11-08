"""
REST API routes for the ASR application.

Organized into logical groups:
- Transcription: Audio transcription and categorization
- Notes: CRUD operations for notes
- Folders: Folder hierarchy and statistics
- Tags: Tag management
- Search: Full-text search
"""

from flask import Blueprint, request, jsonify

from .asr import transcribe_bytes
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
def transcribe():
    """
    Transcribe audio and automatically categorize/save to database.

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
    # Check for file upload
    if "file" in request.files:
        data = request.files["file"].read()
    else:
        # Raw bytes in body
        data = request.get_data()

    if not data:
        return jsonify({"error": "No audio data provided"}), 400

    try:
        # Step 1: Transcribe audio
        text, meta = transcribe_bytes(data)

        # Step 2: Get AI categorization
        folder_tree = storage.get_folder_tree()

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

        # Step 3: Save to database
        note_metadata = NoteMetadata(
            title=categorization_result.filename.replace(".md", "")
            .replace("-", " ")
            .title(),
            folder_path=categorization_result.folder_path,
            filename=categorization_result.filename,
            tags=categorization_result.tags,
            confidence=categorization_result.confidence,
            transcription_duration=meta.get("duration"),
            model_version=meta.get("model"),
            word_count=len(text.split()),
        )

        note_id = storage.save_note(content=text, metadata=note_metadata)

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
def list_notes():
    """
    List notes with optional filtering.

    Query params:
        - folder: Filter by folder path (optional)
        - limit: Max results (default: 50)
        - offset: Pagination offset (default: 0)

    Returns:
        JSON: {"notes": [...], "total": int, "limit": int, "offset": int}
    """
    try:
        folder = request.args.get("folder")
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))

        notes = storage.list_notes(folder=folder, limit=limit, offset=offset)

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
def get_note(note_id: str):
    """
    Get a specific note by ID.

    Returns:
        JSON: Note object or 404 error
    """
    try:
        note = storage.get_note(note_id)

        if not note:
            return jsonify({"error": "Note not found"}), 404

        return jsonify(note.model_dump())

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.put("/notes/<note_id>")
def update_note(note_id: str):
    """
    Update an existing note.

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
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Get existing note
        note = storage.get_note(note_id)
        if not note:
            return jsonify({"error": "Note not found"}), 404

        # Update fields
        content = data.get("content", note.content)

        metadata = NoteMetadata(
            title=data.get("title", note.title),
            folder_path=data.get("folder_path", note.folder_path),
            filename=note.filename,
            tags=data.get("tags", note.tags),
            confidence=note.confidence,
            transcription_duration=note.transcription_duration,
            model_version=note.model_version,
            word_count=len(content.split()),
        )

        success = storage.update_note(note_id, content, metadata)

        if not success:
            return jsonify({"error": "Failed to update note"}), 500

        # Return updated note
        updated_note = storage.get_note(note_id)
        return jsonify(updated_note.model_dump())

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.delete("/notes/<note_id>")
def delete_note(note_id: str):
    """
    Delete a note by ID.

    Returns:
        JSON: {"success": bool, "message": str}
    """
    try:
        success = storage.delete_note(note_id)

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
def get_folders():
    """
    Get the complete folder hierarchy tree.

    Returns:
        JSON: {"folders": FolderNode} (root node with nested subfolders)
    """
    try:
        folder_tree = storage.get_folder_tree()

        return jsonify({"folders": folder_tree.model_dump()})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/folders/<path:folder_path>/stats")
def get_folder_stats(folder_path: str):
    """
    Get statistics for a specific folder.

    Returns:
        JSON: FolderStats object
    """
    try:
        stats = storage.get_folder_stats(folder_path)

        return jsonify(stats.model_dump())

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# TAG ENDPOINTS
# ============================================================================


@bp.get("/tags")
def get_tags():
    """
    Get all unique tags across all notes.

    Returns:
        JSON: {"tags": [...]}
    """
    try:
        tags = storage.get_all_tags()

        return jsonify({"tags": tags})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/tags/<tag>/notes")
def get_notes_by_tag(tag: str):
    """
    Get all notes with a specific tag.

    Returns:
        JSON: {"notes": [...], "tag": str}
    """
    try:
        notes = storage.get_notes_by_tag(tag)

        return jsonify({"tag": tag, "notes": [note.model_dump() for note in notes]})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# SEARCH ENDPOINTS
# ============================================================================


@bp.get("/search")
def search_notes():
    """
    Full-text search across all notes.

    Query params:
        - q: Search query (required)

    Returns:
        JSON: {"results": [...], "query": str}
    """
    try:
        query = request.args.get("q")

        if not query:
            return jsonify({"error": "Query parameter 'q' is required"}), 400

        results = storage.search_notes(query)

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
