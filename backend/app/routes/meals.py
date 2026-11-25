import hashlib

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services.container import get_services
from ..services.embeddings import vector_to_json, vector_to_pg_literal
from ..services.resilience import require_external, with_fallback
from ._helpers import (
    _AudioTranscriptionError,
    _transcribe_audio_clip,
    api_error,
    api_error_from_exception,
    parse_pagination,
    require_audio_clips,
    require_quota,
)

bp = Blueprint("meals", __name__)

_MEAL_TYPES = {"breakfast", "lunch", "dinner", "snack"}


def _normalize_meal_time(value) -> str | None:
    """Return a normalized HH:MM string, or None when the value is absent.

    Raises ValueError for values that are present but malformed.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("meal_time must be a string")
    raw = value.strip()
    if not raw:
        return None
    parts = raw.split(":")
    if len(parts) != 2:
        raise ValueError("meal_time must use HH:MM")
    hours, minutes = (int(part) for part in parts)
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        raise ValueError("meal_time must use HH:MM")
    return f"{hours:02d}:{minutes:02d}"


@bp.post("/meals")
@require_auth
def create_meal():
    """Create a meal from a typed entry (no microphone required)."""
    from datetime import date

    user_id = g.user_id
    svc = get_services()

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return api_error("No data provided", 400)

    meal_type = data.get("meal_type")
    meal_type = meal_type.strip().lower() if isinstance(meal_type, str) else ""
    if meal_type not in _MEAL_TYPES:
        return api_error("'meal_type' must be breakfast, lunch, dinner, or snack", 400)

    raw_date = data.get("meal_date")
    if not isinstance(raw_date, str) or not raw_date.strip():
        return api_error("'meal_date' must be a valid ISO date (YYYY-MM-DD)", 400)
    try:
        meal_date = date.fromisoformat(raw_date.strip()).isoformat()
    except ValueError:
        return api_error("'meal_date' must be a valid ISO date (YYYY-MM-DD)", 400)

    try:
        meal_time = _normalize_meal_time(data.get("meal_time"))
    except (TypeError, ValueError):
        return api_error("'meal_time' must be a valid time (HH:MM)", 400)

    transcription = data.get("transcription")
    if transcription is not None and not isinstance(transcription, str):
        return api_error("'transcription' must be a string", 400)
    transcription = (transcription or "").strip()

    raw_items = data.get("items", [])
    if raw_items is None:
        raw_items = []
    if not isinstance(raw_items, list):
        return api_error("'items' must be a list", 400)

    items: list[dict] = []
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            return api_error("Each food item must be an object with a 'name'", 400)

        name = raw_item.get("name")
        name = name.strip() if isinstance(name, str) else ""
        if not name:
            return api_error("Each food item needs a non-empty 'name'", 400)

        portion = raw_item.get("portion")
        if portion is not None and not isinstance(portion, str):
            return api_error("Food item 'portion' must be a string", 400)
        items.append(
            {
                "name": name,
                "portion": (portion or "").strip() or None,
                "confidence": None,
            }
        )

    if not items and not transcription:
        return api_error("Add at least one food item or a note", 400)

    # If adding to a shared calendar, verify edit permission (same rule as
    # transcribe). Meals added there belong to the calendar's owner.
    calendar_owner = request.args.get("calendar_owner")
    if (
        calendar_owner
        and calendar_owner != user_id
        and not svc.storage.has_access(user_id, calendar_owner, "meal_calendar", "edit")
    ):
        return api_error("Not authorized to add meals to this calendar", 403)

    target_user_id = calendar_owner or user_id

    # Keep the stored transcription meaningful for typed entries that only
    # list items; the detail drawer renders it as the meal's summary.
    if not transcription:
        transcription = ", ".join(item["name"] for item in items)

    from ..services.models import MealEntryMetadata

    metadata = MealEntryMetadata(
        meal_type=meal_type,
        meal_date=meal_date,
        meal_time=meal_time,
        confidence=None,
        model_version="manual",
    )

    try:
        meal_id = svc.storage.save_meal_entry(
            user_id=target_user_id,
            transcription=transcription,
            metadata=metadata,
            food_items=items,
        )
        saved_meal = svc.storage.get_meal_entry(target_user_id, meal_id)
        if not saved_meal:
            return api_error("Meal could not be saved", 500)
        return jsonify(saved_meal.model_dump()), 201
    except Exception as e:
        return api_error_from_exception(e)


@bp.post("/meals/transcribe")
@require_auth
@require_audio_clips
@require_quota("transcription")
def transcribe_meal():
    """Transcribe audio and extract meal data."""
    from datetime import date

    user_id = g.user_id
    svc = get_services()

    # If adding to a shared calendar, verify edit permission
    calendar_owner = request.args.get("calendar_owner")
    if (
        calendar_owner
        and calendar_owner != user_id
        and not svc.storage.has_access(user_id, calendar_owner, "meal_calendar", "edit")
    ):
        return api_error("Not authorized to add meals to this calendar", 403)

    # Meals added to a shared calendar belong to that calendar's owner.
    target_user_id = calendar_owner or user_id

    # An explicit capture date wins over anything the extractor infers from
    # the transcript ("yesterday", "last Friday", ...).
    requested_date = request.args.get("meal_date")
    if requested_date:
        try:
            requested_date = date.fromisoformat(requested_date.strip()).isoformat()
        except ValueError:
            return api_error("'meal_date' must be a valid ISO date (YYYY-MM-DD)", 400)
    else:
        requested_date = None

    try:
        text, meta, audio_clip_id, audio_storage_key = _transcribe_audio_clip(
            user_id, svc, "/api/meals/transcribe"
        )
    except _AudioTranscriptionError as e:
        return api_error(str(e), e.status)
    except Exception as e:
        return api_error_from_exception(e)

    try:
        current_date = requested_date or date.today().isoformat()
        extraction_result = require_external(
            lambda: svc.meal_extractor.extract(text, current_date),
            service="meal extraction",
        )

        meal_date = requested_date or extraction_result.meal_date or current_date

        from ..services.models import MealEntryMetadata

        meal_metadata = MealEntryMetadata(
            meal_type=extraction_result.meal_type.value,
            meal_date=meal_date,
            meal_time=extraction_result.meal_time,
            confidence=extraction_result.confidence,
            transcription_duration=meta.get("duration"),
            model_version=meta.get("model"),
        )

        food_items = [
            {
                "name": item.name,
                "portion": item.portion,
                "confidence": item.confidence,
            }
            for item in extraction_result.food_items
        ]

        meal_id = svc.storage.save_meal_entry(
            user_id=target_user_id,
            transcription=text,
            metadata=meal_metadata,
            food_items=food_items,
        )

        # Generate embedding for meal (best-effort).
        def _refresh_meal_embedding() -> None:
            content_for_embedding = f"{extraction_result.meal_type.value}: {text}"
            vec = svc.embeddings.embed_query(content_for_embedding)
            content_hash = hashlib.sha256(content_for_embedding.encode()).hexdigest()
            embedding_value = (
                vector_to_pg_literal(vec)
                if svc.storage.dialect == "postgresql"
                else vector_to_json(vec)
            )
            svc.storage.upsert_meal_embedding(
                user_id=target_user_id,
                meal_entry_id=meal_id,
                embedding_model=svc.embeddings.model,
                content_hash=content_hash,
                embedding_value=embedding_value,
            )

        with_fallback(_refresh_meal_embedding, fallback=None, service="meal embeddings")

        saved_meal = svc.storage.get_meal_entry(target_user_id, meal_id)

        return jsonify(
            {
                "text": text,
                "meta": meta,
                "audio": {
                    "clip_id": audio_clip_id,
                    "storage_key": audio_storage_key,
                },
                "meal": saved_meal.model_dump() if saved_meal else None,
                "extraction": {
                    "confidence": extraction_result.confidence,
                    "reasoning": extraction_result.reasoning,
                },
            }
        )

    except Exception as e:
        return api_error_from_exception(e)


@bp.get("/meals")
@require_auth
def list_meals():
    """List meals with optional filtering."""
    user_id = g.user_id
    svc = get_services()

    try:
        calendar_owner = request.args.get("calendar_owner")
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")

        if not start_date or not end_date:
            return api_error("Query params 'start_date' and 'end_date' are required", 400)

        meal_type = request.args.get("meal_type")
        limit, offset = parse_pagination(default_limit=100, max_limit=500)

        if calendar_owner and calendar_owner != user_id:
            if not svc.storage.has_access(user_id, calendar_owner, "meal_calendar"):
                return api_error("Not authorized to view this calendar", 403)
            member_ids = svc.storage.get_calendar_member_ids(calendar_owner)
            meals = svc.storage.list_meals_for_users(
                member_ids,
                start_date=start_date,
                end_date=end_date,
                meal_type=meal_type,
                limit=limit,
                offset=offset,
            )
        else:
            meals = svc.storage.list_meals_by_date_range(
                user_id,
                start_date=start_date,
                end_date=end_date,
                meal_type=meal_type,
                limit=limit,
                offset=offset,
            )

        return jsonify({
            "meals": [m.model_dump() for m in meals],
            "total": len(meals),
            "limit": limit,
            "offset": offset,
        })

    except Exception as e:
        return api_error_from_exception(e)


@bp.get("/meals/search")
@require_auth
def search_meals():
    """Search the signed-in user's meals by transcript or food item."""
    user_id = g.user_id
    svc = get_services()

    try:
        query = (request.args.get("q") or "").strip()
        if len(query) < 2:
            return api_error("Query parameter 'q' must be at least 2 characters", 400)

        limit_raw = request.args.get("limit", "20")
        try:
            limit = max(1, min(int(limit_raw), 50))
        except (TypeError, ValueError):
            return api_error("'limit' must be an integer", 400)

        meals = svc.storage.search_meals(user_id, query, limit=limit)
        return jsonify({"query": query, "meals": [meal.model_dump() for meal in meals]})
    except Exception as e:
        return api_error_from_exception(e)


