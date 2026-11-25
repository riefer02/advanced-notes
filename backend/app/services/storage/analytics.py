"""Product analytics storage: durable, user-scoped event counts.

The table intentionally stores only an event name, a small JSON bag of
IDs/enums/counts, and a timestamp. No IP, user agent, referrer, or free text.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import desc, func

from ...database import AnalyticsEvent as AnalyticsEventORM


class AnalyticsStorageMixin:
    """Batch ingestion and aggregate reads for self-hosted product analytics."""

    def record_analytics_events(
        self,
        user_id: str,
        events: list[dict[str, Any]],
    ) -> int:
        """Insert a validated batch of events for one user.

        Each event is ``{"name": str, "properties": dict | None}``. Properties
        are re-serialized here so callers cannot smuggle in non-JSON values.
        """
        now = datetime.now(UTC).replace(tzinfo=None)
        rows = [
            AnalyticsEventORM(
                id=str(uuid4()),
                user_id=user_id,
                name=str(event["name"])[:64],
                properties_json=(
                    json.dumps(event["properties"], separators=(",", ":"))
                    if event.get("properties") is not None
                    else None
                ),
                created_at=now,
            )
            for event in events
        ]
        if not rows:
            return 0
        with self._session_scope() as session:
            session.add_all(rows)
        return len(rows)

    def get_analytics_summary(self, user_id: str, since: datetime) -> dict[str, Any]:
        """User-scoped totals by event name over the window starting at ``since``."""
        count_col = func.count(AnalyticsEventORM.id)
        with self._session_scope() as session:
            rows = (
                session.query(AnalyticsEventORM.name, count_col)
                .filter(
                    AnalyticsEventORM.user_id == user_id,
                    AnalyticsEventORM.created_at >= since,
                )
                .group_by(AnalyticsEventORM.name)
                .order_by(desc(count_col), AnalyticsEventORM.name)
                .all()
            )
        by_name = [{"name": row[0], "count": int(row[1] or 0)} for row in rows]
        return {
            "total_events": sum(item["count"] for item in by_name),
            "by_name": by_name,
        }

    def get_admin_analytics_summary(self, since: datetime, days: int) -> dict[str, Any]:
        """Aggregate counts across all users.

        Returns totals by event name, per-day counts, and a distinct-user count.
        It never returns a per-user breakdown or event properties, so the admin
        view cannot be used to inspect an individual's activity.
        """
        count_col = func.count(AnalyticsEventORM.id)
        start_day = since.date()

        with self._session_scope() as session:
            total_events = int(
                session.query(count_col)
                .filter(AnalyticsEventORM.created_at >= since)
                .scalar()
                or 0
            )
            unique_users = int(
                session.query(func.count(func.distinct(AnalyticsEventORM.user_id)))
                .filter(AnalyticsEventORM.created_at >= since)
                .scalar()
                or 0
            )
            name_rows = (
                session.query(AnalyticsEventORM.name, count_col)
                .filter(AnalyticsEventORM.created_at >= since)
                .group_by(AnalyticsEventORM.name)
                .order_by(desc(count_col), AnalyticsEventORM.name)
                .all()
            )
            daily_rows = (
                session.query(
                    func.date(AnalyticsEventORM.created_at),
                    count_col,
                )
                .filter(AnalyticsEventORM.created_at >= since)
                .group_by(func.date(AnalyticsEventORM.created_at))
                .all()
            )

        daily_lookup: dict[str, int] = {}
        for raw_day, count in daily_rows:
            key = _normalize_day(raw_day)
            if key is not None:
                daily_lookup[key] = int(count or 0)

        daily = []
        for offset in range(max(days, 0)):
            day = (start_day + timedelta(days=offset)).isoformat()
            daily.append({"date": day, "count": daily_lookup.get(day, 0)})

        return {
            "total_events": total_events,
            "unique_users": unique_users,
            "by_name": [
                {"name": row[0], "count": int(row[1] or 0)} for row in name_rows
            ],
            "daily": daily,
        }


def _normalize_day(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        return value[:10]
    return None
