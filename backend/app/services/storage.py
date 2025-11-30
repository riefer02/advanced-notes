"""
SQLAlchemy-backed storage service for notes.

This module replaces the manual SQL adapter with an ORM-based repository
that enforces user isolation while keeping feature parity across SQLite
and PostgreSQL (including full-text search helpers).
"""

from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Generator, List, Mapping, Optional
from uuid import uuid4

from sqlalchemy import Text, cast, desc, func, or_, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.dialects.postgresql import JSONB

from ..database import (
    Base,
    Note as NoteORM,
    create_engine_for_url,
    get_engine,
    get_session_factory,
)
from .models import (
    FolderNode,
    FolderStats,
    Note as NoteDTO,
    NoteMetadata,
    SearchResult,
)

SQLITE_FTS_STATEMENTS = [
    """
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        note_id UNINDEXED,
        title,
        content,
        tags,
        tokenize = 'porter ascii'
    )
    """,
    """
    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts(note_id, title, content, tags)
        VALUES (new.id, new.title, new.content, new.tags);
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
        UPDATE notes_fts SET
            note_id = new.id,
            title = new.title,
            content = new.content,
            tags = new.tags
        WHERE note_id = old.id;
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
        DELETE FROM notes_fts WHERE note_id = old.id;
    END
    """,
]

_SQLITE_SCHEMA_CACHE: Dict[str, bool] = {}


def _serialize_tags(tags: List[str]) -> Optional[str]:
    if not tags:
        return None
    return json.dumps(tags)


def _deserialize_tags(value: Any) -> List[str]:
    if not value:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = value.decode()
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return []


def _coerce_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
            try:
                return datetime.fromisoformat(value) if "T" in value else datetime.strptime(value, fmt)
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(value.replace(" ", "T"))
        except ValueError:
            return None
    return None


def _mapping_to_note(row: Mapping[str, Any]) -> NoteDTO:
    return NoteDTO(
        id=row["id"],
        user_id=row["user_id"],
        title=row["title"],
        content=row["content"],
        folder_path=row["folder_path"],
        tags=_deserialize_tags(row.get("tags")),
        created_at=_coerce_datetime(row.get("created_at")) or datetime.utcnow(),
        updated_at=_coerce_datetime(row.get("updated_at")) or datetime.utcnow(),
        word_count=row.get("word_count") or 0,
        confidence=row.get("confidence"),
        transcription_duration=row.get("transcription_duration"),
        model_version=row.get("model_version"),
    )


def _note_to_dto(note: NoteORM) -> NoteDTO:
    return NoteDTO(
        id=note.id,
        user_id=note.user_id,
        title=note.title,
        content=note.content,
        folder_path=note.folder_path,
        tags=_deserialize_tags(note.tags),
        created_at=note.created_at,
        updated_at=note.updated_at,
        word_count=note.word_count or 0,
        confidence=note.confidence,
        transcription_duration=note.transcription_duration,
        model_version=note.model_version,
    )


def _build_folder_tree(rows: List[Mapping[str, Any]]) -> FolderNode:
    root = FolderNode(name="", path="", note_count=0)
    folder_map: Dict[str, FolderNode] = {"": root}

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


def _ensure_sqlite_schema(engine: Engine) -> None:
    """Create tables + FTS artifacts for SQLite if they do not exist."""
    cache_key = str(engine.url)
    if _SQLITE_SCHEMA_CACHE.get(cache_key):
        return

    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        for statement in SQLITE_FTS_STATEMENTS:
            conn.exec_driver_sql(statement)

    _SQLITE_SCHEMA_CACHE[cache_key] = True


