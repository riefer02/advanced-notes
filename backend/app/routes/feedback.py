from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services.container import get_services
from ._helpers import api_error, parse_pagination

bp = Blueprint("feedback", __name__)


@bp.post("/feedback")
@require_auth
def create_feedback():
    """Submit user feedback (bug reports, feature requests, general feedback)."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json()
        if not data:
            return api_error("No data provided", 400)

        feedback_type = (data.get("feedback_type") or "").strip()
        if feedback_type not in ("bug", "feature", "general"):
            return api_error("feedback_type must be 'bug', 'feature', or 'general'", 400)

        title = (data.get("title") or "").strip()
        if not title:
            return api_error("title is required", 400)
        if len(title) > 255:
            return api_error("title must be 255 characters or less", 400)

        description = data.get("description")
        if description:
            description = description.strip()
            if len(description) > 5000:
                return api_error("description must be 5000 characters or less", 400)

        rating = data.get("rating")
        if rating is not None:
            try:
                rating = int(rating)
                if rating < 1 or rating > 5:
                    return api_error("rating must be between 1 and 5", 400)
            except (TypeError, ValueError):
                return api_error("rating must be an integer", 400)

        feedback = svc.storage.create_feedback(
            user_id=user_id,
            feedback_type=feedback_type,
            title=title,
            description=description,
            rating=rating,
        )

        # Best-effort email notification (don't block on failure)
        try:
            email_sent = svc.email.send_feedback_notification(
                feedback_id=feedback.id,
                user_id=user_id,
                feedback_type=feedback_type,
                title=title,
                description=description,
                rating=rating,
            )
            if email_sent:
                svc.storage.mark_feedback_email_sent(feedback.id)
        except Exception:
            pass  # Email failures should not block feedback submission

        return jsonify(feedback.model_dump()), 201

    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/feedback")
@require_auth
def list_feedback():
    """List user's feedback submissions."""
    user_id = g.user_id
    svc = get_services()

    try:
        limit, offset = parse_pagination(default_limit=50, max_limit=100)

        feedback_list = svc.storage.list_feedback(user_id, limit=limit, offset=offset)

        return jsonify(
            {
                "feedback": [f.model_dump() for f in feedback_list],
                "total": len(feedback_list),
                "limit": limit,
                "offset": offset,
            }
        )

    except Exception as e:
        return api_error(str(e), 500)
