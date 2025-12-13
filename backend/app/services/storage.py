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
from sqlalchemy import bindparam
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.dialects.postgresql import JSONB

from ..database import (
    Base,
    Digest as DigestORM,
    AskHistory as AskHistoryORM,
    Note as NoteORM,
    NoteEmbedding as NoteEmbeddingORM,
    create_engine_for_url,
    get_engine,
    get_session_factory,
)
from .models import (
    Digest as DigestDTO,
    AskHistory as AskHistoryDTO,
    FolderNode,
    FolderStats,
    Note as NoteDTO,
    NoteMetadata,
    SearchResult,
)

from .embeddings import vector_from_json, vector_to_json

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

_SQLITE_SCHEMA_CACHE: Dict[str, str] = {}


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


def _sqlite_fts_statements(table_name: str) -> List[str]:
    return [
        f"""
        CREATE VIRTUAL TABLE IF NOT EXISTS {table_name} USING fts5(
            note_id UNINDEXED,
            title,
            content,
            tags,
            tokenize = 'porter ascii'
        )
        """,
        f"""
        CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
            INSERT INTO {table_name}(note_id, title, content, tags)
            VALUES (new.id, new.title, new.content, new.tags);
        END
        """,
        f"""
        CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
            UPDATE {table_name} SET
                note_id = new.id,
                title = new.title,
                content = new.content,
                tags = new.tags
            WHERE note_id = old.id;
        END
        """,
        f"""
        CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
            DELETE FROM {table_name} WHERE note_id = old.id;
        END
        """,
    ]


def _ensure_sqlite_schema(engine: Engine) -> str:
    """Create tables + FTS artifacts for SQLite if they do not exist.

    Returns:
        The active FTS table name (usually 'notes_fts', but may be 'notes_fts_live' if repaired).
    """
    cache_key = str(engine.url)
    cached_table = _SQLITE_SCHEMA_CACHE.get(cache_key)
    if cached_table:
        with engine.begin() as conn:
            try:
                conn.exec_driver_sql(f"SELECT 1 FROM {cached_table} LIMIT 1")
                return cached_table
            except Exception:
                pass

    Base.metadata.create_all(bind=engine)

    def _fts_is_healthy(conn) -> bool:
        try:
            conn.exec_driver_sql("SELECT 1 FROM notes_fts LIMIT 1")
            return True
        except OperationalError as e:
            if "vtable constructor failed" in str(e).lower():
                return False
            raise
        except Exception:
            return False

    def _create_or_update_triggers(conn, table_name: str) -> None:
        # Ensure triggers point to the active FTS table.
        conn.exec_driver_sql("DROP TRIGGER IF EXISTS notes_ai")
        conn.exec_driver_sql("DROP TRIGGER IF EXISTS notes_au")
        conn.exec_driver_sql("DROP TRIGGER IF EXISTS notes_ad")
        for statement in _sqlite_fts_statements(table_name)[1:]:
            conn.exec_driver_sql(statement)

    def _repair_fts(conn) -> str:
        """
        Repair a broken FTS virtual table.

        This can happen if the virtual table entry exists but its shadow tables are missing.
        In that case, normal DDL like DROP TABLE notes_fts may fail because SQLite cannot
        construct the vtable. We use a guarded writable_schema repair only in this broken state.
        """
        # We rebuild into a fresh virtual table with a different name and repoint triggers.
        # This avoids schema rename edge-cases while a broken vtable entry still exists.

        active_table = "notes_fts_live"

        # Stop triggers to avoid failing writes during repair.
        conn.exec_driver_sql("DROP TRIGGER IF EXISTS notes_ai")
        conn.exec_driver_sql("DROP TRIGGER IF EXISTS notes_au")
        conn.exec_driver_sql("DROP TRIGGER IF EXISTS notes_ad")

        # Create/recreate the live FTS table.
        conn.exec_driver_sql(f"DROP TABLE IF EXISTS {active_table}")
        conn.exec_driver_sql(_sqlite_fts_statements(active_table)[0])

        # Backfill from existing notes table.
        conn.exec_driver_sql(
            f"INSERT INTO {active_table}(note_id, title, content, tags) "
            "SELECT id, title, content, tags FROM notes"
        )

        # Validate the rebuilt index works.
        conn.exec_driver_sql(f"SELECT count(*) FROM {active_table}").scalar_one()

        # Recreate triggers to point to the live table.
        _create_or_update_triggers(conn, active_table)

        return active_table

    with engine.begin() as conn:
        # Create canonical notes_fts if possible.
        for statement in _sqlite_fts_statements("notes_fts"):
            try:
                conn.exec_driver_sql(statement)
            except OperationalError as e:
                if "vtable constructor failed" in str(e).lower():
                    break
                raise

        # If notes_fts is healthy, use it. Otherwise repair to notes_fts_live.
        active_table = "notes_fts" if _fts_is_healthy(conn) else _repair_fts(conn)

        # If notes_fts is healthy, ensure triggers point to it (might have been dropped by previous repairs).
        if active_table == "notes_fts":
            _create_or_update_triggers(conn, "notes_fts")

    _SQLITE_SCHEMA_CACHE[cache_key] = active_table
    return active_table


