"""Note storage mixin: CRUD, folders, tags, search."""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import Text, case, cast, desc, func, or_, text
from sqlalchemy.dialects.postgresql import JSONB

from ...database import Note as NoteORM
from ...database import NoteEmbedding as NoteEmbeddingORM
from ...database import NoteRevision as NoteRevisionORM
from ..models import FolderNode, FolderStats, NoteMetadata, SearchResult
from ..models import Note as NoteDTO
from ..models import NoteRevision as NoteRevisionDTO
from .engine import _coerce_datetime, _deserialize_tags, _serialize_tags

NOTE_VIEW_ACTIVE = "active"
NOTE_VIEW_ARCHIVED = "archived"
NOTE_VIEW_TRASH = "trash"
NOTE_VIEWS = (NOTE_VIEW_ACTIVE, NOTE_VIEW_ARCHIVED, NOTE_VIEW_TRASH)


def _visibility_clauses(view: str = NOTE_VIEW_ACTIVE) -> list:
    """Filter clauses for the three user-facing note views."""
    if view == NOTE_VIEW_TRASH:
        return [NoteORM.deleted_at.isnot(None)]
    if view == NOTE_VIEW_ARCHIVED:
        return [
            NoteORM.deleted_at.is_(None),
            NoteORM.archived_at.isnot(None),
        ]
    return [
        NoteORM.deleted_at.is_(None),
        NoteORM.archived_at.is_(None),
    ]


def _mapping_to_note(row: Mapping[str, Any]) -> NoteDTO:
    return NoteDTO(
        id=row["id"],
        user_id=row["user_id"],
        title=row["title"],
        summary=row.get("summary"),
        content=row["content"],
        folder_path=row["folder_path"],
        tags=_deserialize_tags(row.get("tags")),
        created_at=_coerce_datetime(row.get("created_at")) or datetime.utcnow(),
        updated_at=_coerce_datetime(row.get("updated_at")) or datetime.utcnow(),
        word_count=row.get("word_count") or 0,
        confidence=row.get("confidence"),
        transcription_duration=row.get("transcription_duration"),
        model_version=row.get("model_version"),
        source=row.get("source") or "audio",
        language=row.get("language"),
        version=row.get("version") or 1,
        pinned_at=_coerce_datetime(row.get("pinned_at")),
        archived_at=_coerce_datetime(row.get("archived_at")),
        deleted_at=_coerce_datetime(row.get("deleted_at")),
    )


def _note_to_dto(note: NoteORM) -> NoteDTO:
    return NoteDTO(
        id=note.id,
        user_id=note.user_id,
        title=note.title,
        summary=note.summary,
        content=note.content,
        folder_path=note.folder_path,
        tags=_deserialize_tags(note.tags),
        created_at=note.created_at,
        updated_at=note.updated_at,
        word_count=note.word_count or 0,
        confidence=note.confidence,
        transcription_duration=note.transcription_duration,
        model_version=note.model_version,
        source=note.source or "audio",
        language=note.language,
        version=note.version or 1,
        pinned_at=note.pinned_at,
        archived_at=note.archived_at,
        deleted_at=note.deleted_at,
    )


def _build_folder_tree(rows: list[Mapping[str, Any]]) -> FolderNode:
    root = FolderNode(name="", path="", note_count=0)
    folder_map: dict[str, FolderNode] = {"": root}

    for row in rows:
        path = row[0]
        count = row[1]
        if not path:
            continue
        parts = path.split("/")
        current_path = ""
        parent = root

        for part in parts:
            current_path = f"{current_path}/{part}".strip("/")
            if current_path not in folder_map:
                folder = FolderNode(name=part, path=current_path, note_count=0)
                folder_map[current_path] = folder
                parent.subfolders.append(folder)
            parent = folder_map[current_path]
        parent.note_count = count

    return root


