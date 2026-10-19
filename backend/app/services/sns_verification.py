"""Verification of AWS SNS messages used for SES delivery events.

SNS posts to a public, unauthenticated URL. Without signature verification
anyone could forge a bounce/complaint, so every field is validated before the
payload is trusted.
"""

from __future__ import annotations

import base64
import logging
from datetime import UTC, datetime
from urllib.parse import urlparse

import requests
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding

from ..config import Config
from .resilience import retry_with_backoff

logger = logging.getLogger(__name__)

_CERT_CACHE: dict[str, bytes] = {}


class SNSVerificationError(Exception):
    """The SNS payload could not be trusted."""


def _is_aws_host(host: str) -> bool:
    return host == "sns.amazonaws.com" or (
        host.startswith("sns.") and host.endswith(".amazonaws.com")
    )


def is_aws_sns_url(url: str) -> bool:
    """True for HTTPS URLs hosted by SNS (used for SubscribeURL)."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return parsed.scheme == "https" and _is_aws_host((parsed.hostname or "").lower())


def _is_signing_cert_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and _is_aws_host((parsed.hostname or "").lower())
        and parsed.path.endswith(".pem")
    )


def _canonical_string(payload: dict) -> str:
    message_type = payload.get("Type")

    if message_type == "Notification":
        keys = ["Message", "MessageId"]
        if payload.get("Subject"):
            keys.append("Subject")
        keys.extend(["Timestamp", "TopicArn", "Type"])
    else:
        keys = [
            "Message",
            "MessageId",
            "SubscribeURL",
            "Timestamp",
            "Token",
            "TopicArn",
            "Type",
        ]

    missing = [key for key in keys if key not in payload]
    if missing:
        raise SNSVerificationError(f"missing fields: {', '.join(missing)}")

    return "".join(f"{key}\n{payload[key]}\n" for key in keys)


def _fetch_certificate(url: str) -> bytes:
    cached = _CERT_CACHE.get(url)
    if cached is not None:
        return cached

    def _fetch() -> requests.Response:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        return response

    response = retry_with_backoff(
        _fetch,
        service="SNS signing certificate",
        attempts=2,
    )
    pem = response.content
    _CERT_CACHE[url] = pem
    return pem


def verify_sns_message(payload: dict) -> None:
    """Validate topic, age, signing certificate, and signature.

    Raises:
        SNSVerificationError: any check fails.
    """
    topic_arn = Config.SES_SNS_TOPIC_ARN
    if not topic_arn:
        raise SNSVerificationError("SES_SNS_TOPIC_ARN is not configured")
    if payload.get("TopicArn") != topic_arn:
        raise SNSVerificationError("unexpected topic ARN")

    cert_url = payload.get("SigningCertURL", "")
    if not _is_signing_cert_url(cert_url):
        raise SNSVerificationError("invalid signing certificate URL")

    timestamp = payload.get("Timestamp", "")
    try:
        sent_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SNSVerificationError("invalid timestamp") from exc

    age = abs((datetime.now(UTC) - sent_at).total_seconds())
    if age > Config.SES_SNS_MAX_MESSAGE_AGE_SECONDS:
        raise SNSVerificationError("message is too old")

    signature = payload.get("Signature")
    if not signature:
        raise SNSVerificationError("missing signature")

    pem = _fetch_certificate(cert_url)
    certificate = x509.load_pem_x509_certificate(pem)
    public_key = certificate.public_key()

    algorithm = hashes.SHA256() if payload.get("SignatureVersion") == "2" else hashes.SHA1()
    canonical = _canonical_string(payload).encode("utf-8")

    try:
        public_key.verify(  # type: ignore[attr-defined]
            base64.b64decode(signature),
            canonical,
            padding.PKCS1v15(),
            algorithm,
        )
    except InvalidSignature as exc:
        raise SNSVerificationError("signature verification failed") from exc
