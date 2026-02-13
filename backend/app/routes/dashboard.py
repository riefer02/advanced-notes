from datetime import UTC, datetime

from flask import Blueprint, g, jsonify

from ..auth import require_auth
from ..services.container import get_services

bp = Blueprint("dashboard", __name__)


@bp.get("/dashboard/stats")
@require_auth
def dashboard_stats():
    """Aggregate counts across all features for the dashboard overview."""
    user_id = g.user_id
    svc = get_services()

    now = datetime.now(UTC)
    notes = {"total": svc.storage.get_note_count(user_id)}
    todos = svc.storage.get_todo_counts(user_id)
    meals = svc.storage.get_meal_counts(user_id, now.year, now.month)
    vinyl = svc.storage.get_vinyl_collection_stats(user_id)

    return jsonify({
        "notes": notes,
        "todos": todos,
        "meals": meals,
        "vinyl": vinyl,
    })
