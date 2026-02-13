"""Settings, digests, ask history, and feedback storage mixin."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import desc

from ...database import AskHistory as AskHistoryORM
from ...database import Digest as DigestORM
from ...database import Feedback as FeedbackORM
from ...database import UserSettings as UserSettingsORM
from ..models import AskHistory as AskHistoryDTO
from ..models import Digest as DigestDTO
from ..models import FeedbackResponse as FeedbackDTO
from ..models import UserSettings as UserSettingsDTO


def _user_settings_to_dto(settings: UserSettingsORM) -> UserSettingsDTO:
    return UserSettingsDTO(
        id=settings.id,
        user_id=settings.user_id,
        auto_accept_todos=settings.auto_accept_todos,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )


class SettingsStorageMixin:
    """User settings, digests, ask history, and feedback operations."""

    # -----------------------------------------------------------------------
    # User settings
    # -----------------------------------------------------------------------

    def get_user_settings(self, user_id: str) -> UserSettingsDTO:
        with self._session_scope() as session:
            settings = (
                session.query(UserSettingsORM)
                .filter(UserSettingsORM.user_id == user_id)
                .one_or_none()
            )
            if settings:
                return _user_settings_to_dto(settings)

            settings_id = str(uuid4())
            now = datetime.utcnow()
            new_settings = UserSettingsORM(
                id=settings_id,
                user_id=user_id,
                auto_accept_todos=False,
                created_at=now,
                updated_at=now,
            )
            session.add(new_settings)
            return _user_settings_to_dto(new_settings)

    def update_user_settings(
        self,
        user_id: str,
        *,
        auto_accept_todos: bool | None = None,
    ) -> UserSettingsDTO:
        with self._session_scope() as session:
            settings = (
                session.query(UserSettingsORM)
                .filter(UserSettingsORM.user_id == user_id)
                .one_or_none()
            )
            now = datetime.utcnow()

            if not settings:
                settings = UserSettingsORM(
                    id=str(uuid4()),
                    user_id=user_id,
                    auto_accept_todos=auto_accept_todos if auto_accept_todos is not None else False,
                    created_at=now,
                    updated_at=now,
                )
                session.add(settings)
            else:
                if auto_accept_todos is not None:
                    settings.auto_accept_todos = auto_accept_todos
                settings.updated_at = now
                session.add(settings)

            return _user_settings_to_dto(settings)

    # -----------------------------------------------------------------------
    # Digests
    # -----------------------------------------------------------------------

    def save_digest(self, user_id: str, content: str) -> str:
        digest_id = str(uuid4())
        now = datetime.utcnow()
        db_digest = DigestORM(
            id=digest_id,
            user_id=user_id,
            content=content,
            created_at=now,
        )

        with self._session_scope() as session:
            session.add(db_digest)

        return digest_id

    def list_digests(self, user_id: str, limit: int = 50, offset: int = 0) -> list[DigestDTO]:
        with self._session_scope() as session:
            digests = (
                session.query(DigestORM)
                .filter(DigestORM.user_id == user_id)
                .order_by(desc(DigestORM.created_at))
                .offset(max(offset, 0))
                .limit(max(1, limit))
                .all()
            )
            return [
                DigestDTO(
                    id=d.id,
                    user_id=d.user_id,
                    content=d.content,
                    created_at=d.created_at,
                )
                for d in digests
            ]

    def get_digest(self, user_id: str, digest_id: str) -> DigestDTO | None:
        with self._session_scope() as session:
            d = (
                session.query(DigestORM)
                .filter(DigestORM.user_id == user_id, DigestORM.id == digest_id)
                .one_or_none()
            )
            if not d:
                return None
            return DigestDTO(id=d.id, user_id=d.user_id, content=d.content, created_at=d.created_at)

    def delete_digest(self, user_id: str, digest_id: str) -> bool:
        with self._session_scope() as session:
            result = (
                session.query(DigestORM)
                .filter(DigestORM.user_id == user_id, DigestORM.id == digest_id)
                .delete(synchronize_session=False)
            )
            return result > 0

    # -----------------------------------------------------------------------
    # Ask history
    # -----------------------------------------------------------------------

    def save_ask_history(
        self,
        user_id: str,
        query: str,
        query_plan_json: str,
        answer_markdown: str,
        cited_note_ids_json: str,
        source_scores_json: str | None = None,
    ) -> str:
        ask_id = str(uuid4())
        now = datetime.utcnow()
        row = AskHistoryORM(
            id=ask_id,
            user_id=user_id,
            query=query,
            query_plan_json=query_plan_json,
            answer_markdown=answer_markdown,
            cited_note_ids_json=cited_note_ids_json,
            source_scores_json=source_scores_json,
            created_at=now,
        )
        with self._session_scope() as session:
            session.add(row)
        return ask_id

    def list_ask_history(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[AskHistoryDTO]:
        with self._session_scope() as session:
            rows = (
                session.query(AskHistoryORM)
                .filter(AskHistoryORM.user_id == user_id)
                .order_by(desc(AskHistoryORM.created_at))
                .offset(max(offset, 0))
                .limit(max(1, limit))
                .all()
            )
            return [
                AskHistoryDTO(
                    id=r.id,
                    user_id=r.user_id,
                    query=r.query,
                    query_plan_json=r.query_plan_json,
                    answer_markdown=r.answer_markdown,
                    cited_note_ids_json=r.cited_note_ids_json,
                    source_scores_json=r.source_scores_json,
                    created_at=r.created_at,
                )
                for r in rows
            ]

    def get_ask_history(self, user_id: str, ask_id: str) -> AskHistoryDTO | None:
        with self._session_scope() as session:
            r = (
                session.query(AskHistoryORM)
                .filter(AskHistoryORM.user_id == user_id, AskHistoryORM.id == ask_id)
                .one_or_none()
            )
            if not r:
                return None
            return AskHistoryDTO(
                id=r.id,
                user_id=r.user_id,
                query=r.query,
                query_plan_json=r.query_plan_json,
                answer_markdown=r.answer_markdown,
                cited_note_ids_json=r.cited_note_ids_json,
                source_scores_json=r.source_scores_json,
                created_at=r.created_at,
            )

    def delete_ask_history(self, user_id: str, ask_id: str) -> bool:
        with self._session_scope() as session:
            result = (
                session.query(AskHistoryORM)
                .filter(AskHistoryORM.user_id == user_id, AskHistoryORM.id == ask_id)
                .delete(synchronize_session=False)
            )
            return result > 0

    # -----------------------------------------------------------------------
    # Feedback
    # -----------------------------------------------------------------------

    def create_feedback(
        self,
        user_id: str,
        feedback_type: str,
        title: str,
        description: str | None = None,
        rating: int | None = None,
    ) -> FeedbackDTO:
        feedback_id = str(uuid4())
        now = datetime.utcnow()

        feedback = FeedbackORM(
            id=feedback_id,
            user_id=user_id,
            feedback_type=feedback_type,
            title=title,
            description=description,
            rating=rating,
            email_sent=False,
            created_at=now,
        )

        with self._session_scope() as session:
            session.add(feedback)

        return FeedbackDTO(
            id=feedback_id,
            user_id=user_id,
            feedback_type=feedback_type,
            title=title,
            description=description,
            rating=rating,
            created_at=now,
        )

    def list_feedback(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[FeedbackDTO]:
        with self._session_scope() as session:
            rows = (
                session.query(FeedbackORM)
                .filter(FeedbackORM.user_id == user_id)
                .order_by(desc(FeedbackORM.created_at))
                .offset(max(offset, 0))
                .limit(max(limit, 1))
                .all()
            )
            return [
                FeedbackDTO(
                    id=f.id,
                    user_id=f.user_id,
                    feedback_type=f.feedback_type,
                    title=f.title,
                    description=f.description,
                    rating=f.rating,
                    created_at=f.created_at,
                )
                for f in rows
            ]

    def mark_feedback_email_sent(self, feedback_id: str) -> bool:
        with self._session_scope() as session:
            feedback = (
                session.query(FeedbackORM)
                .filter(FeedbackORM.id == feedback_id)
                .one_or_none()
            )
            if not feedback:
                return False
            feedback.email_sent = True
            session.add(feedback)
            return True
