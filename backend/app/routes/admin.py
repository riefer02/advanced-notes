"""Administrator-only operations endpoints.

Access is authorized by Clerk user id (ADMIN_USER_IDS), never by email
address. These endpoints expose health and triage data, not user content.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from flask import Blueprint, jsonify, request

from ..auth import require_auth
from ..config import Config
from ..services.container import get_services
from ._helpers import api_error, parse_pagination, require_admin

bp = Blueprint("admin", __name__)

_REPORT_STATUSES = {"new", "triaged", "resolved", "ignored"}


@bp.get("/admin/ops/summary")
@require_auth
@require_admin
def ops_summary():
    """One-screen operational snapshot for the administrator."""
    svc = get_services()

    now = datetime.now(UTC)
    since_1h = (now - timedelta(hours=1)).replace(tzinfo=None)
    since_24h = (now - timedelta(hours=24)).replace(tzinfo=None)

    db_ok = svc.storage.ping()
    errors_1h = svc.storage.count_ops_events_since(since_1h, min_status=500) if db_ok else 0
    errors_24h = (
        svc.storage.count_ops_events_since(since_24h, min_status=500) if db_ok else 0
    )
    top_errors = (
        svc.storage.top_ops_fingerprints_since(since_24h, limit=5) if db_ok else []
    )
    outbox = svc.storage.get_outbox_stats() if db_ok else {}
    heartbeat = svc.storage.get_heartbeat("email-outbox") if db_ok else None
    reports_24h = svc.storage.count_problem_reports_since(since_24h) if db_ok else 0
    open_reports = svc.storage.count_problem_reports(status="new") if db_ok else 0

    heartbeat_age = None
    if heartbeat is not None:
        heartbeat_age = max(0, int((datetime.utcnow() - heartbeat).total_seconds()))

    return jsonify(
        {
            "generated_at": now.isoformat(),
            "environment": Config.environment_name(),
            "release": Config.release_sha(),
            "database": {"ok": db_ok},
            "errors": {
                "last_hour": errors_1h,
                "last_24h": errors_24h,
                "top_24h": top_errors,
            },
            "outbox": outbox,
            "worker": {
                "last_seen_at": heartbeat.isoformat() if heartbeat else None,
                "age_seconds": heartbeat_age,
                "stale_after_seconds": Config.OPS_WORKER_STALE_SECONDS,
            },
            "problem_reports": {"last_24h": reports_24h, "open": open_reports},
            "email": {
                "configured": svc.email.is_configured(),
                "recipients": len(Config.admin_emails()),
            },
        }
    )


@bp.get("/admin/reports")
@require_auth
@require_admin
def list_reports():
    """List user-submitted problem reports for triage."""
    svc = get_services()
    limit, offset = parse_pagination(default_limit=50, max_limit=200)

    status = (request.args.get("status") or "").strip().lower() or None
    if status and status not in _REPORT_STATUSES:
        return api_error(f"status must be one of {sorted(_REPORT_STATUSES)}", 400)

    reports = svc.storage.list_problem_reports(limit=limit, offset=offset, status=status)
    total = svc.storage.count_problem_reports(status=status)

    return jsonify(
        {
            "reports": reports,
            "total": total,
            "limit": limit,
            "offset": offset,
            "status": status,
        }
    )


@bp.post("/admin/reports/<report_id>/status")
@require_auth
@require_admin
def update_report_status(report_id: str):
    """Move a problem report through triage: new -> triaged -> resolved."""
    data = request.get_json(silent=True) or {}
    status = (data.get("status") or "").strip().lower()
    if status not in _REPORT_STATUSES:
        return api_error(f"status must be one of {sorted(_REPORT_STATUSES)}", 400)

    svc = get_services()
    if not svc.storage.update_problem_report_status(report_id, status):
        return api_error("Report not found", 404)

    return jsonify({"success": True, "report_id": report_id, "status": status})


@bp.get("/admin/ops/events")
@require_auth
@require_admin
def list_ops_events():
    """Recent server errors and degraded-dependency events."""
    svc = get_services()
    limit, offset = parse_pagination(default_limit=50, max_limit=200)

    return jsonify(
        {
            "events": svc.storage.list_ops_events(limit=limit, offset=offset),
            "limit": limit,
            "offset": offset,
        }
    )


@bp.get("/admin/ops/events/<event_id>")
@require_auth
@require_admin
def get_ops_event(event_id: str):
    """Full detail (including traceback) for one ops event."""
    event = get_services().storage.get_ops_event(event_id)
    if event is None:
        return api_error("Event not found", 404)
    return jsonify(event)


@bp.post("/admin/test-alert")
@require_auth
@require_admin
def test_alert():
    """Queue a test email to verify the admin notification path end to end."""
    svc = get_services()
    queued = svc.email.send_test_alert()
    return jsonify(
        {
            "queued": queued,
            "email_configured": svc.email.is_configured(),
            "recipients": len(Config.admin_emails()),
        }
    )


@bp.post("/admin/outbox/retry")
@require_auth
@require_admin
def retry_outbox():
    """Requeue failed emails and reclaim rows stranded by a worker crash."""
    data = request.get_json(silent=True) or {}
    try:
        limit = int(data.get("limit", 100) or 100)
    except (TypeError, ValueError):
        return api_error("limit must be an integer", 400)
    limit = max(1, min(limit, 500))
    include_stuck = bool(data.get("include_stuck", True))

    svc = get_services()
    requeued = svc.storage.requeue_failed_emails(limit=limit)
    reclaimed = (
        svc.storage.reclaim_stuck_emails(limit=limit) if include_stuck else 0
    )

    return jsonify({"requeued": requeued, "reclaimed": reclaimed})
