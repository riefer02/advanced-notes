"""
Email notification service for the application.

Sends email notifications via AWS SES with best-effort delivery.
Email failures do not block the main application flow.
"""

from __future__ import annotations

import logging
import time

import boto3
from botocore.exceptions import ClientError

from ..config import Config

logger = logging.getLogger(__name__)

_last_error_email_at: float = 0.0
_ERROR_EMAIL_COOLDOWN_SECONDS: float = 600.0  # 10 minutes


class EmailService:
    """
    Email service for sending notifications.

    Follows the same service pattern as other services in the container.
    Uses best-effort delivery - failures are logged but don't raise exceptions.
    """

    def is_configured(self) -> bool:
        """Check if SES is properly configured."""
        return Config.email_enabled()

    def send_feedback_notification(
        self,
        feedback_id: str,
        user_id: str,
        feedback_type: str,
        title: str,
        description: str | None = None,
        rating: int | None = None,
    ) -> bool:
        """
        Send email notification for new feedback submission.

        Args:
            feedback_id: The feedback record ID.
            user_id: The user who submitted feedback.
            feedback_type: Type of feedback (bug, feature, general).
            title: Feedback title.
            description: Optional feedback description.
            rating: Optional rating (1-5).

        Returns:
            True if email was sent successfully, False otherwise.
        """
        if not self.is_configured():
            logger.debug("Email not configured, skipping feedback notification")
            return False

        subject = f"[Chisos Feedback] {feedback_type.upper()}: {title}"

        body_lines = [
            "New feedback submitted",
            "",
            f"Type: {feedback_type}",
            f"Title: {title}",
        ]

        if description:
            body_lines.extend(["", "Description:", description])

        if rating is not None:
            body_lines.extend(["", f"Rating: {rating}/5"])

        body_lines.extend([
            "",
            "---",
            f"Feedback ID: {feedback_id}",
            f"User ID: {user_id}",
        ])

        body = "\n".join(body_lines)

        return self._send_email(
            to_address=Config.ADMIN_EMAIL,
            subject=subject,
            body=body,
        )

    def _send_email(
        self,
        to_address: str | None,
        subject: str,
        body: str,
    ) -> bool:
        """
        Send an email via AWS SES.

        Args:
            to_address: Recipient email address.
            subject: Email subject line.
            body: Plain text email body.

        Returns:
            True if sent successfully, False otherwise.
        """
        if not to_address:
            logger.warning("No recipient address provided for email")
            return False

        if not self.is_configured():
            return False

        sender = Config.SES_SENDER_EMAIL or Config.ADMIN_EMAIL

        try:
            client = boto3.client(
                "ses",
                region_name=Config.SES_REGION,
                aws_access_key_id=Config.SES_ACCESS_KEY_ID,
                aws_secret_access_key=Config.SES_SECRET_ACCESS_KEY,
            )
            client.send_email(
                Source=sender,
                Destination={"ToAddresses": [to_address]},
                Message={
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
                },
            )
            logger.info(f"Email sent successfully to {to_address}: {subject}")
            return True

        except ClientError as e:
            logger.error(f"SES error sending email: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending email: {e}")
            return False

    # ------------------------------------------------------------------
    # Admin notification helpers
    # ------------------------------------------------------------------

    def send_new_user_notification(
        self,
        user_id: str,
        display_name: str | None = None,
        email: str | None = None,
        username: str | None = None,
    ) -> bool:
        """Send admin notification for a new user signup."""
        body = "\n".join([
            "New user signed up",
            "",
            f"User ID: {user_id}",
            f"Display Name: {display_name or '(none)'}",
            f"Email: {email or '(none)'}",
            f"Username: {username or '(none)'}",
        ])
        return self._send_email(
            to_address=Config.ADMIN_EMAIL,
            subject="[Chisos] New User Signup",
            body=body,
        )

    def send_cost_threshold_alert(
        self,
        current_cost: float,
        threshold: float,
        period: str,
    ) -> bool:
        """Send admin alert when monthly API cost exceeds threshold."""
        body = "\n".join([
            f"Monthly API cost has reached ${current_cost:.2f}",
            "",
            f"Threshold: ${threshold:.2f}",
            f"Billing period: {period}",
        ])
        return self._send_email(
            to_address=Config.ADMIN_EMAIL,
            subject=f"[Chisos] Monthly cost alert: ${current_cost:.2f}",
            body=body,
        )

    def send_error_notification(
        self,
        error_message: str,
        endpoint: str,
        timestamp: str,
    ) -> bool:
        """
        Send admin notification for a 500 server error.

        Rate-limited to one email per 10 minutes.
        """
        global _last_error_email_at  # noqa: PLW0603

        now = time.monotonic()
        if now - _last_error_email_at < _ERROR_EMAIL_COOLDOWN_SECONDS:
            logger.debug("Error email rate-limited, skipping")
            return False

        truncated = error_message[:2000]
        body = "\n".join([
            "A 500 error occurred",
            "",
            f"Endpoint: {endpoint}",
            f"Timestamp: {timestamp}",
            "",
            "Error:",
            truncated,
        ])
        sent = self._send_email(
            to_address=Config.ADMIN_EMAIL,
            subject="[Chisos] Server Error (500)",
            body=body,
        )
        if sent:
            _last_error_email_at = now
        return sent
