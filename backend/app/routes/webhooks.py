"""Unauthenticated webhooks with their own authentication mechanism.

SNS messages are authenticated by signature, not by Clerk JWT.
"""

from __future__ import annotations

import json
import logging

import requests
from flask import Blueprint, jsonify, request

from ..config import Config
from ..services.container import get_services
from ..services.sns_verification import (
    SNSVerificationError,
    is_aws_sns_url,
    verify_sns_message,
)

logger = logging.getLogger(__name__)

bp = Blueprint("webhooks", __name__)


def _extract_event(message: dict) -> tuple[str | None, list[str]]:
    event_type = message.get("notificationType") or message.get("eventType")

    if event_type == "Bounce":
        bounce = message.get("bounce") or {}
        recipients = [
            recipient.get("emailAddress", "")
            for recipient in bounce.get("bouncedRecipients", [])
            if recipient.get("emailAddress")
        ]
        return bounce.get("bounceType"), recipients

    if event_type == "Complaint":
        complaint = message.get("complaint") or {}
        recipients = [
            recipient.get("emailAddress", "")
            for recipient in complaint.get("complainedRecipients", [])
            if recipient.get("emailAddress")
        ]
        return complaint.get("complaintFeedbackType"), recipients

    return None, []


def _should_alert(event_type: str, subtype: str | None, recipients: list[str]) -> bool:
    is_permanent_bounce = event_type == "Bounce" and subtype == "Permanent"
    if event_type != "Complaint" and not is_permanent_bounce:
        return False

    # Never alert on problems delivering the alert itself: it would loop.
    admins = {address.lower() for address in Config.admin_emails()}
    return not (recipients and {address.lower() for address in recipients} <= admins)


def _confirm_subscription(payload: dict):
    if not Config.SES_SNS_AUTO_CONFIRM:
        logger.info("SNS subscription confirmation received; auto-confirm is disabled")
        return jsonify({"status": "confirmation required"}), 202

    subscribe_url = payload.get("SubscribeURL", "")
    if not is_aws_sns_url(subscribe_url):
        return jsonify({"error": "invalid subscribe URL"}), 400

    try:
        requests.get(subscribe_url, timeout=5).raise_for_status()
    except Exception:
        logger.exception("Failed to confirm SNS subscription")
        return jsonify({"error": "confirmation failed"}), 503

    return jsonify({"status": "confirmed"}), 200


@bp.post("/webhooks/sns")
def sns_webhook():
    """Receive SES bounce/complaint events forwarded by SNS."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "invalid payload"}), 400

    try:
        verify_sns_message(payload)
    except SNSVerificationError as exc:
        logger.warning("Rejected SNS message: %s", exc)
        return jsonify({"error": "invalid signature"}), 403
    except Exception:
        logger.exception("Unexpected error verifying SNS message")
        return jsonify({"error": "verification failed"}), 503

    message_type = payload.get("Type")
    if message_type == "SubscriptionConfirmation":
        return _confirm_subscription(payload)
    if message_type != "Notification":
        return jsonify({"status": "ignored"}), 200

    try:
        message = json.loads(payload.get("Message", "{}"))
    except json.JSONDecodeError:
        return jsonify({"error": "invalid message"}), 400

    event_type = message.get("notificationType") or message.get("eventType") or "Unknown"
    subtype, recipients = _extract_event(message)

    if event_type not in {"Bounce", "Complaint"}:
        return jsonify({"status": "ignored"}), 200

    svc = get_services()
    recorded = svc.storage.record_email_event(
        sns_message_id=payload.get("MessageId", ""),
        event_type=event_type,
        subtype=subtype,
        recipients=recipients,
        detail=json.dumps(message)[:8000],
    )

    if recorded and _should_alert(event_type, subtype, recipients):
        svc.email.send_delivery_problem_notification(
            event_type=event_type,
            subtype=subtype,
            recipients=recipients,
            sns_message_id=payload.get("MessageId", ""),
        )

    return jsonify({"status": "ok"}), 200
