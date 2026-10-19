"""Durable email outbox storage."""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from ...database import EmailOutbox as EmailOutboxORM


class NotificationStorageMixin:
    """Enqueue/claim/mark operations for the admin email outbox."""

    def enqueue_email(
        self,
        *,
        dedupe_key: str,
        to_address: str,
        subject: str,
        body: str,
    ) -> bool:
        """Insert a pending email. Returns False if the key already exists."""
        row = EmailOutboxORM(
            id=str(uuid4()),
            dedupe_key=dedupe_key,
            to_address=to_address,
            subject=subject,
            body=body,
            status="pending",
            attempts=0,
            created_at=datetime.utcnow(),
        )
        try:
            with self._session_scope() as session:
                session.add(row)
            return True
        except IntegrityError:
            # Another worker (or an earlier attempt) already queued this event.
            return False

    def claim_due_emails(self, limit: int = 10) -> list[dict]:
        """Atomically claim pending rows that are due for delivery."""
        now = datetime.utcnow()
        claimed: list[dict] = []

        with self._session_scope() as session:
            rows = (
                session.query(EmailOutboxORM)
                .filter(EmailOutboxORM.status == "pending")
                .filter(
                    or_(
                        EmailOutboxORM.next_attempt_at.is_(None),
                        EmailOutboxORM.next_attempt_at <= now,
                    )
                )
                .order_by(EmailOutboxORM.created_at)
                .limit(max(1, limit))
                .all()
            )

            for row in rows:
                # Only the worker that flips pending -> sending owns the row.
                updated = (
                    session.query(EmailOutboxORM)
                    .filter(
                        EmailOutboxORM.id == row.id,
                        EmailOutboxORM.status == "pending",
                    )
                    .update({"status": "sending"}, synchronize_session=False)
                )
                if updated:
                    claimed.append(
                        {
                            "id": row.id,
                            "to_address": row.to_address,
                            "subject": row.subject,
                            "body": row.body,
                            "attempts": row.attempts,
                        }
                    )

        return claimed

    def mark_email_sent(self, email_id: str) -> bool:
        with self._session_scope() as session:
            updated = (
                session.query(EmailOutboxORM)
                .filter(EmailOutboxORM.id == email_id)
                .update(
                    {
                        "status": "sent",
                        "sent_at": datetime.utcnow(),
                        "attempts": EmailOutboxORM.attempts + 1,
                        "last_error": None,
                    },
                    synchronize_session=False,
                )
            )
            return updated > 0

    def mark_email_failed(
        self,
        email_id: str,
        error: str,
        *,
        max_attempts: int = 5,
    ) -> bool:
        """Record a failure and schedule a retry with exponential backoff."""
        with self._session_scope() as session:
            row = (
                session.query(EmailOutboxORM)
                .filter(EmailOutboxORM.id == email_id)
                .one_or_none()
            )
            if not row:
                return False

            row.attempts = (row.attempts or 0) + 1
            row.last_error = error[:2000]

            if row.attempts >= max_attempts:
                row.status = "failed"
                row.next_attempt_at = None
            else:
                delay = min(30 * (2 ** (row.attempts - 1)), 3600)
                delay *= random.uniform(0.5, 1.0)
                row.status = "pending"
                row.next_attempt_at = datetime.utcnow() + timedelta(seconds=delay)

            session.add(row)
            return True
