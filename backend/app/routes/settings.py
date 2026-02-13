from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services.container import get_services
from ._helpers import api_error

bp = Blueprint("settings", __name__)


@bp.get("/settings")
@require_auth
def get_settings():
    """Get user settings."""
    user_id = g.user_id
    svc = get_services()

    try:
        settings = svc.storage.get_user_settings(user_id)
        return jsonify(settings.model_dump())
    except Exception as e:
        return api_error(str(e), 500)


@bp.put("/settings")
@require_auth
def update_settings():
    """Update user settings."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json() or {}

        settings = svc.storage.update_user_settings(
            user_id,
            auto_accept_todos=data.get("auto_accept_todos"),
        )
        return jsonify(settings.model_dump())
    except Exception as e:
        return api_error(str(e), 500)