@bp.get("/meals/calendar")
@require_auth
def get_meals_calendar():
    """Get meals grouped by date for calendar view."""
    user_id = g.user_id
    svc = get_services()

    try:
        calendar_owner = request.args.get("calendar_owner")
        year = request.args.get("year")
        month = request.args.get("month")

        if not year or not month:
            return api_error("Query params 'year' and 'month' are required", 400)

        try:
            year_int = int(year)
            month_int = int(month)
            if month_int < 1 or month_int > 12:
                raise ValueError("Month must be 1-12")
        except ValueError:
            return api_error("Invalid 'year' or 'month'", 400)

        if calendar_owner and calendar_owner != user_id:
            if not svc.storage.has_access(user_id, calendar_owner, "meal_calendar"):
                return api_error("Not authorized to view this calendar", 403)
            member_ids = svc.storage.get_calendar_member_ids(calendar_owner)
            calendar_data = svc.storage.get_meals_calendar_for_users(member_ids, year_int, month_int)
        else:
            calendar_data = svc.storage.get_meals_calendar(user_id, year_int, month_int)

        serialized = {
            date: [entry.model_dump() for entry in entries]
            for date, entries in calendar_data.items()
        }
        return jsonify({"calendar": serialized, "year": year_int, "month": month_int})

    except Exception as e:
        return api_error_from_exception(e)


