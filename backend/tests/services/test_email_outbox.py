"""Tests for the durable admin email outbox."""

from pathlib import Path

import pytest

from app.config import Config
from app.database import EmailOutbox
from app.services.email_service import EmailService
from app.services.storage import NoteStorage


@pytest.fixture()
def storage(tmp_path: Path) -> NoteStorage:
    return NoteStorage(db_path=tmp_path / "outbox_test.db")


@pytest.fixture()
def email(storage: NoteStorage, monkeypatch) -> EmailService:
    monkeypatch.setattr(Config, "ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setattr(Config, "SES_ACCESS_KEY_ID", "test-key")
    monkeypatch.setattr(Config, "SES_SECRET_ACCESS_KEY", "test-secret")
    return EmailService(storage=storage)


def _row(storage: NoteStorage, dedupe_key: str) -> EmailOutbox:
    with storage._session_scope() as session:
        return (
            session.query(EmailOutbox)
            .filter(EmailOutbox.dedupe_key == dedupe_key)
            .one()
        )


def test_feedback_is_enqueued_once_and_identifies_the_user(email):
    queued = email.send_feedback_notification(
        feedback_id="fb-1",
        user_id="user-1",
        feedback_type="bug",
        title="Broken page",
        description="The dashboard is blank",
        rating=2,
        display_name="Alice",
        username="alice",
        user_email="alice@example.com",
    )
    duplicate = email.send_feedback_notification(
        feedback_id="fb-1",
        user_id="user-1",
        feedback_type="bug",
        title="Broken page",
    )

    assert queued is True
    assert duplicate is False

    row = _row(email.storage, "feedback:fb-1")
    assert "Alice" in row.body
    assert "@alice" in row.body
    assert "alice@example.com" in row.body
    assert row.subject.startswith("[Chisos][Feedback] BUG:")


def test_subject_strips_control_characters(email):
    email.send_feedback_notification(
        feedback_id="fb-2",
        user_id="user-1",
        feedback_type="general",
        title="hello\r\nBcc: attacker@example.com",
    )

    row = _row(email.storage, "feedback:fb-2")
    assert "\r" not in row.subject
    assert "\n" not in row.subject
    assert "Bcc:" in row.subject  # flattened, not a header


def test_flush_sends_and_marks_delivered(email, monkeypatch):
    monkeypatch.setattr(email, "_send_email", lambda **kwargs: True)
    email.send_new_user_notification("user-2", display_name="Bob")

    assert email.flush() == 1

    row = _row(email.storage, "new_user:user-2")
    assert row.status == "sent"
    assert row.sent_at is not None
    assert email.storage.claim_due_emails() == []


def test_flush_schedules_retry_on_failure(email, monkeypatch):
    monkeypatch.setattr(email, "_send_email", lambda **kwargs: False)
    email.send_new_user_notification("user-3", display_name="Cara")

    assert email.flush() == 0

    row = _row(email.storage, "new_user:user-3")
    assert row.status == "pending"
    assert row.attempts == 1
    assert row.last_error
    assert row.next_attempt_at is not None


def test_error_alerts_are_deduped_per_incident(email):
    first = email.send_error_notification(
        error_type="RuntimeError",
        error_message="boom",
        method="POST",
        path="/api/notes",
        request_id="req-1",
    )
    second = email.send_error_notification(
        error_type="RuntimeError",
        error_message="boom again",
        method="POST",
        path="/api/notes",
        request_id="req-2",
    )

    assert first is True
    assert second is False


def test_notifications_are_skipped_when_email_is_unconfigured(email, monkeypatch):
    monkeypatch.setattr(Config, "ADMIN_EMAIL", None)

    assert email.send_new_user_notification("user-4") is False
    assert email.storage.claim_due_emails() == []


def test_multiple_admin_recipients_are_stored(email, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "one@example.com, two@example.com")
    email.send_new_user_notification("user-5", display_name="Dan")

    row = _row(email.storage, "new_user:user-5")
    assert row.to_address == "one@example.com,two@example.com"


def test_html_body_is_escaped():
    from app.services.email_service import EmailService

    rendered = EmailService._render_html(
        "Subject <script>",
        "Name: <script>alert(1)</script>\nplain & text",
    )

    assert "<script>alert(1)</script>" not in rendered
    assert "&lt;script&gt;" in rendered
    assert "plain &amp; text" in rendered


def test_digest_only_enqueues_in_digest_mode(email):
    assert email.maybe_enqueue_daily_digest() is False


def test_send_email_uses_configured_configuration_set(email, monkeypatch):
    from app.config import Config

    monkeypatch.setattr(Config, "SES_CONFIGURATION_SET", "my-first-configuration-set")
    captured: dict = {}

    class _Client:
        def send_email(self, **kwargs):  # noqa: ANN003
            captured.update(kwargs)

    monkeypatch.setattr(
        "app.services.email_service.boto3.client",
        lambda *args, **kwargs: _Client(),
    )

    assert email._send_email("admin@example.com", "subject", "body") is True
    assert captured["ConfigurationSetName"] == "my-first-configuration-set"
