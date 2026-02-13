import hashlib

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services.container import get_services
from ..services.embeddings import vector_to_json, vector_to_pg_literal
from ._helpers import (
    _AudioTranscriptionError,
    _transcribe_audio_clip,
    api_error,
    parse_pagination,
    require_audio_clips,
    require_quota,
)

bp = Blueprint("meals", __name__)


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

    try:
        text, meta, audio_clip_id, audio_storage_key = _transcribe_audio_clip(
            user_id, svc, "/api/meals/transcribe"
        )
    except _AudioTranscriptionError as e:
        return api_error(str(e), e.status)
    except Exception as e:
        return api_error(str(e), 500)

    try:
        current_date = date.today().isoformat()
        extraction_result = svc.meal_extractor.extract(text, current_date)

        meal_date = extraction_result.meal_date or current_date

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
            user_id=user_id,
            transcription=text,
            metadata=meal_metadata,
            food_items=food_items,
        )

        # Generate embedding for meal (best-effort)
        try:
            content_for_embedding = f"{extraction_result.meal_type.value}: {text}"
            vec = svc.embeddings.embed_query(content_for_embedding)
            content_hash = hashlib.sha256(content_for_embedding.encode()).hexdigest()
            embedding_value = (
                vector_to_pg_literal(vec)
                if svc.storage.dialect == "postgresql"
                else vector_to_json(vec)
            )
            svc.storage.upsert_meal_embedding(
                user_id=user_id,
                meal_entry_id=meal_id,
                embedding_model=svc.embeddings.model,
                content_hash=content_hash,
                embedding_value=embedding_value,
            )
        except Exception as e:
            print(f"Meal embedding failed for {meal_id}: {e}")

        saved_meal = svc.storage.get_meal_entry(user_id, meal_id)

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
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)


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
        except ValueError as e:
            return api_error(str(e), 400)

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
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)


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
        return api_error(str(e), 500)