class NoteStorage:
    """
    SQLAlchemy-based storage facade used by Flask routes and services.
    
    The public API remains equivalent to the previous adapter-based design.
    """

    def __init__(self, db_path: Optional[Path] = None, database_url: Optional[str] = None):
        self.engine, self.session_factory = self._configure_engine(db_path, database_url)
        self.dialect = self.engine.dialect.name
        self.sqlite_fts_table = "notes_fts"

        if self.dialect == "sqlite":
            self.sqlite_fts_table = _ensure_sqlite_schema(self.engine)

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

    def upsert_note_embedding(
        self,
        user_id: str,
        note_id: str,
        embedding_model: str,
        content_hash: str,
        embedding_value: str,
    ) -> None:
        """
        Upsert a note embedding (user-scoped).

        Args:
            embedding_value: dialect-specific string value:
              - SQLite: JSON string
              - Postgres: pgvector literal string like "[0.1,0.2,...]"
        """
        now = datetime.utcnow()
        with self._session_scope() as session:
            existing = (
                session.query(NoteEmbeddingORM)
                .filter(
                    NoteEmbeddingORM.user_id == user_id,
                    NoteEmbeddingORM.note_id == note_id,
                    NoteEmbeddingORM.embedding_model == embedding_model,
                )
                .one_or_none()
            )
            if existing:
                existing.content_hash = content_hash
                existing.embedding = embedding_value
                existing.updated_at = now
                session.add(existing)
                return

            db_emb = NoteEmbeddingORM(
                id=str(uuid4()),
                user_id=user_id,
                note_id=note_id,
                embedding_model=embedding_model,
                content_hash=content_hash,
                embedding=embedding_value,
                created_at=now,
                updated_at=now,
            )
            session.add(db_emb)

    def get_note_embedding(
        self, user_id: str, note_id: str, embedding_model: str
    ) -> Optional[Mapping[str, Any]]:
        with self._session_scope() as session:
            row = (
                session.query(NoteEmbeddingORM)
                .filter(
                    NoteEmbeddingORM.user_id == user_id,
                    NoteEmbeddingORM.note_id == note_id,
                    NoteEmbeddingORM.embedding_model == embedding_model,
                )
                .one_or_none()
            )
            if not row:
                return None
            return {
                "note_id": row.note_id,
                "embedding_model": row.embedding_model,
                "content_hash": row.content_hash,
                "embedding": row.embedding,
            }

    def _parse_embedding(self, value: Any) -> List[float]:
        if value is None:
            return []
        if isinstance(value, list):
            return [float(x) for x in value]
        if isinstance(value, (bytes, bytearray)):
            value = value.decode()
        if isinstance(value, str):
            s = value.strip()
            # SQLite JSON
            if s.startswith("[") and (s.endswith("]") or s.endswith("]::vector")):
                # Postgres pgvector text output looks like "[...]" as well; try JSON first.
                parsed = vector_from_json(s)
                if parsed:
                    return parsed
                inner = s.strip("[]")
                if not inner:
                    return []
                try:
                    return [float(x) for x in inner.split(",")]
                except Exception:
                    return []
            return vector_from_json(s)
        return []

    def semantic_search(
        self,
        user_id: str,
        query_embedding_literal: str,
        limit: int = 50,
        candidate_note_ids: Optional[List[str]] = None,
        embedding_model: str = "text-embedding-3-small",
    ) -> List[Mapping[str, Any]]:
        """
        Semantic search over embeddings table.

        Args:
            query_embedding_literal:
              - SQLite: JSON string of floats
              - Postgres: pgvector literal string like "[0.1,0.2,...]"
        """
        limit = max(1, limit)
        if self.dialect == "postgresql":
            where_extra = ""
            params: Dict[str, Any] = {
                "user_id": user_id,
                "embedding_model": embedding_model,
                "qvec": query_embedding_literal,
                "limit": limit,
            }
            if candidate_note_ids:
                where_extra = " AND note_id IN :note_ids"
                params["note_ids"] = candidate_note_ids

            sql = text(
                f"""
                SELECT note_id,
                       (1.0 / (1.0 + (embedding <=> (:qvec::vector)))) AS score
                FROM note_embeddings
                WHERE user_id = :user_id
                  AND embedding_model = :embedding_model
                  {where_extra}
                ORDER BY embedding <=> (:qvec::vector)
                LIMIT :limit
                """
            )
            if candidate_note_ids:
                sql = sql.bindparams(bindparam("note_ids", expanding=True))

            with self._session_scope() as session:
                rows = (
                    session.execute(sql, params)
                    .mappings()
                    .all()
                )
            return [{"note_id": r["note_id"], "score": float(r["score"] or 0.0)} for r in rows]

        # SQLite fallback: load candidate embeddings and score in Python
        with self._session_scope() as session:
            query = (
                session.query(NoteEmbeddingORM)
                .filter(
                    NoteEmbeddingORM.user_id == user_id,
                    NoteEmbeddingORM.embedding_model == embedding_model,
                )
            )
            if candidate_note_ids:
                query = query.filter(NoteEmbeddingORM.note_id.in_(candidate_note_ids))
            rows = query.all()

        q_vec = self._parse_embedding(query_embedding_literal)
        if not q_vec:
            return []

        from .embeddings import cosine_similarity, normalize_similarity

        scored = []
        for row in rows:
            vec = self._parse_embedding(row.embedding)
            sim = normalize_similarity(cosine_similarity(q_vec, vec))
            scored.append({"note_id": row.note_id, "score": float(sim)})

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:limit]

    def get_notes_by_ids(self, user_id: str, note_ids: List[str]) -> List[NoteDTO]:
        if not note_ids:
            return []
        with self._session_scope() as session:
            notes = (
                session.query(NoteORM)
                .filter(NoteORM.user_id == user_id, NoteORM.id.in_(note_ids))
                .all()
            )
            dto_by_id = {n.id: _note_to_dto(n) for n in notes}
        return [dto_by_id[nid] for nid in note_ids if nid in dto_by_id]

    def _date_range_to_datetimes(self, start_date: Optional[str], end_date: Optional[str]) -> tuple[Optional[datetime], Optional[datetime]]:
        if not start_date and not end_date:
            return None, None

        def to_start(d: str) -> Optional[datetime]:
            try:
                return datetime.fromisoformat(d).replace(hour=0, minute=0, second=0, microsecond=0)
            except Exception:
                return None

        def to_end(d: str) -> Optional[datetime]:
            try:
                return datetime.fromisoformat(d).replace(hour=23, minute=59, second=59, microsecond=999999)
            except Exception:
                return None

        return (to_start(start_date) if start_date else None, to_end(end_date) if end_date else None)

    def _filter_candidate_note_ids(
        self,
        user_id: str,
        folder_paths: Optional[List[str]] = None,
        include_tags: Optional[List[str]] = None,
        exclude_tags: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        max_candidates: int = 5000,
    ) -> Optional[List[str]]:
        """
        Returns a list of candidate note IDs, or None if no filters were applied.

        This is used to constrain semantic search for performance.
        """
        folder_paths = [p for p in (folder_paths or []) if p]
        include_tags = [t for t in (include_tags or []) if t]
        exclude_tags = [t for t in (exclude_tags or []) if t]

        start_dt, end_dt = self._date_range_to_datetimes(start_date, end_date)

        any_filter = bool(folder_paths or include_tags or exclude_tags or start_dt or end_dt)
        if not any_filter:
            return None

        with self._session_scope() as session:
            query = session.query(NoteORM.id).filter(NoteORM.user_id == user_id)

            # Time filter: use created_at for "in February" semantics.
            if start_dt is not None:
                query = query.filter(NoteORM.created_at >= start_dt)
            if end_dt is not None:
                query = query.filter(NoteORM.created_at <= end_dt)

            if folder_paths:
                folder_clauses = [self._folder_filter_clause(p) for p in folder_paths]
                query = query.filter(or_(*folder_clauses))

            if include_tags:
                if self.dialect == "postgresql":
                    include_any = [
                        cast(NoteORM.tags, JSONB).op("@>")(json.dumps([tag]))
                        for tag in include_tags
                    ]
                    query = query.filter(or_(*include_any))
                else:
                    include_any = [NoteORM.tags.like(f'%\"{tag}\"%') for tag in include_tags]
                    query = query.filter(or_(*include_any))

            if exclude_tags:
                if self.dialect == "postgresql":
                    exclude_any = [
                        cast(NoteORM.tags, JSONB).op("@>")(json.dumps([tag]))
                        for tag in exclude_tags
                    ]
                    query = query.filter(~or_(*exclude_any))
                else:
                    exclude_any = [NoteORM.tags.like(f'%\"{tag}\"%') for tag in exclude_tags]
                    query = query.filter(~or_(*exclude_any))

            rows = query.limit(max(1, max_candidates)).all()
            return [note_id for (note_id,) in rows]

    def retrieve_for_question(
        self,
        user_id: str,
        *,
        fts_query: str,
        query_embedding_literal: str,
        folder_paths: Optional[List[str]] = None,
        include_tags: Optional[List[str]] = None,
        exclude_tags: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 12,
        embedding_model: str = "text-embedding-3-small",
    ) -> List[Mapping[str, Any]]:
        """
        Hybrid retrieval: metadata filters + FTS + semantic embeddings.

        Returns ranked note payloads (note DTO + snippet + score).
        """
        limit = max(1, min(limit, 50))
        candidate_ids = self._filter_candidate_note_ids(
            user_id=user_id,
            folder_paths=folder_paths,
            include_tags=include_tags,
            exclude_tags=exclude_tags,
            start_date=start_date,
            end_date=end_date,
        )

        # Candidate generation
        semantic_k = min(200, limit * 5)
        fts_k = min(200, limit * 5)

        semantic_hits = self.semantic_search(
            user_id=user_id,
            query_embedding_literal=query_embedding_literal,
            limit=semantic_k,
            candidate_note_ids=candidate_ids,
            embedding_model=embedding_model,
        )
        fts_results = self.search_notes(user_id, fts_query, limit=fts_k)

        # Normalize FTS scores into [0, 1]
        fts_scores: Dict[str, float] = {}
        if fts_results:
            if self.dialect == "sqlite":
                # SQLite rank: lower is better, convert via 1/(1+rank)
                for r in fts_results:
                    fts_scores[r.note.id] = 1.0 / (1.0 + float(r.rank or 0.0))
            else:
                max_rank = max(float(r.rank or 0.0) for r in fts_results) or 1.0
                for r in fts_results:
                    fts_scores[r.note.id] = float(r.rank or 0.0) / max_rank

        semantic_scores: Dict[str, float] = {
            h["note_id"]: float(h.get("score") or 0.0) for h in semantic_hits
        }

        # Combine/dedupe
        note_ids = set(semantic_scores.keys()) | set(fts_scores.keys())
        if candidate_ids is not None:
            note_ids &= set(candidate_ids)

        # Weighted blend
        def blended(nid: str) -> float:
            s = semantic_scores.get(nid, 0.0)
            f = fts_scores.get(nid, 0.0)
            return 0.65 * s + 0.35 * f

        ranked_ids = sorted(note_ids, key=blended, reverse=True)[:limit]
        notes = self.get_notes_by_ids(user_id, ranked_ids)
        note_by_id = {n.id: n for n in notes}

        # Snippets: use FTS snippet when available, otherwise a small content preview.
        fts_snippets = {r.note.id: r.snippet for r in fts_results}

        results: List[Mapping[str, Any]] = []
        for nid in ranked_ids:
            note = note_by_id.get(nid)
            if not note:
                continue
            snippet = fts_snippets.get(nid)
            if not snippet:
                snippet = (note.content or "")[:220]
            results.append(
                {
                    "note": note,
                    "snippet": snippet,
                    "score": blended(nid),
                    "semantic_score": semantic_scores.get(nid, 0.0),
                    "fts_score": fts_scores.get(nid, 0.0),
                }
            )
        return results

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
            session.query(NoteEmbeddingORM).filter(
                NoteEmbeddingORM.user_id == user_id,
                NoteEmbeddingORM.note_id == note_id,
            ).delete(synchronize_session=False)
            result = (
                session.query(NoteORM)
                .filter(NoteORM.id == note_id, NoteORM.user_id == user_id)
                .delete(synchronize_session=False)
            )
            return result > 0

    def get_recent_notes(self, user_id: str, limit: int = 10) -> List[NoteDTO]:
        """
        Fetch the most recently updated notes for a user.
        
        Args:
            user_id: The ID of the user.
            limit: Maximum number of notes to return.
            
        Returns:
            List of NoteDTO objects.
        """
        with self._session_scope() as session:
            notes = (
                session.query(NoteORM)
                .filter(NoteORM.user_id == user_id)
                .order_by(desc(NoteORM.updated_at))
                .limit(limit)
                .all()
            )
            return [_note_to_dto(note) for note in notes]

    def save_digest(self, user_id: str, content: str) -> str:
        """
        Save a new digest to the database.
        
        Args:
            user_id: The ID of the user.
            content: The digest content.
            
        Returns:
            The ID of the newly created digest.
        """
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

    def list_digests(self, user_id: str, limit: int = 50, offset: int = 0) -> List[DigestDTO]:
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

    def get_digest(self, user_id: str, digest_id: str) -> Optional[DigestDTO]:
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

    def save_ask_history(
        self,
        user_id: str,
        query: str,
        query_plan_json: str,
        answer_markdown: str,
        cited_note_ids_json: str,
        source_scores_json: Optional[str] = None,
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
    ) -> List[AskHistoryDTO]:
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

    def get_ask_history(self, user_id: str, ask_id: str) -> Optional[AskHistoryDTO]:
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
        fts_table = getattr(self, "sqlite_fts_table", "notes_fts")
        sql = text(
            f"""
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
                {fts_table}.rank AS rank,
                snippet({fts_table}, 2, '<mark>', '</mark>', '...', 50) AS snippet
            FROM {fts_table}
            JOIN notes n ON {fts_table}.note_id = n.id
            WHERE n.user_id = :user_id AND {fts_table} MATCH :match_query
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

