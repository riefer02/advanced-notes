"""Todo storage mixin."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import desc, func

from ...database import Todo as TodoORM
from ..models import Todo as TodoDTO


def _todo_to_dto(todo: TodoORM) -> TodoDTO:
    return TodoDTO(
        id=todo.id,
        user_id=todo.user_id,
        note_id=todo.note_id,
        title=todo.title,
        description=todo.description,
        status=todo.status,
        confidence=todo.confidence,
        extraction_context=todo.extraction_context,
        created_at=todo.created_at,
        updated_at=todo.updated_at,
        completed_at=todo.completed_at,
    )


class TodoStorageMixin:
    """Todo CRUD operations."""

    def create_todo(
        self,
        user_id: str,
        title: str,
        *,
        note_id: str | None = None,
        description: str | None = None,
        status: str = "suggested",
        confidence: float | None = None,
        extraction_context: str | None = None,
    ) -> TodoDTO:
        todo_id = str(uuid4())
        now = datetime.utcnow()

        todo = TodoORM(
            id=todo_id,
            user_id=user_id,
            note_id=note_id,
            title=title,
            description=description,
            status=status,
            confidence=confidence,
            extraction_context=extraction_context,
            created_at=now,
            updated_at=now,
            completed_at=None,
        )

        with self._session_scope() as session:
            session.add(todo)

        return TodoDTO(
            id=todo_id,
            user_id=user_id,
            note_id=note_id,
            title=title,
            description=description,
            status=status,
            confidence=confidence,
            extraction_context=extraction_context,
            created_at=now,
            updated_at=now,
            completed_at=None,
        )

    def get_todo(self, user_id: str, todo_id: str) -> TodoDTO | None:
        with self._session_scope() as session:
            todo = (
                session.query(TodoORM)
                .filter(TodoORM.user_id == user_id, TodoORM.id == todo_id)
                .one_or_none()
            )
            return _todo_to_dto(todo) if todo else None

    def list_todos(
        self,
        user_id: str,
        *,
        status: str | None = None,
        note_id: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[TodoDTO]:
        with self._session_scope() as session:
            query = session.query(TodoORM).filter(TodoORM.user_id == user_id)

            if status:
                query = query.filter(TodoORM.status == status)
            if note_id:
                query = query.filter(TodoORM.note_id == note_id)

            todos = (
                query.order_by(desc(TodoORM.created_at))
                .offset(max(offset, 0))
                .limit(max(limit, 1))
                .all()
            )
            return [_todo_to_dto(t) for t in todos]

    def list_todos_for_note(self, user_id: str, note_id: str) -> list[TodoDTO]:
        with self._session_scope() as session:
            todos = (
                session.query(TodoORM)
                .filter(TodoORM.user_id == user_id, TodoORM.note_id == note_id)
                .order_by(desc(TodoORM.created_at))
                .all()
            )
            return [_todo_to_dto(t) for t in todos]

    def update_todo(
        self,
        user_id: str,
        todo_id: str,
        *,
        title: str | None = None,
        description: str | None = None,
    ) -> TodoDTO | None:
        with self._session_scope() as session:
            todo = (
                session.query(TodoORM)
                .filter(TodoORM.user_id == user_id, TodoORM.id == todo_id)
                .one_or_none()
            )
            if not todo:
                return None

            if title is not None:
                todo.title = title
            if description is not None:
                todo.description = description
            todo.updated_at = datetime.utcnow()
            session.add(todo)
            return _todo_to_dto(todo)

    def delete_todo(self, user_id: str, todo_id: str) -> bool:
        with self._session_scope() as session:
            result = (
                session.query(TodoORM)
                .filter(TodoORM.user_id == user_id, TodoORM.id == todo_id)
                .delete(synchronize_session=False)
            )
            return result > 0

    def accept_todo(self, user_id: str, todo_id: str) -> TodoDTO | None:
        with self._session_scope() as session:
            todo = (
                session.query(TodoORM)
                .filter(TodoORM.user_id == user_id, TodoORM.id == todo_id)
                .one_or_none()
            )
            if not todo:
                return None

            todo.status = "accepted"
            todo.updated_at = datetime.utcnow()
            session.add(todo)
            return _todo_to_dto(todo)

    def complete_todo(self, user_id: str, todo_id: str) -> TodoDTO | None:
        with self._session_scope() as session:
            todo = (
                session.query(TodoORM)
                .filter(TodoORM.user_id == user_id, TodoORM.id == todo_id)
                .one_or_none()
            )
            if not todo:
                return None

            now = datetime.utcnow()
            todo.status = "completed"
            todo.completed_at = now
            todo.updated_at = now
            session.add(todo)
            return _todo_to_dto(todo)

    def accept_todos_bulk(self, user_id: str, todo_ids: list[str]) -> int:
        if not todo_ids:
            return 0

        with self._session_scope() as session:
            now = datetime.utcnow()
            result = (
                session.query(TodoORM)
                .filter(
                    TodoORM.user_id == user_id,
                    TodoORM.id.in_(todo_ids),
                    TodoORM.status == "suggested",
                )
                .update(
                    {"status": "accepted", "updated_at": now},
                    synchronize_session=False,
                )
            )
            return int(result or 0)

    def dismiss_todo(self, user_id: str, todo_id: str) -> bool:
        return self.delete_todo(user_id, todo_id)

    def get_todo_counts(self, user_id: str) -> dict:
        """Return grouped counts of todos by status."""
        with self._session_scope() as session:
            rows = (
                session.query(TodoORM.status, func.count(TodoORM.id))
                .filter(TodoORM.user_id == user_id)
                .group_by(TodoORM.status)
                .all()
            )
            counts = dict(rows)
            return {
                "suggested": counts.get("suggested", 0),
                "accepted": counts.get("accepted", 0),
                "completed": counts.get("completed", 0),
            }
