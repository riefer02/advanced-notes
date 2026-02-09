"""
Email notification service for the application.

Sends email notifications via AWS SES with best-effort delivery.
Email failures do not block the main application flow.
"""

from __future__ import annotations

import logging

import boto3
from botocore.exceptions import ClientError

from ..config import Config

logger = logging.getLogger(__name__)


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
