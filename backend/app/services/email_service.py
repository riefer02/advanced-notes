"""
Admin email notifications.

Notifications are written to a durable outbox in the request path and
delivered by a background worker, so SES latency never blocks a user request
and a transient delivery failure is retried instead of lost.
"""

from __future__ import annotations

import html
import logging
import re
import time
from datetime import UTC, datetime, timedelta

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from ..config import Config

logger = logging.getLogger(__name__)

# Errors are deduped into 10-minute buckets, shared across workers through the
# outbox's unique dedupe key rather than per-process memory.
_ERROR_BUCKET_SECONDS = 600


class EmailService:
    """Enqueue admin notifications and deliver them via AWS SES."""

    def __init__(self, storage=None):
        # NoteStorage provides the outbox; optional so the service can be
        # constructed in isolation for tests.
        self.storage = storage

    def is_configured(self) -> bool:
        """Check if SES is properly configured."""
        return Config.email_enabled()

    # ------------------------------------------------------------------
    # Public notification helpers (enqueue only)
    # ------------------------------------------------------------------

    def send_feedback_notification(
        self,
        feedback_id: str,
        user_id: str,
        feedback_type: str,
        title: str,
        description: str | None = None,
        rating: int | None = None,
        display_name: str | None = None,
        username: str | None = None,
        user_email: str | None = None,
    ) -> bool:
        """Queue an admin notification for a new feedback submission."""
        subject = f"[Chisos][Feedback] {feedback_type.upper()}: {title}"

        lines = [
            "New feedback submitted",
            "",
            f"Type: {feedback_type}",
            f"Title: {title}",
            "",
            "Submitted by:",
            f"  Name: {display_name or '(unknown)'}",
            f"  Username: @{username}" if username else "  Username: (none)",
            f"  Email: {user_email or '(none)'}",
            f"  User ID: {user_id}",
        ]

        if description:
            lines.extend(["", "Description:", description])
        if rating is not None:
            lines.extend(["", f"Rating: {rating}/5"])

        lines.extend(["", f"Feedback ID: {feedback_id}"])

        return self._enqueue(
            dedupe_key=f"feedback:{feedback_id}",
            subject=subject,
            body="\n".join(lines),
        )

    def send_new_user_notification(
        self,
        user_id: str,
        display_name: str | None = None,
        email: str | None = None,
        username: str | None = None,
    ) -> bool:
        """Queue an admin notification for a new user profile."""
        body = "\n".join(
            [
                "New user profile created",
                "",
                f"User ID: {user_id}",
                f"Display Name: {display_name or '(none)'}",
                f"Email: {email or '(none)'}",
                f"Username: @{username}" if username else "Username: (none)",
            ]
        )
        return self._enqueue(
            dedupe_key=f"new_user:{user_id}",
            subject=f"[Chisos][New User] {display_name or username or user_id}",
            body=body,
        )

    def send_cost_threshold_alert(
        self,
        current_cost: float,
        threshold: float,
        period: str,
    ) -> bool:
        """Queue a monthly API cost alert."""
        body = "\n".join(
            [
                f"Monthly API cost has reached ${current_cost:.2f}",
                "",
                f"Threshold: ${threshold:.2f}",
                f"Billing period: {period}",
            ]
        )
        return self._enqueue(
            dedupe_key=f"cost:{period}",
            subject=f"[Chisos][Cost Alert] ${current_cost:.2f} for {period}",
            body=body,
        )

    def send_error_notification(
        self,
        *,
        error_type: str,
        error_message: str,
        traceback_text: str | None = None,
        method: str | None = None,
        path: str | None = None,
        endpoint: str | None = None,
        status: int = 500,
        user_id: str | None = None,
        request_id: str | None = None,
        timestamp: str | None = None,
    ) -> bool:
        """Queue a structured server-error alert.

        Deduped per endpoint + exception type in 10-minute buckets, so four
        Gunicorn workers cannot send four copies of the same incident.
        """
        resolved_path = path or endpoint or "(unknown)"
        bucket = int(time.time() // _ERROR_BUCKET_SECONDS)
        dedupe_key = f"error:{method or '?'}:{resolved_path}:{error_type}:{bucket}"

        body = "\n".join(
            [
                "A server error occurred",
                "",
                f"Status: {status}",
                f"Method: {method or '(unknown)'}",
                f"Path: {resolved_path}",
                f"Error type: {error_type}",
                f"Request ID: {request_id or '(none)'}",
                f"User ID: {user_id or '(anonymous)'}",
                f"Timestamp: {timestamp or datetime.now(UTC).isoformat()}",
                "",
                "Message:",
                (error_message or "(none)")[:2000],
                "",
                "Traceback:",
                (traceback_text or "(not captured)")[-4000:],
            ]
        )
        return self._enqueue(
            dedupe_key=dedupe_key,
            subject=f"[Chisos][Server Error] {error_type} on {resolved_path}",
            body=body,
        )

    def send_delivery_problem_notification(
        self,
        *,
        event_type: str,
        subtype: str | None,
        recipients: list[str],
        sns_message_id: str,
    ) -> bool:
        """Queue an alert for a permanent bounce or a complaint."""
        body = "\n".join(
            [
                f"SES reported a {event_type.lower()}",
                "",
                f"Type: {event_type}",
                f"Subtype: {subtype or '(unknown)'}",
                f"Recipients: {', '.join(recipients) or '(unknown)'}",
                f"SNS message ID: {sns_message_id}",
            ]
        )
        return self._enqueue(
            dedupe_key=f"email_event:{sns_message_id}",
            subject=f"[Chisos][Email Problem] {event_type}: {subtype or 'unknown'}",
            body=body,
        )

    def maybe_enqueue_daily_digest(self) -> bool:
        """In digest mode, send one daily summary of new users (09:00 UTC)."""
        if Config.NEW_USER_NOTIFICATION_MODE != "digest" or self.storage is None:
            return False

        now = datetime.now(UTC)
        if now.hour < 9:
            return False

        since = (now - timedelta(hours=24)).replace(tzinfo=None)
        profiles = self.storage.list_user_profiles_since(since)
        if not profiles:
            return False

        lines = [f"{len(profiles)} new users in the last 24 hours", ""]
        for profile in profiles:
            label = (
                profile.get("display_name")
                or profile.get("username")
                or profile.get("user_id")
            )
            lines.append(f"- {label} <{profile.get('email') or 'no email'}>")

        return self._enqueue(
            dedupe_key=f"digest:new_users:{now.date().isoformat()}",
            subject=f"[Chisos][Digest] {len(profiles)} new users",
            body="\n".join(lines),
        )

    # ------------------------------------------------------------------
    # Outbox + delivery
    # ------------------------------------------------------------------

    def _enqueue(self, *, dedupe_key: str, subject: str, body: str) -> bool:
        if not self.is_configured():
            logger.debug("Email not configured, skipping notification")
            return False

        recipients = Config.admin_emails()
        if not recipients:
            logger.warning("No admin recipients are configured")
            return False

        if self.storage is None:
            logger.warning("Email outbox storage is not configured")
            return False

        try:
            return self.storage.enqueue_email(
                dedupe_key=dedupe_key,
                to_address=",".join(recipients),
                subject=self._safe_subject(subject),
                body=self._with_footer(body),
            )
        except Exception:  # noqa: BLE001 - notifications must not break requests
            logger.exception("Failed to enqueue admin email")
            return False

    def flush(self, limit: int = 10) -> int:
        """Deliver due outbox rows. Safe to run in every worker; rows are claimed."""
        if self.storage is None or not self.is_configured():
            return 0

        sent = 0
        for item in self.storage.claim_due_emails(limit):
            try:
                self._deliver(
                    to_address=item["to_address"],
                    subject=item["subject"],
                    body=item["body"],
                )
                self.storage.mark_email_sent(item["id"])
                sent += 1
            except Exception as exc:  # noqa: BLE001 - recorded on the row
                logger.warning("Email delivery failed for %s: %s", item["id"], exc)
                self.storage.mark_email_failed(item["id"], str(exc))

        return sent

    def _deliver(self, *, to_address: str, subject: str, body: str) -> None:
        """Send one email synchronously; raises so the outbox can retry."""
        if not self._send_email(to_address=to_address, subject=subject, body=body):
            raise RuntimeError("SES delivery failed")

    def _send_email(
        self,
        to_address: str | None,
        subject: str,
        body: str,
    ) -> bool:
        recipients = [
            address.strip() for address in (to_address or "").split(",") if address.strip()
        ]
        if not recipients:
            logger.warning("No recipient address provided for email")
            return False

        if not self.is_configured():
            return False

        sender = Config.SES_SENDER_EMAIL or recipients[0]

        try:
            client = boto3.client(
                "ses",
                region_name=Config.SES_REGION,
                aws_access_key_id=Config.SES_ACCESS_KEY_ID,
                aws_secret_access_key=Config.SES_SECRET_ACCESS_KEY,
                config=BotoConfig(
                    connect_timeout=5,
                    read_timeout=5,
                    retries={"max_attempts": 1},
                ),
            )
            client.send_email(
                Source=sender,
                Destination={"ToAddresses": recipients},
                Message={
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {
                        "Text": {"Data": body, "Charset": "UTF-8"},
                        "Html": {
                            "Data": self._render_html(subject, body),
                            "Charset": "UTF-8",
                        },
                    },
                },
            )
            logger.info("Email sent to %s: %s", ", ".join(recipients), subject)
            return True

        except ClientError as e:
            logger.error("SES error sending email: %s", e)
            return False
        except Exception as e:  # noqa: BLE001 - caller records the failure
            logger.error("Unexpected error sending email: %s", e)
            return False

    # ------------------------------------------------------------------
    # Formatting
    # ------------------------------------------------------------------

    @staticmethod
    def _safe_subject(subject: str, max_length: int = 150) -> str:
        """Strip control characters and bound the length.

        User-provided feedback titles are interpolated into subjects; CR/LF
        must never reach a header.
        """
        cleaned = " ".join(str(subject).replace("\r", " ").replace("\n", " ").split())
        return cleaned[:max_length] or "(no subject)"

    @staticmethod
    def _render_html(subject: str, body: str) -> str:
        """Render the plain-text body as a simple, escaped admin email."""
        blocks: list[str] = []
        for line in body.splitlines():
            if not line.strip():
                blocks.append('<div style="height:8px"></div>')
                continue
            if line.strip() == "---":
                blocks.append(
                    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">'
                )
                continue

            key_value = re.match(r"^([A-Z][A-Za-z ]{1,40}): (.*)$", line)
            if key_value:
                key, value = key_value.groups()
                blocks.append(
                    f'<p style="margin:4px 0"><strong>{html.escape(key)}:</strong> '
                    f"{html.escape(value)}</p>"
                )
            else:
                blocks.append(f'<p style="margin:4px 0">{html.escape(line)}</p>')

        return f"""<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
      <h2 style="margin:0 0 16px;font-size:18px">{html.escape(subject)}</h2>
      {''.join(blocks)}
    </div>
  </body>
</html>"""

    @staticmethod
    def _environment() -> str:
        return Config.APP_ENV or Config.FLASK_ENV or "unknown"

    def _with_footer(self, body: str) -> str:
        return "\n".join(
            [
                body,
                "",
                "---",
                f"Environment: {self._environment()}",
                f"Queued: {datetime.now(UTC).isoformat(timespec='seconds')}",
            ]
        )
