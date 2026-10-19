"""Public, rate-limited "report a problem" endpoint.

The frontend shows this when the API is reachable but something is broken.
If the API is down entirely, the frontend falls back to a mailto link.
"""

from __future__ import annotations

import logging

from flask import Blueprint, g, jsonify, request

from ..auth import optional_auth
from ..config import Config
from ..services.container import get_services
from ..services.rate_limit import SlidingWindowLimiter
from ._helpers import api_error

logger = logging.getLogger(__name__)

bp = Blueprint("reports", __name__)

_ip_limiter = SlidingWindowLimiter(
    Config.REPORT_RATE_LIMIT_PER_IP, Config.REPORT_RATE_WINDOW_SECONDS
)
_user_limiter = SlidingWindowLimiter(
    Config.REPORT_RATE_LIMIT_PER_USER, Config.REPORT_RATE_WINDOW_SECONDS
)


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


@bp.post("/report-problem")
@optional_auth
def report_problem():
    """Accept a short problem report and queue an admin notification."""
    data = request.get_json(silent=True) or {}

    message = str(data.get("message") or "").strip()[:2000]
    page = str(data.get("page") or "")[:500]
    contact_email = str(data.get("email") or "").strip()[:320]
    ip = _client_ip()
    user_id = getattr(g, "user_id", None)

    retry_after = str(Config.REPORT_RATE_WINDOW_SECONDS)
    if not _ip_limiter.allow(f"ip:{ip}"):
        return api_error(
            "Too many reports from this connection. Please try again later.",
            429,
            {"Retry-After": retry_after},
        )
    if user_id and not _user_limiter.allow(f"user:{user_id}"):
        return api_error(
            "Too many reports from this account. Please try again later.",
            429,
            {"Retry-After": retry_after},
        )

    try:
        get_services().email.send_problem_report_notification(
            message=message,
            page=page or request.referrer or "",
            ip=ip,
            user_id=user_id,
            user_agent=request.user_agent.string[:300],
            contact_email=contact_email,
        )
    except Exception:  # noqa: BLE001 - the user still gets an acknowledgment
        logger.exception("Failed to queue problem report")

    return jsonify({"status": "received"}), 202
