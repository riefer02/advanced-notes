"""Unified Library feed: one request for notes, meals, vinyl, and tasks."""

from __future__ import annotations

from datetime import datetime

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services.container import get_services
from ._helpers import api_error, api_error_from_exception

bp = Blueprint("library", __name__)

_KINDS = {"note", "meal", "vinyl", "todo"}


def _iso(value: datetime | None) -> str:
    return value.isoformat() if value else ""


@bp.get("/library")
@require_auth
def get_library():
    """Return the newest captures across every object type, newest first."""
    user_id = g.user_id
    svc = get_services()

    try:
        limit_raw = request.args.get("limit", "25")
        try:
            limit = max(1, min(int(limit_raw), 100))
        except (TypeError, ValueError):
            return api_error("'limit' must be an integer", 400)

        kind = (request.args.get("type") or "").strip().lower()
        if kind and kind not in _KINDS:
            return api_error("'type' must be note, meal, vinyl, or todo", 400)

        items: list[dict] = []
        counts = {"note": 0, "meal": 0, "vinyl": 0, "todo": 0}
        has_more = False

        if not kind or kind == "note":
            notes = svc.storage.list_notes(user_id, limit=limit)
            counts["note"] = len(notes)
            has_more = has_more or len(notes) >= limit
            for note in notes:
                items.append(
                    {
                        "kind": "note",
                        "id": note.id,
                        "timestamp": _iso(note.updated_at or note.created_at),
                        "data": note.model_dump(mode="json"),
                    }
                )

        if not kind or kind == "meal":
            meals = svc.storage.list_meals_by_date_range(
                user_id,
                start_date="1900-01-01",
                end_date="2100-12-31",
                limit=limit,
            )
            counts["meal"] = len(meals)
            has_more = has_more or len(meals) >= limit
            for meal in meals:
                items.append(
                    {
                        "kind": "meal",
                        "id": meal.id,
                        "timestamp": _iso(meal.created_at),
                        "data": meal.model_dump(mode="json"),
                    }
                )

        if not kind or kind == "vinyl":
            records = svc.storage.list_vinyl_records(user_id, limit=limit)
            counts["vinyl"] = len(records)
            has_more = has_more or len(records) >= limit
            for record in records:
                items.append(
                    {
                        "kind": "vinyl",
                        "id": record.id,
                        "timestamp": _iso(record.created_at),
                        "data": record.model_dump(mode="json"),
                    }
                )

        if not kind or kind == "todo":
            todos = [
                todo
                for todo in svc.storage.list_todos(user_id, limit=limit)
                if todo.status != "suggested"
            ]
            counts["todo"] = len(todos)
            has_more = has_more or len(todos) >= limit
            for todo in todos:
                items.append(
                    {
                        "kind": "todo",
                        "id": todo.id,
                        "timestamp": _iso(todo.created_at),
                        "data": todo.model_dump(mode="json"),
                    }
                )

        items.sort(key=lambda item: item["timestamp"], reverse=True)

        return jsonify(
            {
                "items": items,
                "counts": counts,
                "limit": limit,
                "has_more": has_more,
            }
        )
    except Exception as e:
        return api_error_from_exception(e)