class NoteStorage:
    """
    SQLAlchemy-based storage facade used by Flask routes and services.
    
    The public API remains equivalent to the previous adapter-based design.
    """

    def __init__(self, db_path: Optional[Path] = None, database_url: Optional[str] = None):
        self.engine, self.session_factory = self._configure_engine(db_path, database_url)
        self.dialect = self.engine.dialect.name

        if self.dialect == "sqlite":
            _ensure_sqlite_schema(self.engine)

    def save_note(self, user_id: str, content: str, metadata: NoteMetadata) -> str:
        note_id = str(uuid4())
        now = datetime.utcnow()
        db_note = NoteORM(
            id=note_id,
            user_id=user_id,
            title=metadata.title,
            content=content,
            folder_path=metadata.folder_path,
            tags=_serialize_tags(metadata.tags),
            created_at=now,
            updated_at=now,
            word_count=len(content.split()),
            confidence=metadata.confidence,
            transcription_duration=metadata.transcription_duration,
            model_version=metadata.model_version,
        )

        with self._session_scope() as session:
            session.add(db_note)

        return note_id

    def get_note(self, user_id: str, note_id: str) -> Optional[NoteDTO]:
        with self._session_scope() as session:
            note = (
                session.query(NoteORM)
                .filter(NoteORM.id == note_id, NoteORM.user_id == user_id)
                .one_or_none()
            )
            return _note_to_dto(note) if note else None

    def update_note(
        self,
        user_id: str,
        note_id: str,
        content: Optional[str] = None,
        metadata: Optional[NoteMetadata] = None,
    ) -> bool:
        with self._session_scope() as session:
            note = (
                session.query(NoteORM)
                .filter(NoteORM.id == note_id, NoteORM.user_id == user_id)
                .one_or_none()
            )

            if not note:
                return False

            updated = False

            if content is not None:
                note.content = content
                note.word_count = len(content.split())
                updated = True

            if metadata:
                note.title = metadata.title or note.title
                note.folder_path = metadata.folder_path or note.folder_path
                note.tags = _serialize_tags(metadata.tags)
                note.confidence = metadata.confidence if metadata.confidence is not None else note.confidence
                note.transcription_duration = (
                    metadata.transcription_duration
                    if metadata.transcription_duration is not None
                    else note.transcription_duration
                )
                note.model_version = metadata.model_version or note.model_version
                updated = True

            if updated:
                note.updated_at = datetime.utcnow()
                session.add(note)

            return updated

    def delete_note(self, user_id: str, note_id: str) -> bool:
        with self._session_scope() as session:
            result = (
                session.query(NoteORM)
                .filter(NoteORM.id == note_id, NoteORM.user_id == user_id)
                .delete(synchronize_session=False)
            )
            return result > 0

    def list_notes(
        self,
        user_id: str,
        folder: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        order_by: str = "updated_at",
    ) -> List[NoteDTO]:
        order_map = {
            "created_at": NoteORM.created_at,
            "updated_at": NoteORM.updated_at,
            "title": NoteORM.title,
        }
        order_column = order_map.get(order_by, NoteORM.updated_at)

        with self._session_scope() as session:
            query = session.query(NoteORM).filter(NoteORM.user_id == user_id)

            if folder:
                query = query.filter(self._folder_filter_clause(folder))

            notes = (
                query.order_by(desc(order_column))
                .offset(max(offset, 0))
                .limit(max(limit, 1))
                .all()
            )

            return [_note_to_dto(note) for note in notes]

    def search_notes(self, user_id: str, query: str, limit: int = 50) -> List[SearchResult]:
        if not query or not query.strip():
            return []

        if self.dialect == "sqlite":
            return self._search_notes_sqlite(user_id, query, limit)
        return self._search_notes_postgres(user_id, query, limit)

    def get_folder_tree(self, user_id: str) -> FolderNode:
        with self._session_scope() as session:
            rows = (
                session.query(NoteORM.folder_path, func.count(NoteORM.id))
                .filter(NoteORM.user_id == user_id)
                .group_by(NoteORM.folder_path)
                .order_by(NoteORM.folder_path)
                .all()
            )
        return _build_folder_tree(rows)

    def get_all_tags(self, user_id: str) -> List[str]:
        with self._session_scope() as session:
            rows = (
                session.query(NoteORM.tags)
                .filter(NoteORM.user_id == user_id, NoteORM.tags.isnot(None))
                .all()
            )

        tags: set[str] = set()
        for (value,) in rows:
            tags.update(_deserialize_tags(value))

        return sorted(tags)

    def get_notes_by_tag(self, user_id: str, tag: str, limit: int = 50) -> List[NoteDTO]:
        with self._session_scope() as session:
            query = session.query(NoteORM).filter(NoteORM.user_id == user_id)

            if self.dialect == "postgresql":
                contains = cast(NoteORM.tags, JSONB).op("@>")(json.dumps([tag]))
                query = query.filter(contains)
            else:
                query = query.filter(NoteORM.tags.like(f'%"{tag}"%'))

            notes = query.order_by(NoteORM.updated_at.desc()).limit(limit).all()
            return [_note_to_dto(note) for note in notes]

    def get_note_count(self, user_id: str, folder: Optional[str] = None) -> int:
        with self._session_scope() as session:
            query = session.query(func.count(NoteORM.id)).filter(NoteORM.user_id == user_id)
            if folder:
                query = query.filter(self._folder_filter_clause(folder))
            return int(query.scalar() or 0)

    def get_folder_stats(self, user_id: str, folder: str) -> Optional[FolderStats]:
        with self._session_scope() as session:
            base_query = session.query(
                func.count(NoteORM.id),
                func.sum(NoteORM.transcription_duration),
                func.avg(NoteORM.confidence),
            ).filter(NoteORM.user_id == user_id, self._folder_filter_clause(folder))

            count, total_duration, avg_confidence = base_query.one()

            if count == 0:
                return None

            tag_rows = (
                session.query(NoteORM.tags)
                .filter(
                    NoteORM.user_id == user_id,
                    NoteORM.tags.isnot(None),
                    self._folder_filter_clause(folder),
                )
                .all()
            )

        tag_counts: Dict[str, int] = {}
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

    def _search_notes_sqlite(self, user_id: str, query: str, limit: int) -> List[SearchResult]:
        sql = text(
            """
            SELECT 
                n.id,
                n.user_id,
                n.title,
                n.content,
                n.folder_path,
                n.tags,
                n.created_at,
                n.updated_at,
                n.word_count,
                n.confidence,
                n.transcription_duration,
                n.model_version,
                notes_fts.rank AS rank,
                snippet(notes_fts, 2, '<mark>', '</mark>', '...', 50) AS snippet
            FROM notes_fts
            JOIN notes n ON notes_fts.note_id = n.id
            WHERE n.user_id = :user_id AND notes_fts MATCH :match_query
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

        results: List[SearchResult] = []
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

    def _search_notes_postgres(self, user_id: str, query: str, limit: int) -> List[SearchResult]:
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
                .filter(NoteORM.user_id == user_id)
                .filter(search_vector.op("@@")(ts_query))
                .order_by(desc("rank"))
                .limit(max(limit, 1))
                .all()
            )

        results: List[SearchResult] = []
        for note, rank_value, snippet in rows:
            results.append(
                SearchResult(
                    note=_note_to_dto(note),
                    rank=float(rank_value or 0.0),
                    snippet=snippet or "",
                )
            )
        return results

    def _folder_filter_clause(self, folder: str):
        like_pattern = f"{folder}/%"
        return or_(NoteORM.folder_path == folder, NoteORM.folder_path.like(like_pattern))

    def _configure_engine(
        self,
        db_path: Optional[Path],
        database_url: Optional[str],
    ) -> tuple[Engine, sessionmaker]:
        if database_url:
            engine = create_engine_for_url(database_url)
            factory = sessionmaker(
                bind=engine,
                autocommit=False,
                autoflush=False,
                expire_on_commit=False,
                future=True,
            )
            return engine, factory

        if db_path:
            resolved = Path(db_path).resolve()
            engine = create_engine_for_url(f"sqlite:///{resolved}")
            factory = sessionmaker(
                bind=engine,
                autocommit=False,
                autoflush=False,
                expire_on_commit=False,
                future=True,
            )
            return engine, factory

        return get_engine(), get_session_factory()

    @contextmanager
    def _session_scope(self) -> Generator[Session, None, None]:
        session = self.session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

