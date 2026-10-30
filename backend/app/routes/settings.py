from __future__ import annotations

import re

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services.container import get_services
from ._helpers import api_error, api_error_from_exception

bp = Blueprint("settings", __name__)

_LANGUAGE_CODE_RE = re.compile(r"^[a-z]{2,3}(?:-[a-z]{2,4})?$")


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
        return api_error_from_exception(e)


@bp.put("/settings")
@require_auth
def update_settings():
    """Update user settings."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json() or {}

        languages = data.get("transcription_languages")
        if languages is not None:
            if not isinstance(languages, list) or not all(
                isinstance(item, str) for item in languages
            ):
                return api_error("transcription_languages must be a list of ISO codes", 400)
            languages = [item.strip().lower() for item in languages if item.strip()]
            languages = [
                code for code in languages if _LANGUAGE_CODE_RE.fullmatch(code)
            ][:5]

        settings = svc.storage.update_user_settings(
            user_id,
            auto_accept_todos=data.get("auto_accept_todos"),
            transcription_languages=languages,
        )
        return jsonify(settings.model_dump())
    except Exception as e:
        return api_error_from_exception(e)
