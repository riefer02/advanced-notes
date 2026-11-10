"""Tests for admin observability, readiness, and problem-report triage."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timedelta

import pytest

from app.config import Config
from app.services.email_service import EmailService
from app.services.resilience import ExternalServiceError
from tests.helpers import make_app

ADMIN = "admin-user"


@pytest.fixture()
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_USER_IDS", ADMIN)
    monkeypatch.setattr(Config, "APP_ENV", "development")
    monkeypatch.setattr(Config, "FLASK_ENV", "development")
    return make_app(tmp_path, monkeypatch=monkeypatch, db_name="ops.db")


def _admin_headers() -> dict[str, str]:
    return {"X-Test-User-Id": ADMIN}


class _RecordingEmail:
    def __init__(self) -> None:
        self.test_alerts = 0

    def is_configured(self) -> bool:
        return True

    def send_test_alert(self) -> bool:
        self.test_alerts += 1
        return True

    def send_problem_report_notification(self, **kwargs):  # noqa: ANN003
        return False

    def send_error_notification(self, **kwargs):  # noqa: ANN003
        return False


def test_admin_endpoints_require_configuration(app, monkeypatch):
    monkeypatch.delenv("ADMIN_USER_IDS", raising=False)

    response = app.test_client().get("/api/admin/ops/summary", headers=_admin_headers())

    assert response.status_code == 403


def test_admin_endpoints_reject_non_admin(app):
    response = app.test_client().get(
        "/api/admin/ops/summary", headers={"X-Test-User-Id": "someone-else"}
    )

    assert response.status_code == 403


def test_ops_summary_aggregates_events_and_outbox(app):
    svc = app.extensions["services"]
    svc.storage.record_ops_event(
        fingerprint="GET:/api/notes:RuntimeError:123",
        status=500,
        error_type="RuntimeError",
        message="boom",
        method="GET",
        route="/api/notes",
    )
    svc.storage.enqueue_email(
        dedupe_key="test:summary",
        to_address="admin@example.com",
        subject="hello",
        body="body",
    )

    response = app.test_client().get("/api/admin/ops/summary", headers=_admin_headers())

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["database"]["ok"] is True
    assert payload["errors"]["last_24h"] == 1
    assert payload["errors"]["top_24h"][0]["error_type"] == "RuntimeError"
    assert payload["outbox"]["counts"]["pending"] == 1


def test_readiness_reports_ok_when_database_is_up(app):
    response = app.test_client().get("/api/health/ready")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "ok"
    assert payload["components"]["database"]["status"] == "ok"


def test_readiness_degrades_when_database_is_down(app, monkeypatch):
    monkeypatch.setattr(app.extensions["services"].storage, "ping", lambda: False)

    response = app.test_client().get("/api/health/ready")

    assert response.status_code == 503
    assert response.get_json()["status"] == "degraded"
    assert response.get_json()["components"]["database"]["status"] == "down"


def test_readiness_requires_worker_heartbeat_in_production(app, monkeypatch):
    monkeypatch.setattr(Config, "APP_ENV", "production")

    missing = app.test_client().get("/api/health/ready")
    assert missing.status_code == 503
    assert missing.get_json()["components"]["worker"]["status"] == "missing"

    app.extensions["services"].storage.upsert_heartbeat("email-outbox")
    healthy = app.test_client().get("/api/health/ready")
    assert healthy.status_code == 200


def test_stale_outbox_degrades_readiness(app, monkeypatch):
    monkeypatch.setattr(
        app.extensions["services"].storage,
        "get_outbox_stats",
        lambda: {
            "counts": {"pending": 1, "sending": 0, "sent": 0, "failed": 0},
            "oldest_pending_at": (datetime.utcnow() - timedelta(hours=2)).isoformat(),
            "oldest_pending_age_seconds": 7200,
        },
    )

    response = app.test_client().get("/api/health/ready")

    assert response.status_code == 503
    assert response.get_json()["components"]["outbox"]["status"] == "stale"


def test_problem_report_triage_flow(app):
    svc = app.extensions["services"]
    report_id = svc.storage.create_problem_report(
        user_id="user-a",
        message="blank screen",
        page="/notes",
        contact_email=None,
        ip="127.0.0.1",
        user_agent="pytest",
    )

    listing = app.test_client().get("/api/admin/reports", headers=_admin_headers())
    assert listing.status_code == 200
    assert listing.get_json()["total"] == 1
    assert listing.get_json()["reports"][0]["id"] == report_id

    updated = app.test_client().post(
        f"/api/admin/reports/{report_id}/status",
        json={"status": "resolved"},
        headers=_admin_headers(),
    )
    assert updated.status_code == 200
    assert updated.get_json()["status"] == "resolved"

    open_only = app.test_client().get(
        "/api/admin/reports?status=new", headers=_admin_headers()
    )
    assert open_only.get_json()["total"] == 0


def test_admin_test_alert_verifies_email_path(app):
    recorder = _RecordingEmail()
    app.extensions["services"] = replace(app.extensions["services"], email=recorder)

    response = app.test_client().post("/api/admin/test-alert", headers=_admin_headers())

    assert response.status_code == 200
    assert response.get_json()["queued"] is True
    assert recorder.test_alerts == 1


def test_outbox_retry_requeues_failed_and_reclaims_stuck(app):
    svc = app.extensions["services"]

    svc.storage.enqueue_email(
        dedupe_key="failed:1",
        to_address="admin@example.com",
        subject="failed",
        body="body",
    )
    failed_claim = svc.storage.claim_due_emails()
    svc.storage.mark_email_failed(failed_claim[0]["id"], "smtp down", max_attempts=1)

    svc.storage.enqueue_email(
        dedupe_key="stuck:1",
        to_address="admin@example.com",
        subject="stuck",
        body="body",
    )
    stuck_claim = svc.storage.claim_due_emails()

    from app.database import EmailOutbox

    with svc.storage._session_scope() as session:
        row = (
            session.query(EmailOutbox)
            .filter(EmailOutbox.id == stuck_claim[0]["id"])
            .one()
        )
        row.claimed_at = datetime.utcnow() - timedelta(minutes=10)

    response = app.test_client().post(
        "/api/admin/outbox/retry", json={"include_stuck": True}, headers=_admin_headers()
    )

    assert response.status_code == 200
    assert response.get_json() == {"requeued": 1, "reclaimed": 1}

    stats = svc.storage.get_outbox_stats()
    assert stats["counts"]["failed"] == 0
    assert stats["counts"]["sending"] == 0
    assert stats["counts"]["pending"] == 2


def test_server_error_is_recorded_as_ops_event(app, monkeypatch):
    def _boom(**kwargs):  # noqa: ANN003
        raise RuntimeError("database exploded")

    monkeypatch.setattr(app.extensions["services"].storage, "list_notes", _boom)

    response = app.test_client().get("/api/notes", headers={"X-Test-User-Id": "user-a"})
    assert response.status_code == 500

    events = app.extensions["services"].storage.list_ops_events()
    assert len(events) == 1
    assert events[0]["error_type"] == "RuntimeError"
    assert events[0]["route"] == "/api/notes"
    assert events[0]["status"] == 500


def test_external_service_failure_is_recorded_without_email_flood(app, monkeypatch):
    def _boom(**kwargs):  # noqa: ANN003
        raise ExternalServiceError("openai")

    monkeypatch.setattr(app.extensions["services"].storage, "list_notes", _boom)

    response = app.test_client().get("/api/notes", headers={"X-Test-User-Id": "user-a"})
    assert response.status_code == 503

    events = app.extensions["services"].storage.list_ops_events()
    assert len(events) == 1
    assert events[0]["status"] == 503
    assert events[0]["error_type"] == "ExternalServiceError"


def _configured_email(app, monkeypatch) -> EmailService:
    monkeypatch.setattr(Config, "OPS_DIGEST_HOUR_UTC", 0)
    monkeypatch.setattr(Config, "SES_ACCESS_KEY_ID", "test-key")
    monkeypatch.setattr(Config, "SES_SECRET_ACCESS_KEY", "test-secret")
    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")
    return EmailService(storage=app.extensions["services"].storage)


def test_ops_digest_is_skipped_on_a_quiet_day(app, monkeypatch):
    email = _configured_email(app, monkeypatch)

    assert email.maybe_enqueue_ops_digest() is False


def test_ops_digest_reports_recent_errors(app, monkeypatch):
    email = _configured_email(app, monkeypatch)
    app.extensions["services"].storage.record_ops_event(
        fingerprint="GET:/api/ask:RuntimeError:999",
        status=500,
        error_type="RuntimeError",
        message="boom",
        method="GET",
        route="/api/ask",
    )

    assert email.maybe_enqueue_ops_digest() is True

    outbox = app.extensions["services"].storage.get_outbox_stats()
    assert outbox["counts"]["pending"] == 1
    # Deduped per day when the worker calls it repeatedly.
    assert email.maybe_enqueue_ops_digest() is False