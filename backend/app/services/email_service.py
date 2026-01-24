"""
Email notification service for the application.

Sends email notifications using Python's native smtplib with best-effort delivery.
Email failures do not block the main application flow.
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ..config import Config

logger = logging.getLogger(__name__)


class EmailService:
    """
    Email service for sending notifications.

    Follows the same service pattern as other services in the container.
    Uses best-effort delivery - failures are logged but don't raise exceptions.
    """

    def is_configured(self) -> bool:
        """Check if SMTP is properly configured."""
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
        Low-level SMTP send with STARTTLS/SSL/NONE support.

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

        # After is_configured() check, these are guaranteed non-None
        smtp_host = Config.SMTP_HOST
        smtp_username = Config.SMTP_USERNAME
        smtp_password = Config.SMTP_PASSWORD
        if not smtp_host or not smtp_username or not smtp_password:
            return False

        try:
            msg = MIMEMultipart()
            msg["From"] = smtp_username
            msg["To"] = to_address
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))

            security = Config.SMTP_SECURITY.upper()

            if security == "SSL":
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(
                    smtp_host, Config.SMTP_PORT, context=context
                ) as server:
                    server.login(smtp_username, smtp_password)
                    server.sendmail(smtp_username, to_address, msg.as_string())

            elif security == "STARTTLS":
                context = ssl.create_default_context()
                with smtplib.SMTP(smtp_host, Config.SMTP_PORT) as server:
                    server.starttls(context=context)
                    server.login(smtp_username, smtp_password)
                    server.sendmail(smtp_username, to_address, msg.as_string())

            else:  # NONE
                with smtplib.SMTP(smtp_host, Config.SMTP_PORT) as server:
                    server.login(smtp_username, smtp_password)
                    server.sendmail(smtp_username, to_address, msg.as_string())

            logger.info(f"Email sent successfully to {to_address}: {subject}")
            return True

        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending email: {e}")
            return False
