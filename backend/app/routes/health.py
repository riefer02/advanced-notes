from datetime import datetime

from flask import Blueprint, current_app, jsonify

from ..config import Config

bp = Blueprint("health", __name__)


@bp.get("/health")
def health():
    """Cheap liveness check (used by the platform)."""
    return jsonify({"status": "ok"})


@bp.get("/health/ready")
def readiness():
    """Readiness check for an external uptime monitor.

    Verifies the database, the admin-notification outbox, and (in
    production-like environments) the email worker heartbeat. Never includes
    credentials or user data.
    """
    svc = current_app.extensions.get("services")
    if svc is None:
        return (
            jsonify(
                {
                    "status": "unavailable",
                    "components": {"services": {"status": "missing"}},
                }
            ),
            503,
        )

    components: dict = {}
    db_ok = False
    try:
        db_ok = bool(svc.storage.ping())
    except Exception:  # noqa: BLE001 - readiness must not raise
        db_ok = False
    components["database"] = {"status": "ok" if db_ok else "down"}

    outbox_status = "unknown"
    worker_status = "unknown"
    if db_ok:
        try:
            outbox = svc.storage.get_outbox_stats()
            oldest = outbox.get("oldest_pending_age_seconds")
            outbox_status = (
                "stale"
                if oldest is not None and oldest > Config.OPS_OUTBOX_STALE_SECONDS
                else "ok"
            )
            components["outbox"] = {
                "status": outbox_status,
                "oldest_pending_age_seconds": oldest,
                "counts": outbox.get("counts", {}),
            }
        except Exception:  # noqa: BLE001
            outbox_status = "unknown"
            components["outbox"] = {"status": "unknown"}

        try:
            last_seen = svc.storage.get_heartbeat("email-outbox")
            if last_seen is None:
                worker_status = "missing"
                worker_age = None
            else:
                worker_age = max(
                    0, int((datetime.utcnow() - last_seen).total_seconds())
                )
                worker_status = (
                    "ok"
                    if worker_age <= Config.OPS_WORKER_STALE_SECONDS
                    else "stale"
                )
            components["worker"] = {
                "status": worker_status,
                "heartbeat_age_seconds": worker_age,
            }
        except Exception:  # noqa: BLE001
            worker_status = "unknown"
            components["worker"] = {"status": "unknown"}

    healthy = db_ok and outbox_status in {"ok", "unknown"}
    if Config.require_worker_heartbeat() and worker_status != "ok":
        healthy = False

    return (
        jsonify(
            {
                "status": "ok" if healthy else "degraded",
                "environment": Config.environment_name(),
                "release": Config.release_sha(),
                "components": components,
            }
        ),
        200 if healthy else 503,
    )
