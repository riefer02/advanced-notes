from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services.container import get_services
from ._helpers import api_error, parse_pagination

bp = Blueprint("usage", __name__)


@bp.get("/usage")
@require_auth
def get_usage():
    """Get current usage summary and quota status."""
    user_id = g.user_id
    svc = get_services()

    try:
        usage = svc.usage_tracking.get_current_usage(user_id)
        return jsonify(usage.model_dump())
    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/usage/history")
@require_auth
def get_usage_history():
    """Get detailed usage history (paginated)."""
    user_id = g.user_id
    svc = get_services()

    try:
        limit, offset = parse_pagination(default_limit=50, max_limit=100)
        service_type = request.args.get("service_type")

        records = svc.usage_tracking.get_usage_history(
            user_id,
            limit=limit,
            offset=offset,
            service_type=service_type,
        )

        return jsonify(
            {
                "records": [r.model_dump() for r in records],
                "total": len(records),
                "limit": limit,
                "offset": offset,
            }
        )
    except Exception as e:
        return api_error(str(e), 500)