@bp.get("/meals/<meal_id>")
@require_auth
def get_meal(meal_id: str):
    """Get a specific meal by ID."""
    user_id = g.user_id
    svc = get_services()

    try:
        meal = svc.storage.get_meal_entry(user_id, meal_id)

        if not meal:
            calendar_owner = request.args.get("calendar_owner")
            if (
                calendar_owner
                and calendar_owner != user_id
                and svc.storage.has_access(user_id, calendar_owner, "meal_calendar")
            ):
                    member_ids = svc.storage.get_calendar_member_ids(calendar_owner)
                    for mid in member_ids:
                        meal = svc.storage.get_meal_entry(mid, meal_id)
                        if meal:
                            break

        if not meal:
            return api_error("Meal not found", 404)

        return jsonify(meal.model_dump())

    except Exception as e:
        return api_error_from_exception(e)


@bp.put("/meals/<meal_id>")
@require_auth
def update_meal(meal_id: str):
    """Update a meal entry."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json()
        if not data:
            return api_error("No data provided", 400)

        success = svc.storage.update_meal_entry(
            user_id,
            meal_id,
            meal_type=data.get("meal_type"),
            meal_date=data.get("meal_date"),
            meal_time=data.get("meal_time"),
            transcription=data.get("transcription"),
        )

        if not success:
            return api_error("Meal not found", 404)

        updated_meal = svc.storage.get_meal_entry(user_id, meal_id)
        return jsonify(updated_meal.model_dump() if updated_meal else {})

    except Exception as e:
        return api_error_from_exception(e)


@bp.delete("/meals/<meal_id>")
@require_auth
def delete_meal(meal_id: str):
    """Delete a meal entry."""
    user_id = g.user_id
    svc = get_services()

    try:
        success = svc.storage.delete_meal_entry(user_id, meal_id)

        if not success:
            return api_error("Meal not found", 404)

        return jsonify({"success": True})

    except Exception as e:
        return api_error_from_exception(e)


@bp.post("/meals/<meal_id>/items")
@require_auth
def add_meal_item(meal_id: str):
    """Add a food item to a meal."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json()
        if not data:
            return api_error("No data provided", 400)

        name = (data.get("name") or "").strip()
        if not name:
            return api_error("'name' is required", 400)

        item = svc.storage.add_meal_item(
            user_id,
            meal_id,
            name=name,
            portion=data.get("portion"),
        )

        if not item:
            return api_error("Meal not found", 404)

        return jsonify(item.model_dump()), 201

    except Exception as e:
        return api_error_from_exception(e)


@bp.put("/meals/<meal_id>/items/<item_id>")
@require_auth
def update_meal_item(meal_id: str, item_id: str):
    """Update a food item."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json() or {}

        item = svc.storage.update_meal_item(
            user_id,
            item_id,
            name=data.get("name"),
            portion=data.get("portion"),
        )

        if not item:
            return api_error("Item not found", 404)

        return jsonify(item.model_dump())

    except Exception as e:
        return api_error_from_exception(e)


@bp.delete("/meals/<meal_id>/items/<item_id>")
@require_auth
def delete_meal_item(meal_id: str, item_id: str):
    """Delete a food item."""
    user_id = g.user_id
    svc = get_services()

    try:
        success = svc.storage.delete_meal_item(user_id, item_id)

        if not success:
            return api_error("Item not found", 404)

        return jsonify({"success": True})

    except Exception as e:
        return api_error_from_exception(e)
