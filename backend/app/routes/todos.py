from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services.container import get_services
from ._helpers import api_error, parse_pagination

bp = Blueprint("todos", __name__)


@bp.get("/todos")
@require_auth
def list_todos():
    """List todos with optional filtering."""
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
        return api_error(str(e), 500)


@bp.get("/todos/<todo_id>")
@require_auth
def get_todo(todo_id: str):
    """Get a specific todo by ID."""
    user_id = g.user_id
    svc = get_services()

    try:
        todo = svc.storage.get_todo(user_id, todo_id)
        if not todo:
            return api_error("Todo not found", 404)
        return jsonify(todo.model_dump())
    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/todos")
@require_auth
def create_todo():
    """Create a new todo (manual creation)."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json()
        if not data:
            return api_error("No data provided", 400)

        title = data.get("title", "").strip()
        if not title:
            return api_error("Title is required", 400)

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
        return api_error(str(e), 500)


@bp.put("/todos/<todo_id>")
@require_auth
def update_todo(todo_id: str):
    """Update a todo."""
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
            return api_error("Todo not found", 404)

        return jsonify(todo.model_dump())
    except Exception as e:
        return api_error(str(e), 500)


@bp.delete("/todos/<todo_id>")
@require_auth
def delete_todo(todo_id: str):
    """Delete a todo."""
    user_id = g.user_id
    svc = get_services()

    try:
        success = svc.storage.delete_todo(user_id, todo_id)
        if not success:
            return api_error("Todo not found", 404)
        return jsonify({"success": True})
    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/todos/<todo_id>/accept")
@require_auth
def accept_todo(todo_id: str):
    """Accept a suggested todo."""
    user_id = g.user_id
    svc = get_services()

    try:
        todo = svc.storage.accept_todo(user_id, todo_id)
        if not todo:
            return api_error("Todo not found", 404)
        return jsonify(todo.model_dump())
    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/todos/<todo_id>/complete")
@require_auth
def complete_todo(todo_id: str):
    """Mark a todo as completed."""
    user_id = g.user_id
    svc = get_services()

    try:
        todo = svc.storage.complete_todo(user_id, todo_id)
        if not todo:
            return api_error("Todo not found", 404)
        return jsonify(todo.model_dump())
    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/todos/<todo_id>/dismiss")
@require_auth
def dismiss_todo(todo_id: str):
    """Dismiss (delete) a suggested todo."""
    user_id = g.user_id
    svc = get_services()

    try:
        success = svc.storage.dismiss_todo(user_id, todo_id)
        if not success:
            return api_error("Todo not found", 404)
        return jsonify({"success": True})
    except Exception as e:
        return api_error(str(e), 500)


# ============================================================================
# NOTE-SPECIFIC TODO ENDPOINTS
# ============================================================================


@bp.get("/notes/<note_id>/todos")
@require_auth
def get_note_todos(note_id: str):
    """Get all todos for a specific note."""
    user_id = g.user_id
    svc = get_services()

    try:
        todos = svc.storage.list_todos_for_note(user_id, note_id)
        return jsonify({"todos": [t.model_dump() for t in todos]})
    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/notes/<note_id>/todos/accept")
@require_auth
def accept_note_todos(note_id: str):
    """Accept selected todos for a note."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json() or {}
        todo_ids = data.get("todo_ids", [])

        if not todo_ids:
            return api_error("No todo_ids provided", 400)

        todos_for_note = svc.storage.list_todos_for_note(user_id, note_id)
        valid_ids = {t.id for t in todos_for_note}
        invalid_ids = [tid for tid in todo_ids if tid not in valid_ids]

        if invalid_ids:
            return api_error(f"Todos not found for this note: {invalid_ids}", 400)

        accepted = svc.storage.accept_todos_bulk(user_id, todo_ids)
        return jsonify({"accepted": accepted})
    except Exception as e:
        return api_error(str(e), 500)
