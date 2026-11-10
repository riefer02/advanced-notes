"""Operations storage: error events, heartbeats, outbox health."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import desc, func, text
from sqlalchemy.exc import IntegrityError

from ...database import EmailEvent as EmailEventORM
from ...database import EmailOutbox as EmailOutboxORM
from ...database import OpsEvent as OpsEventORM
from ...database import ProblemReport as ProblemReportORM
from ...database import ServiceHeartbeat as ServiceHeartbeatORM
from .engine import _coerce_datetime


class OpsStorageMixin:
    """Durable operational records used by admin endpoints and the digest."""

    def ping(self) -> bool:
        """Cheap database liveness check for readiness probes."""
        try:
            with self._session_scope() as session:
                session.execute(text("SELECT 1"))
            return True
        except Exception:  # noqa: BLE001 - readiness must never raise
            return False

    def record_ops_event(
        self,
        *,
        fingerprint: str,
        status: int = 500,
        error_type: str | None = None,
        message: str | None = None,
        traceback_text: str | None = None,
        method: str | None = None,
        route: str | None = None,
        path: str | None = None,
        user_id: str | None = None,
        request_id: str | None = None,
        environment: str | None = None,
        release: str | None = None,
    ) -> str:
        event_id = str(uuid4())
        event = OpsEventORM(
            id=event_id,
            created_at=datetime.utcnow(),
            environment=(environment or "")[:50] or None,
            release=(release or "")[:100] or None,
            request_id=(request_id or "")[:64] or None,
            method=(method or "")[:10] or None,
            route=(route or "")[:255] or None,
            path=(path or "")[:500] or None,
            status=int(status),
            error_type=(error_type or "")[:100] or None,
            message=(message or "")[:4000] or None,
            traceback=(traceback_text or "")[:20000] or None,
            user_id=(user_id or "")[:255] or None,
            fingerprint=fingerprint[:255],
        )
        with self._session_scope() as session:
            session.add(event)
        return event_id

    def count_ops_events_since(self, since: datetime, *, min_status: int | None = None) -> int:
        with self._session_scope() as session:
            query = session.query(func.count(OpsEventORM.id)).filter(
                OpsEventORM.created_at >= since
            )
            if min_status is not None:
                query = query.filter(OpsEventORM.status >= min_status)
            return int(query.scalar() or 0)

    def list_ops_events(self, limit: int = 50, offset: int = 0) -> list[dict]:
        with self._session_scope() as session:
            rows = (
                session.query(OpsEventORM)
                .order_by(desc(OpsEventORM.created_at))
                .offset(max(offset, 0))
                .limit(max(limit, 1))
                .all()
            )
            return [self._ops_event_dict(row, include_traceback=False) for row in rows]

    def get_ops_event(self, event_id: str) -> dict | None:
        with self._session_scope() as session:
            row = (
                session.query(OpsEventORM)
                .filter(OpsEventORM.id == event_id)
                .one_or_none()
            )
            return self._ops_event_dict(row, include_traceback=True) if row else None

    def top_ops_fingerprints_since(self, since: datetime, limit: int = 5) -> list[dict]:
        with self._session_scope() as session:
            count_col = func.count(OpsEventORM.id)
            rows = (
                session.query(
                    OpsEventORM.fingerprint,
                    count_col,
                    func.max(OpsEventORM.created_at),
                    func.min(OpsEventORM.error_type),
                    func.min(OpsEventORM.route),
                )
                .filter(OpsEventORM.created_at >= since)
                .group_by(OpsEventORM.fingerprint)
                .order_by(desc(count_col))
                .limit(max(limit, 1))
                .all()
            )
            return [
                {
                    "fingerprint": row[0],
                    "count": int(row[1] or 0),
                    "last_seen_at": row[2].isoformat() if row[2] else None,
                    "error_type": row[3],
                    "route": row[4],
                }
                for row in rows
            ]

    def upsert_heartbeat(self, name: str, detail: str | None = None) -> None:
        now = datetime.utcnow()
        detail_value = (detail or "")[:2000] or None
        try:
            with self._session_scope() as session:
                session.add(
                    ServiceHeartbeatORM(
                        name=name,
                        last_seen_at=now,
                        detail=detail_value,
                    )
                )
            return
        except IntegrityError:
            # Several workers may start at once; the loser of the insert race
            # updates the existing row instead of failing its loop.
            pass

        with self._session_scope() as session:
            session.query(ServiceHeartbeatORM).filter(
                ServiceHeartbeatORM.name == name
            ).update(
                {"last_seen_at": now, "detail": detail_value},
                synchronize_session=False,
            )

    def get_heartbeat(self, name: str) -> datetime | None:
        with self._session_scope() as session:
            row = (
                session.query(ServiceHeartbeatORM)
                .filter(ServiceHeartbeatORM.name == name)
                .one_or_none()
            )
            return _coerce_datetime(row.last_seen_at) if row else None

    def get_outbox_stats(self) -> dict:
        with self._session_scope() as session:
            rows = (
                session.query(EmailOutboxORM.status, func.count(EmailOutboxORM.id))
                .group_by(EmailOutboxORM.status)
                .all()
            )
            counts = {str(status): int(count) for status, count in rows}
            oldest = (
                session.query(func.min(EmailOutboxORM.created_at))
                .filter(EmailOutboxORM.status.in_(("pending", "sending")))
                .scalar()
            )

        oldest_dt = _coerce_datetime(oldest)
        oldest_age = None
        if oldest_dt is not None:
            oldest_age = max(0, int((datetime.utcnow() - oldest_dt).total_seconds()))

        return {
            "counts": {
                "pending": counts.get("pending", 0),
                "sending": counts.get("sending", 0),
                "sent": counts.get("sent", 0),
                "failed": counts.get("failed", 0),
            },
            "oldest_pending_at": oldest_dt.isoformat() if oldest_dt else None,
            "oldest_pending_age_seconds": oldest_age,
        }

    def count_problem_reports_since(self, since: datetime) -> int:
        with self._session_scope() as session:
            return int(
                session.query(func.count(ProblemReportORM.id))
                .filter(ProblemReportORM.created_at >= since)
                .scalar()
                or 0
            )

    def count_problem_reports(self, status: str | None = None) -> int:
        with self._session_scope() as session:
            query = session.query(func.count(ProblemReportORM.id))
            if status:
                query = query.filter(ProblemReportORM.status == status)
            return int(query.scalar() or 0)

    def update_problem_report_status(self, report_id: str, status: str) -> bool:
        with self._session_scope() as session:
            updated = (
                session.query(ProblemReportORM)
                .filter(ProblemReportORM.id == report_id)
                .update({"status": status}, synchronize_session=False)
            )
            return updated > 0

    def count_email_events_since(self, since: datetime) -> int:
        with self._session_scope() as session:
            return int(
                session.query(func.count(EmailEventORM.id))
                .filter(EmailEventORM.created_at >= since)
                .scalar()
                or 0
            )

    def prune_ops_data(self, older_than_days: int = 30) -> dict:
        """Delete old delivered emails, ops events, and email events.

        Runs from the background worker, never the request path.
        """
        cutoff = datetime.utcnow() - timedelta(days=max(1, older_than_days))
        with self._session_scope() as session:
            emails = (
                session.query(EmailOutboxORM)
                .filter(
                    EmailOutboxORM.status.in_(("sent", "failed")),
                    EmailOutboxORM.created_at < cutoff,
                )
                .delete(synchronize_session=False)
            )
            events = (
                session.query(OpsEventORM)
                .filter(OpsEventORM.created_at < cutoff)
                .delete(synchronize_session=False)
            )
            email_events = (
                session.query(EmailEventORM)
                .filter(EmailEventORM.created_at < cutoff)
                .delete(synchronize_session=False)
            )
        return {
            "emails": int(emails or 0),
            "ops_events": int(events or 0),
            "email_events": int(email_events or 0),
        }

    @staticmethod
    def _ops_event_dict(row, *, include_traceback: bool) -> dict:  # noqa: ANN001
        payload = {
            "id": row.id,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "environment": row.environment,
            "release": row.release,
            "request_id": row.request_id,
            "method": row.method,
            "route": row.route,
            "path": row.path,
            "status": row.status,
            "error_type": row.error_type,
            "message": row.message,
            "user_id": row.user_id,
            "fingerprint": row.fingerprint,
        }
        if include_traceback:
            payload["traceback"] = row.traceback
        return payload