class NoteStorageMixin:
    """Note CRUD, folders, tags, and search operations."""

    def save_note(self, user_id: str, content: str, metadata: NoteMetadata) -> str:
        note_id = str(uuid4())
        now = datetime.utcnow()
        db_note = NoteORM(
            id=note_id,
            user_id=user_id,
            title=metadata.title,
            summary=metadata.summary,
            content=content,
            folder_path=metadata.folder_path,
            tags=_serialize_tags(metadata.tags),
            created_at=now,
            updated_at=now,
            word_count=len(content.split()),
            confidence=metadata.confidence,
            transcription_duration=metadata.transcription_duration,
            model_version=metadata.model_version,
            source=metadata.source or "audio",
            language=metadata.language,
            version=1,
        )

        with self._session_scope() as session:
            session.add(db_note)

        return note_id

    def get_note(self, user_id: str, note_id: str) -> NoteDTO | None:
        # Direct access returns archived and trashed notes so the owner can
        # open and restore them from the Archived/Trash views.
        with self._session_scope() as session:
            note = (
                session.query(NoteORM)
                .filter(NoteORM.id == note_id, NoteORM.user_id == user_id)
                .one_or_none()
            )
            return _note_to_dto(note) if note else None

    def _snapshot_revision(self, session, note: NoteORM, *, edit_source: str = "user") -> None:
        """Store the current note state before it is replaced."""
        session.add(
            NoteRevisionORM(
                id=str(uuid4()),
                note_id=note.id,
                user_id=note.user_id,
                version=max(1, note.version or 1),
                title=note.title,
                summary=note.summary,
                content=note.content,
                folder_path=note.folder_path,
                tags=note.tags,
                word_count=note.word_count or 0,
                edit_source=edit_source,
                created_at=datetime.utcnow(),
            )
        )

    def update_note(
        self,
        user_id: str,
        note_id: str,
        content: str | None = None,
        metadata: NoteMetadata | None = None,
    ) -> bool:
        with self._session_scope() as session:
            note = (
                session.query(NoteORM)
                .filter(
                    NoteORM.id == note_id,
                    NoteORM.user_id == user_id,
                    NoteORM.deleted_at.is_(None),
                )
                .one_or_none()
            )

            if not note:
                return False

            updated = content is not None or metadata is not None
            if not updated:
                return False

            # A revision is the state being replaced, not the new state.
            self._snapshot_revision(session, note)

            if content is not None:
                note.content = content
                note.word_count = len(content.split())

            if metadata:
                note.title = metadata.title or note.title
                if metadata.summary is not None:
                    note.summary = metadata.summary
                note.folder_path = metadata.folder_path or note.folder_path
                note.tags = _serialize_tags(metadata.tags)
                note.confidence = (
                    metadata.confidence
                    if metadata.confidence is not None
                    else note.confidence
                )
                note.transcription_duration = (
                    metadata.transcription_duration
                    if metadata.transcription_duration is not None
                    else note.transcription_duration
                )
                note.model_version = metadata.model_version or note.model_version
                if metadata.source:
                    note.source = metadata.source
                if metadata.language is not None:
                    note.language = metadata.language

            note.version = max(1, note.version or 1) + 1
            note.updated_at = datetime.utcnow()
            session.add(note)
            return True

    def delete_note(self, user_id: str, note_id: str) -> bool:
        """Move a note to Trash. Audio and embeddings are kept for restore."""
        with self._session_scope() as session:
            note = (
                session.query(NoteORM)
                .filter(
                    NoteORM.id == note_id,
                    NoteORM.user_id == user_id,
                    NoteORM.deleted_at.is_(None),
                )
                .one_or_none()
            )
            if not note:
                return False
            note.deleted_at = datetime.utcnow()
            note.updated_at = datetime.utcnow()
            session.add(note)
            return True

    def restore_deleted_note(self, user_id: str, note_id: str) -> bool:
        """Restore a trashed note to the active list."""
        with self._session_scope() as session:
            note = (
                session.query(NoteORM)
                .filter(
                    NoteORM.id == note_id,
                    NoteORM.user_id == user_id,
                    NoteORM.deleted_at.isnot(None),
                )
                .one_or_none()
            )
            if not note:
                return False
            note.deleted_at = None
            note.archived_at = None
            note.updated_at = datetime.utcnow()
            session.add(note)
            return True

    def purge_note(self, user_id: str, note_id: str) -> bool:
        """Permanently delete a note, its vectors, and its revisions."""
        with self._session_scope() as session:
            note = (
                session.query(NoteORM)
                .filter(NoteORM.id == note_id, NoteORM.user_id == user_id)
                .one_or_none()
            )
            if not note:
                return False
            session.query(NoteEmbeddingORM).filter(
                NoteEmbeddingORM.user_id == user_id,
                NoteEmbeddingORM.note_id == note_id,
            ).delete(synchronize_session=False)
            session.query(NoteRevisionORM).filter(
                NoteRevisionORM.user_id == user_id,
                NoteRevisionORM.note_id == note_id,
            ).delete(synchronize_session=False)
            session.delete(note)
            return True

    def set_note_pinned(self, user_id: str, note_id: str, pinned: bool) -> bool:
        with self._session_scope() as session:
            note = (
                session.query(NoteORM)
                .filter(
                    NoteORM.id == note_id,
                    NoteORM.user_id == user_id,
                    NoteORM.deleted_at.is_(None),
                )
                .one_or_none()
            )
            if not note:
                return False
            note.pinned_at = datetime.utcnow() if pinned else None
            session.add(note)
            return True

    def set_note_archived(self, user_id: str, note_id: str, archived: bool) -> bool:
        with self._session_scope() as session:
            note = (
                session.query(NoteORM)
                .filter(
                    NoteORM.id == note_id,
                    NoteORM.user_id == user_id,
                    NoteORM.deleted_at.is_(None),
                )
                .one_or_none()
            )
            if not note:
                return False
            note.archived_at = datetime.utcnow() if archived else None
            if archived:
                note.pinned_at = None
            note.updated_at = datetime.utcnow()
            session.add(note)
            return True

    def list_note_revisions(
        self,
        user_id: str,
        note_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[NoteRevisionDTO]:
        with self._session_scope() as session:
            rows = (
                session.query(NoteRevisionORM)
                .filter(
                    NoteRevisionORM.user_id == user_id,
                    NoteRevisionORM.note_id == note_id,
                )
                .order_by(desc(NoteRevisionORM.version))
                .offset(max(offset, 0))
                .limit(max(limit, 1))
                .all()
            )
            return [
                NoteRevisionDTO(
                    id=row.id,
                    note_id=row.note_id,
                    user_id=row.user_id,
                    version=row.version,
                    title=row.title,
                    summary=row.summary,
                    content=row.content,
                    folder_path=row.folder_path,
                    tags=_deserialize_tags(row.tags),
                    word_count=row.word_count or 0,
                    edit_source=row.edit_source or "user",
                    created_at=_coerce_datetime(row.created_at) or datetime.utcnow(),
                )
                for row in rows
            ]

    def restore_note_revision(self, user_id: str, note_id: str, version: int) -> bool:
        with self._session_scope() as session:
            note = (
                session.query(NoteORM)
                .filter(
                    NoteORM.id == note_id,
                    NoteORM.user_id == user_id,
                    NoteORM.deleted_at.is_(None),
                )
                .one_or_none()
            )
            if not note:
                return False

            revision = (
                session.query(NoteRevisionORM)
                .filter(
                    NoteRevisionORM.note_id == note_id,
                    NoteRevisionORM.user_id == user_id,
                    NoteRevisionORM.version == version,
                )
                .one_or_none()
            )
            if not revision:
                return False

            self._snapshot_revision(session, note, edit_source="restore")

            note.title = revision.title
            note.summary = revision.summary
            note.content = revision.content
            note.folder_path = revision.folder_path
            note.tags = revision.tags
            note.word_count = revision.word_count or len(revision.content.split())
            note.version = max(1, note.version or 1) + 1
            note.updated_at = datetime.utcnow()
            session.add(note)
            return True

    def get_recent_notes(self, user_id: str, limit: int = 10) -> list[NoteDTO]:
        with self._session_scope() as session:
            notes = (
                session.query(NoteORM)
                .filter(NoteORM.user_id == user_id, *_visibility_clauses())
                .order_by(desc(NoteORM.updated_at))
                .limit(limit)
                .all()
            )
            return [_note_to_dto(note) for note in notes]

    def list_notes(
        self,
        user_id: str,
        folder: str | None = None,
        limit: int = 50,
        offset: int = 0,
        order_by: str = "updated_at",
        view: str = NOTE_VIEW_ACTIVE,
    ) -> list[NoteDTO]:
        if view not in NOTE_VIEWS:
            view = NOTE_VIEW_ACTIVE
        order_map = {
            "created_at": NoteORM.created_at,
            "updated_at": NoteORM.updated_at,
            "title": NoteORM.title,
        }
        order_column = order_map.get(order_by, NoteORM.updated_at)

        with self._session_scope() as session:
            query = session.query(NoteORM).filter(
                NoteORM.user_id == user_id, *_visibility_clauses(view)
            )

            if folder:
                query = query.filter(self._folder_filter_clause(folder))

            if view == NOTE_VIEW_ACTIVE:
                # Pinned notes first, then most recently updated.
                pinned_rank = case((NoteORM.pinned_at.is_(None), 1), else_=0)
                query = query.order_by(
                    pinned_rank,
                    desc(NoteORM.pinned_at),
                    desc(order_column),
                )
            else:
                query = query.order_by(desc(order_column))

            notes = query.offset(max(offset, 0)).limit(max(limit, 1)).all()

            return [_note_to_dto(note) for note in notes]

    def search_notes(self, user_id: str, query: str, limit: int = 50) -> list[SearchResult]:
        if not query or not query.strip():
            return []

        if self.dialect == "sqlite":
            return self._search_notes_sqlite(user_id, query, limit)
        return self._search_notes_postgres(user_id, query, limit)

    def get_folder_tree(self, user_id: str) -> FolderNode:
        with self._session_scope() as session:
            rows = (
                session.query(NoteORM.folder_path, func.count(NoteORM.id))
                .filter(NoteORM.user_id == user_id, *_visibility_clauses())
                .group_by(NoteORM.folder_path)
                .order_by(NoteORM.folder_path)
                .all()
            )
        return _build_folder_tree(rows)

    def get_all_tags(self, user_id: str) -> list[str]:
        with self._session_scope() as session:
            rows = (
                session.query(NoteORM.tags)
                .filter(
                    NoteORM.user_id == user_id,
                    NoteORM.tags.isnot(None),
                    *_visibility_clauses(),
                )
                .all()
            )

        tags: set[str] = set()
        for (value,) in rows:
            tags.update(_deserialize_tags(value))

        return sorted(tags)

    def get_notes_by_tag(self, user_id: str, tag: str, limit: int = 50) -> list[NoteDTO]:
        with self._session_scope() as session:
            query = session.query(NoteORM).filter(
                NoteORM.user_id == user_id, *_visibility_clauses()
            )

            if self.dialect == "postgresql":
                contains = cast(NoteORM.tags, JSONB).op("@>")(json.dumps([tag]))
                query = query.filter(contains)
            else:
                query = query.filter(NoteORM.tags.like(f'%"{tag}"%'))

            notes = query.order_by(NoteORM.updated_at.desc()).limit(limit).all()
            return [_note_to_dto(note) for note in notes]

    def get_note_count(
        self,
        user_id: str,
        folder: str | None = None,
        view: str = NOTE_VIEW_ACTIVE,
    ) -> int:
        if view not in NOTE_VIEWS:
            view = NOTE_VIEW_ACTIVE
        with self._session_scope() as session:
            query = session.query(func.count(NoteORM.id)).filter(
                NoteORM.user_id == user_id, *_visibility_clauses(view)
            )
            if folder:
                query = query.filter(self._folder_filter_clause(folder))
            return int(query.scalar() or 0)

    def get_folder_stats(self, user_id: str, folder: str) -> FolderStats | None:
        with self._session_scope() as session:
            base_query = session.query(
                func.count(NoteORM.id),
                func.sum(NoteORM.transcription_duration),
                func.avg(NoteORM.confidence),
            ).filter(
                NoteORM.user_id == user_id,
                self._folder_filter_clause(folder),
                *_visibility_clauses(),
            )

            count, total_duration, avg_confidence = base_query.one()

            if count == 0:
                return None

            tag_rows = (
                session.query(NoteORM.tags)
                .filter(
                    NoteORM.user_id == user_id,
                    NoteORM.tags.isnot(None),
                    self._folder_filter_clause(folder),
                    *_visibility_clauses(),
                )
                .all()
            )

        tag_counts: dict[str, int] = {}
        for (value,) in tag_rows:
            for tag in _deserialize_tags(value):
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

        most_common = sorted(tag_counts.items(), key=lambda item: item[1], reverse=True)[:5]
        top_tags = [tag for tag, _ in most_common]

        return FolderStats(
            path=folder,
            note_count=count,
            total_duration=float(total_duration or 0.0),
            avg_confidence=avg_confidence,
            most_common_tags=top_tags,
        )

    def get_notes_by_ids(self, user_id: str, note_ids: list[str]) -> list[NoteDTO]:
        if not note_ids:
            return []
        with self._session_scope() as session:
            notes = (
                session.query(NoteORM)
                .filter(
                    NoteORM.user_id == user_id,
                    NoteORM.id.in_(note_ids),
                    *_visibility_clauses(),
                )
                .all()
            )
            dto_by_id = {n.id: _note_to_dto(n) for n in notes}
        return [dto_by_id[nid] for nid in note_ids if nid in dto_by_id]

    def _folder_filter_clause(self, folder: str):
        like_pattern = f"{folder}/%"
        return or_(NoteORM.folder_path == folder, NoteORM.folder_path.like(like_pattern))

    def _search_notes_sqlite(self, user_id: str, query: str, limit: int) -> list[SearchResult]:
        fts_table = getattr(self, "sqlite_fts_table", "notes_fts")
        sql = text(
            f"""
            SELECT
                n.id,
                n.user_id,
                n.title,
                n.summary,
                n.content,
                n.folder_path,
                n.tags,
                n.created_at,
                n.updated_at,
                n.word_count,
                n.confidence,
                n.transcription_duration,
                n.model_version,
                n.source,
                n.language,
                n.version,
                n.pinned_at,
                n.archived_at,
                n.deleted_at,
                {fts_table}.rank AS rank,
                snippet({fts_table}, 2, '<mark>', '</mark>', '...', 50) AS snippet
            FROM {fts_table}
            JOIN notes n ON {fts_table}.note_id = n.id
            WHERE n.user_id = :user_id
              AND n.deleted_at IS NULL
              AND n.archived_at IS NULL
              AND {fts_table} MATCH :match_query
            ORDER BY rank
            LIMIT :limit
            """
        )

        with self._session_scope() as session:
            rows = (
                session.execute(
                    sql,
                    {
                        "user_id": user_id,
                        "match_query": query,
                        "limit": max(limit, 1),
                    },
                )
                .mappings()
                .all()
            )

        results: list[SearchResult] = []
        for row in rows:
            note = _mapping_to_note(row)
            rank_value = abs(row.get("rank", 0.0)) if row.get("rank") is not None else 0.0
            results.append(
                SearchResult(
                    note=note,
                    rank=rank_value,
                    snippet=row.get("snippet") or "",
                )
            )
        return results

    def _search_notes_postgres(self, user_id: str, query: str, limit: int) -> list[SearchResult]:
        ts_query = func.plainto_tsquery("english", query)

        title_vector = func.setweight(func.to_tsvector("english", func.coalesce(NoteORM.title, "")), "A")
        content_vector = func.setweight(func.to_tsvector("english", func.coalesce(NoteORM.content, "")), "B")
        tags_vector = func.setweight(
            func.to_tsvector("english", func.coalesce(cast(NoteORM.tags, Text), "")),
            "C",
        )
        search_vector = title_vector.op("||")(content_vector).op("||")(tags_vector)
        rank_expr = func.ts_rank_cd(search_vector, ts_query)
        snippet_expr = func.ts_headline(
            "english",
            NoteORM.content,
            ts_query,
            "MaxWords=50, MinWords=25, ShortWord=3",
        )

        with self._session_scope() as session:
            rows = (
                session.query(NoteORM, rank_expr.label("rank"), snippet_expr.label("snippet"))
                .filter(NoteORM.user_id == user_id, *_visibility_clauses())
                .filter(search_vector.op("@@")(ts_query))
                .order_by(desc("rank"))
                .limit(max(limit, 1))
                .all()
            )

        results: list[SearchResult] = []
        for note, rank_value, snippet in rows:
            results.append(
                SearchResult(
                    note=_note_to_dto(note),
                    rank=float(rank_value or 0.0),
                    snippet=snippet or "",
                )
            )
        return results
