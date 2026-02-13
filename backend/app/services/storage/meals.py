"""Meal tracking storage mixin."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import desc, func

from ...database import MealEmbedding as MealEmbeddingORM
from ...database import MealEntry as MealEntryORM
from ...database import MealItem as MealItemORM
from ..models import MealCalendarEntry, MealEntryMetadata
from ..models import MealEntry as MealEntryDTO
from ..models import MealItem as MealItemDTO


def _meal_item_to_dto(item: MealItemORM) -> MealItemDTO:
    return MealItemDTO(
        id=item.id,
        user_id=item.user_id,
        meal_entry_id=item.meal_entry_id,
        name=item.name,
        portion=item.portion,
        confidence=item.confidence,
        created_at=item.created_at,
    )


def _meal_entry_to_dto(entry: MealEntryORM, items: list[MealItemORM] | None = None) -> MealEntryDTO:
    return MealEntryDTO(
        id=entry.id,
        user_id=entry.user_id,
        meal_type=entry.meal_type,
        meal_date=entry.meal_date.isoformat() if entry.meal_date else None,
        meal_time=entry.meal_time.strftime("%H:%M") if entry.meal_time else None,
        transcription=entry.transcription,
        confidence=entry.confidence,
        transcription_duration=entry.transcription_duration,
        model_version=entry.model_version,
        items=[_meal_item_to_dto(i) for i in (items or [])],
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


class MealStorageMixin:
    """Meal entry, meal item, and calendar operations."""

    def save_meal_entry(
        self,
        user_id: str,
        transcription: str,
        metadata: MealEntryMetadata,
        food_items: list[dict] | None = None,
    ) -> str:
        from datetime import date as dt_date
        from datetime import time as dt_time

        meal_id = str(uuid4())
        now = datetime.utcnow()

        meal_date = dt_date.fromisoformat(metadata.meal_date)

        meal_time = None
        if metadata.meal_time:
            try:
                parts = metadata.meal_time.split(":")
                meal_time = dt_time(int(parts[0]), int(parts[1]))
            except (ValueError, IndexError):
                pass

        db_meal = MealEntryORM(
            id=meal_id,
            user_id=user_id,
            meal_type=metadata.meal_type,
            meal_date=meal_date,
            meal_time=meal_time,
            transcription=transcription,
            confidence=metadata.confidence,
            transcription_duration=metadata.transcription_duration,
            model_version=metadata.model_version,
            created_at=now,
            updated_at=now,
        )

        with self._session_scope() as session:
            session.add(db_meal)

            if food_items:
                for item in food_items:
                    item_id = str(uuid4())
                    db_item = MealItemORM(
                        id=item_id,
                        user_id=user_id,
                        meal_entry_id=meal_id,
                        name=item.get("name", ""),
                        portion=item.get("portion"),
                        confidence=item.get("confidence"),
                        created_at=now,
                    )
                    session.add(db_item)

        return meal_id

    def get_meal_entry(self, user_id: str, meal_id: str) -> MealEntryDTO | None:
        with self._session_scope() as session:
            entry = (
                session.query(MealEntryORM)
                .filter(MealEntryORM.user_id == user_id, MealEntryORM.id == meal_id)
                .one_or_none()
            )
            if not entry:
                return None

            items = (
                session.query(MealItemORM)
                .filter(MealItemORM.meal_entry_id == meal_id)
                .all()
            )
            return _meal_entry_to_dto(entry, items)

    def update_meal_entry(
        self,
        user_id: str,
        meal_id: str,
        meal_type: str | None = None,
        meal_date: str | None = None,
        meal_time: str | None = None,
        transcription: str | None = None,
    ) -> bool:
        from datetime import date as dt_date
        from datetime import time as dt_time

        with self._session_scope() as session:
            entry = (
                session.query(MealEntryORM)
                .filter(MealEntryORM.user_id == user_id, MealEntryORM.id == meal_id)
                .one_or_none()
            )
            if not entry:
                return False

            updated = False
            if meal_type is not None:
                entry.meal_type = meal_type
                updated = True
            if meal_date is not None:
                entry.meal_date = dt_date.fromisoformat(meal_date)
                updated = True
            if meal_time is not None:
                try:
                    parts = meal_time.split(":")
                    entry.meal_time = dt_time(int(parts[0]), int(parts[1]))
                    updated = True
                except (ValueError, IndexError):
                    pass
            if transcription is not None:
                entry.transcription = transcription
                updated = True

            if updated:
                entry.updated_at = datetime.utcnow()
                session.add(entry)

            return updated

    def delete_meal_entry(self, user_id: str, meal_id: str) -> bool:
        with self._session_scope() as session:
            session.query(MealEmbeddingORM).filter(
                MealEmbeddingORM.user_id == user_id,
                MealEmbeddingORM.meal_entry_id == meal_id,
            ).delete(synchronize_session=False)

            session.query(MealItemORM).filter(
                MealItemORM.user_id == user_id,
                MealItemORM.meal_entry_id == meal_id,
            ).delete(synchronize_session=False)

            result = (
                session.query(MealEntryORM)
                .filter(MealEntryORM.user_id == user_id, MealEntryORM.id == meal_id)
                .delete(synchronize_session=False)
            )
            return result > 0

    def list_meals_by_date_range(
        self,
        user_id: str,
        start_date: str,
        end_date: str,
        meal_type: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MealEntryDTO]:
        from datetime import date as dt_date

        start = dt_date.fromisoformat(start_date)
        end = dt_date.fromisoformat(end_date)

        with self._session_scope() as session:
            query = (
                session.query(MealEntryORM)
                .filter(
                    MealEntryORM.user_id == user_id,
                    MealEntryORM.meal_date >= start,
                    MealEntryORM.meal_date <= end,
                )
            )
            if meal_type:
                query = query.filter(MealEntryORM.meal_type == meal_type)

            entries = (
                query.order_by(desc(MealEntryORM.meal_date), desc(MealEntryORM.created_at))
                .offset(max(offset, 0))
                .limit(max(limit, 1))
                .all()
            )

            entry_ids = [e.id for e in entries]
            items_map: dict[str, list[MealItemORM]] = {}
            if entry_ids:
                all_items = (
                    session.query(MealItemORM)
                    .filter(MealItemORM.meal_entry_id.in_(entry_ids))
                    .all()
                )
                for item in all_items:
                    items_map.setdefault(item.meal_entry_id, []).append(item)

            return [_meal_entry_to_dto(e, items_map.get(e.id, [])) for e in entries]

    def list_meals_by_date(
        self, user_id: str, date: str
    ) -> list[MealEntryDTO]:
        return self.list_meals_by_date_range(user_id, date, date, limit=50)

    def get_meals_calendar(
        self, user_id: str, year: int, month: int
    ) -> dict[str, list[MealCalendarEntry]]:
        from calendar import monthrange

        first_day = f"{year:04d}-{month:02d}-01"
        last_day_num = monthrange(year, month)[1]
        last_day = f"{year:04d}-{month:02d}-{last_day_num:02d}"

        meals = self.list_meals_by_date_range(user_id, first_day, last_day, limit=500)

        result: dict[str, list[MealCalendarEntry]] = {}
        for meal in meals:
            date_str = meal.meal_date
            if date_str not in result:
                result[date_str] = []
            result[date_str].append(MealCalendarEntry(
                id=meal.id,
                meal_type=meal.meal_type,
                item_count=len(meal.items),
                user_id=meal.user_id,
            ))

        return result

    def add_meal_item(
        self, user_id: str, meal_id: str, name: str, portion: str | None = None
    ) -> MealItemDTO | None:
        entry = self.get_meal_entry(user_id, meal_id)
        if not entry:
            return None

        item_id = str(uuid4())
        now = datetime.utcnow()

        db_item = MealItemORM(
            id=item_id,
            user_id=user_id,
            meal_entry_id=meal_id,
            name=name,
            portion=portion,
            confidence=None,
            created_at=now,
        )

        with self._session_scope() as session:
            session.add(db_item)

        return MealItemDTO(
            id=item_id,
            user_id=user_id,
            meal_entry_id=meal_id,
            name=name,
            portion=portion,
            confidence=None,
            created_at=now,
        )

    def update_meal_item(
        self,
        user_id: str,
        item_id: str,
        name: str | None = None,
        portion: str | None = None,
    ) -> MealItemDTO | None:
        with self._session_scope() as session:
            item = (
                session.query(MealItemORM)
                .filter(MealItemORM.user_id == user_id, MealItemORM.id == item_id)
                .one_or_none()
            )
            if not item:
                return None

            if name is not None:
                item.name = name
            if portion is not None:
                item.portion = portion

            session.add(item)
            return _meal_item_to_dto(item)

    def delete_meal_item(self, user_id: str, item_id: str) -> bool:
        with self._session_scope() as session:
            result = (
                session.query(MealItemORM)
                .filter(MealItemORM.user_id == user_id, MealItemORM.id == item_id)
                .delete(synchronize_session=False)
            )
            return result > 0

    def get_meal_counts(self, user_id: str, year: int, month: int) -> dict:
        """Return meal counts for the given month and for today."""
        from datetime import date as date_type

        today = date_type(year, month, datetime.utcnow().day)
        month_start = date_type(year, month, 1)
        if month == 12:
            next_month_start = date_type(year + 1, 1, 1)
        else:
            next_month_start = date_type(year, month + 1, 1)

        with self._session_scope() as session:
            this_month = int(
                session.query(func.count(MealEntryORM.id))
                .filter(
                    MealEntryORM.user_id == user_id,
                    MealEntryORM.meal_date >= month_start,
                    MealEntryORM.meal_date < next_month_start,
                )
                .scalar() or 0
            )

            today_count = int(
                session.query(func.count(MealEntryORM.id))
                .filter(
                    MealEntryORM.user_id == user_id,
                    MealEntryORM.meal_date == today,
                )
                .scalar() or 0
            )

            return {
                "this_month": this_month,
                "today": today_count,
            }

    # -----------------------------------------------------------------------
    # Multi-user queries (shared calendars)
    # -----------------------------------------------------------------------

    def list_meals_for_users(
        self,
        user_ids: list[str],
        *,
        start_date: str | None = None,
        end_date: str | None = None,
        meal_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[MealEntryDTO]:
        if not user_ids:
            return []
        with self._session_scope() as session:
            query = session.query(MealEntryORM).filter(
                MealEntryORM.user_id.in_(user_ids)
            )
            if start_date:
                query = query.filter(MealEntryORM.meal_date >= start_date)
            if end_date:
                query = query.filter(MealEntryORM.meal_date <= end_date)
            if meal_type:
                query = query.filter(MealEntryORM.meal_type == meal_type)

            meals_orm = (
                query.order_by(desc(MealEntryORM.meal_date), desc(MealEntryORM.meal_time))
                .offset(max(offset, 0))
                .limit(max(limit, 1))
                .all()
            )

            meal_ids = [m.id for m in meals_orm]
            items_by_meal: dict[str, list[MealItemORM]] = {}
            if meal_ids:
                items = session.query(MealItemORM).filter(MealItemORM.meal_entry_id.in_(meal_ids)).all()
                for item in items:
                    items_by_meal.setdefault(item.meal_entry_id, []).append(item)

            return [_meal_entry_to_dto(m, items_by_meal.get(m.id, [])) for m in meals_orm]

    def get_meals_calendar_for_users(
        self,
        user_ids: list[str],
        year: int,
        month: int,
    ) -> dict[str, list[MealCalendarEntry]]:
        if not user_ids:
            return {}
        import calendar as cal_mod

        _, last_day = cal_mod.monthrange(year, month)
        start = f"{year:04d}-{month:02d}-01"
        end = f"{year:04d}-{month:02d}-{last_day:02d}"

        with self._session_scope() as session:
            meals_orm = (
                session.query(MealEntryORM)
                .filter(
                    MealEntryORM.user_id.in_(user_ids),
                    MealEntryORM.meal_date >= start,
                    MealEntryORM.meal_date <= end,
                )
                .order_by(MealEntryORM.meal_date, MealEntryORM.meal_time)
                .all()
            )

            meal_ids = [m.id for m in meals_orm]
            item_counts: dict[str, int] = {}
            if meal_ids:
                items = session.query(MealItemORM).filter(MealItemORM.meal_entry_id.in_(meal_ids)).all()
                for item in items:
                    item_counts[item.meal_entry_id] = item_counts.get(item.meal_entry_id, 0) + 1

            result: dict[str, list[MealCalendarEntry]] = {}
            for m in meals_orm:
                date_str = str(m.meal_date)
                result.setdefault(date_str, []).append(MealCalendarEntry(
                    id=m.id,
                    meal_type=m.meal_type,
                    item_count=item_counts.get(m.id, 0),
                    user_id=m.user_id,
                ))
            return result
