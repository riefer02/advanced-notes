"""Tests for the SES bounce/complaint SNS webhook."""

from __future__ import annotations

import base64
import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID

import app.services.sns_verification as sns
from app.config import Config
from app.database import EmailEvent
from tests.helpers import make_app

TOPIC = "arn:aws:sns:us-east-1:123456789012:ses-events"


@pytest.fixture(scope="module")
def signing_material() -> tuple[rsa.RSAPrivateKey, bytes]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "sns.amazonaws.com")])
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(UTC) - timedelta(days=1))
        .not_valid_after(datetime.now(UTC) + timedelta(days=30))
        .sign(key, hashes.SHA256())
    )
    return key, certificate.public_bytes(serialization.Encoding.PEM)


def _payload(
    key,
    message: dict,
    *,
    timestamp: str | None = None,
    topic: str = TOPIC,
    message_id: str = "sns-message-1",
) -> dict:
    payload = {
        "Type": "Notification",
        "Message": json.dumps(message),
        "MessageId": message_id,
        "TopicArn": topic,
        "Timestamp": timestamp
        or datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "SigningCertURL": "https://sns.us-east-1.amazonaws.com/cert.pem",
        "SignatureVersion": "2",
    }
    signature = key.sign(
        sns._canonical_string(payload).encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    payload["Signature"] = base64.b64encode(signature).decode()
    return payload


@pytest.fixture()
def app(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(Config, "SES_SNS_TOPIC_ARN", TOPIC)
    monkeypatch.setattr(Config, "ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setattr(Config, "SES_ACCESS_KEY_ID", "test-key")
    monkeypatch.setattr(Config, "SES_SECRET_ACCESS_KEY", "test-secret")
    return make_app(tmp_path, monkeypatch=monkeypatch, db_name="sns_test.db")


class _RecordingEmail:
    def __init__(self) -> None:
        self.problems: list[dict] = []

    def send_delivery_problem_notification(self, **kwargs):  # noqa: ANN003
        self.problems.append(kwargs)
        return True


def _install_recorder(app) -> _RecordingEmail:  # noqa: ANN001
    recorder = _RecordingEmail()
    app.extensions["services"] = replace(
        app.extensions["services"], email=recorder
    )
    return recorder


def _event_count(app) -> int:  # noqa: ANN001
    with app.extensions["services"].storage._session_scope() as session:
        return session.query(EmailEvent).count()


def test_valid_bounce_is_recorded_and_alerted(app, monkeypatch, signing_material):
    key, pem = signing_material
    monkeypatch.setattr(sns, "_fetch_certificate", lambda url: pem)
    recorder = _install_recorder(app)

    payload = _payload(
        key,
        {
            "notificationType": "Bounce",
            "bounce": {
                "bounceType": "Permanent",
                "bouncedRecipients": [{"emailAddress": "user@example.com"}],
            },
        },
    )

    response = app.test_client().post("/api/webhooks/sns", json=payload)

    assert response.status_code == 200
    assert _event_count(app) == 1
    assert len(recorder.problems) == 1
    assert recorder.problems[0]["event_type"] == "Bounce"
    assert recorder.problems[0]["subtype"] == "Permanent"


def test_duplicate_sns_message_is_not_recorded_twice(app, monkeypatch, signing_material):
    key, pem = signing_material
    monkeypatch.setattr(sns, "_fetch_certificate", lambda url: pem)
    recorder = _install_recorder(app)
    payload = _payload(
        key,
        {
            "notificationType": "Complaint",
            "complaint": {
                "complaintFeedbackType": "abuse",
                "complainedRecipients": [{"emailAddress": "user@example.com"}],
            },
        },
    )

    client = app.test_client()
    assert client.post("/api/webhooks/sns", json=payload).status_code == 200
    assert client.post("/api/webhooks/sns", json=payload).status_code == 200

    assert _event_count(app) == 1
    assert len(recorder.problems) == 1


def test_bounce_for_an_admin_does_not_loop(app, monkeypatch, signing_material):
    key, pem = signing_material
    monkeypatch.setattr(sns, "_fetch_certificate", lambda url: pem)
    recorder = _install_recorder(app)

    payload = _payload(
        key,
        {
            "notificationType": "Bounce",
            "bounce": {
                "bounceType": "Permanent",
                "bouncedRecipients": [{"emailAddress": "admin@example.com"}],
            },
        },
    )

    assert app.test_client().post("/api/webhooks/sns", json=payload).status_code == 200
    assert _event_count(app) == 1
    assert recorder.problems == []


def test_tampered_payload_fails_verification(monkeypatch, signing_material):
    key, pem = signing_material
    monkeypatch.setattr(sns, "_fetch_certificate", lambda url: pem)
    monkeypatch.setattr(Config, "SES_SNS_TOPIC_ARN", TOPIC)

    payload = _payload(key, {"notificationType": "Bounce"})
    payload["Message"] = json.dumps({"notificationType": "Complaint"})

    with pytest.raises(sns.SNSVerificationError):
        sns.verify_sns_message(payload)


def test_old_message_fails_verification(monkeypatch, signing_material):
    key, pem = signing_material
    monkeypatch.setattr(sns, "_fetch_certificate", lambda url: pem)
    monkeypatch.setattr(Config, "SES_SNS_TOPIC_ARN", TOPIC)

    old = (datetime.now(UTC) - timedelta(hours=2)).isoformat().replace("+00:00", "Z")
    payload = _payload(key, {"notificationType": "Bounce"}, timestamp=old)

    with pytest.raises(sns.SNSVerificationError):
        sns.verify_sns_message(payload)


def test_unexpected_topic_fails_verification(app, monkeypatch, signing_material):
    key, pem = signing_material
    monkeypatch.setattr(sns, "_fetch_certificate", lambda url: pem)

    payload = _payload(
        key,
        {"notificationType": "Bounce"},
        topic="arn:aws:sns:us-east-1:123456789012:someone-else",
    )

    response = app.test_client().post("/api/webhooks/sns", json=payload)

    assert response.status_code == 403
