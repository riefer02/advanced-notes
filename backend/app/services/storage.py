"""
SQLAlchemy-backed storage service for notes.

This module replaces the manual SQL adapter with an ORM-based repository
that enforces user isolation while keeping feature parity across SQLite
and PostgreSQL (including full-text search helpers).
"""

from __future__ import annotations

import json
from collections.abc import Generator, Mapping
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import Text, bindparam, cast, desc, func, or_, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from ..database import (
    AskHistory as AskHistoryORM,
)
from ..database import (
    AudioClip as AudioClipORM,
)
from ..database import (
    Base,
    create_engine_for_url,
    get_engine,
    get_session_factory,
)
from ..database import (
    Digest as DigestORM,
)
from ..database import (
    Feedback as FeedbackORM,
)
from ..database import (
    Friendship as FriendshipORM,
)
from ..database import (
    MealEmbedding as MealEmbeddingORM,
)
from ..database import (
    MealEntry as MealEntryORM,
)
from ..database import (
    MealItem as MealItemORM,
)
from ..database import (
    Note as NoteORM,
)
from ..database import (
    NoteEmbedding as NoteEmbeddingORM,
)
from ..database import (
    ResourceShare as ResourceShareORM,
)
from ..database import (
    Todo as TodoORM,
)
from ..database import (
    UserProfile as UserProfileORM,
)
from ..database import (
    UserSettings as UserSettingsORM,
)
from ..database import (
    VinylEmbedding as VinylEmbeddingORM,
)
from ..database import (
    VinylImage as VinylImageORM,
)
from ..database import (
    VinylRecord as VinylRecordORM,
)
from ..database import (
    VinylTrack as VinylTrackORM,
)
from .embeddings import vector_from_json
from .models import (
    AskHistory as AskHistoryDTO,
)
from .models import (
    AudioClip as AudioClipDTO,
)
from .models import (
    Digest as DigestDTO,
)
from .models import (
    FeedbackResponse as FeedbackDTO,
)
from .models import (
    FolderNode,
    FolderStats,
    MealCalendarEntry,
    MealEntryMetadata,
    NoteMetadata,
    SearchResult,
)
from .models import (
    FriendshipResponse as FriendshipDTO,
)
from .models import (
    MealEntry as MealEntryDTO,
)
from .models import (
    MealItem as MealItemDTO,
)
from .models import (
    Note as NoteDTO,
)
from .models import (
    ResourceShareResponse as ResourceShareDTO,
)
from .models import (
    Todo as TodoDTO,
)
from .models import (
    UserProfileResponse as UserProfileDTO,
)
from .models import (
    UserSettings as UserSettingsDTO,
)
from .models import (
    VinylImage as VinylImageDTO,
)
from .models import (
    VinylRecord as VinylRecordDTO,
)
from .models import (
    VinylTrack as VinylTrackDTO,
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

_SQLITE_SCHEMA_CACHE: dict[str, str] = {}


def _serialize_tags(tags: list[str]) -> str | None:
    if not tags:
        return None
    return json.dumps(tags)


def _deserialize_tags(value: Any) -> list[str]:
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


def _coerce_datetime(value: Any) -> datetime | None:
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


def _audio_clip_to_dto(clip: AudioClipORM) -> AudioClipDTO:
    return AudioClipDTO(
        id=clip.id,
        user_id=clip.user_id,
        note_id=clip.note_id,
        bucket=clip.bucket,
        storage_key=clip.storage_key,
        mime_type=clip.mime_type,
        bytes=int(clip.bytes or 0),
        duration_ms=clip.duration_ms,
        status=clip.status,
        created_at=clip.created_at,
    )


def _user_settings_to_dto(settings: UserSettingsORM) -> UserSettingsDTO:
    return UserSettingsDTO(
        id=settings.id,
        user_id=settings.user_id,
        auto_accept_todos=settings.auto_accept_todos,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )


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


def _vinyl_image_to_dto(img: VinylImageORM) -> VinylImageDTO:
    return VinylImageDTO(
        id=img.id,
        user_id=img.user_id,
        vinyl_record_id=img.vinyl_record_id,
        image_type=img.image_type,
        storage_key=img.storage_key,
        mime_type=img.mime_type,
        bytes=int(img.bytes or 0),
        status=img.status,
        created_at=img.created_at,
    )


def _vinyl_track_to_dto(track: VinylTrackORM) -> VinylTrackDTO:
    return VinylTrackDTO(
        id=track.id,
        user_id=track.user_id,
        vinyl_record_id=track.vinyl_record_id,
        side=track.side,
        position=track.position,
        title=track.title,
        duration=track.duration,
        created_at=track.created_at,
    )


def _vinyl_record_to_dto(
    record: VinylRecordORM,
    tracks: list[VinylTrackORM] | None = None,
    images: list[VinylImageORM] | None = None,
) -> VinylRecordDTO:
    return VinylRecordDTO(
        id=record.id,
        user_id=record.user_id,
        artist=record.artist,
        album_title=record.album_title,
        release_year=record.release_year,
        genre=_deserialize_tags(record.genre),
        label=record.label,
        catalog_number=record.catalog_number,
        format=record.format,
        pressing_country=record.pressing_country,
        color=record.color,
        condition=record.condition,
        notes=record.notes,
        extraction_status=record.extraction_status,
        extraction_confidence=record.extraction_confidence,
        cover_image_id=record.cover_image_id,
        tracks=[_vinyl_track_to_dto(t) for t in (tracks or [])],
        images=[_vinyl_image_to_dto(i) for i in (images or [])],
        created_at=record.created_at,
        updated_at=record.updated_at,
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


def _sqlite_fts_statements(table_name: str) -> list[str]:
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

    This is the primary data access layer for the application. All methods
    enforce user isolation by requiring `user_id` as the first parameter.

    Features:
    - Multi-tenancy via user_id filtering on all queries
    - Full-text search (SQLite FTS5 or PostgreSQL tsvector)
    - Semantic search via note embeddings
    - Transaction management via session scopes

    Usage:
        svc = get_services()
        notes = svc.storage.list_notes(user_id, folder="work")
    """

    def __init__(self, db_path: Path | None = None, database_url: str | None = None):
        """
        Initialize the storage service.

        Args:
            db_path: Path to SQLite database file (dev mode).
            database_url: Full database URL (production mode, e.g., PostgreSQL).

        Note:
            If neither is provided, uses default from database.py.
        """
        self.engine, self.session_factory = self._configure_engine(db_path, database_url)
        self.dialect = self.engine.dialect.name
        self.sqlite_fts_table = "notes_fts"

        if self.dialect == "sqlite":
            self.sqlite_fts_table = _ensure_sqlite_schema(self.engine)

    def save_note(self, user_id: str, content: str, metadata: NoteMetadata) -> str:
        """
        Create a new note in the database.

        Args:
            user_id: The user ID who owns the note.
            content: The note content (transcription text).
            metadata: NoteMetadata with title, folder_path, tags, etc.

        Returns:
            The ID of the newly created note.
        """
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

    def create_audio_clip_pending(
        self,
        user_id: str,
        *,
        clip_id: str | None = None,
        note_id: str | None,
        mime_type: str,
        bytes: int,
        duration_ms: int | None,
        storage_key: str,
        bucket: str | None = None,
    ) -> AudioClipDTO:
        clip_id = clip_id or str(uuid4())
        now = datetime.utcnow()

        clip = AudioClipORM(
            id=clip_id,
            user_id=user_id,
            note_id=note_id,
            bucket=bucket,
            storage_key=storage_key,
            mime_type=mime_type,
            bytes=int(bytes),
            duration_ms=duration_ms,
            status="pending",
            created_at=now,
        )
        with self._session_scope() as session:
            session.add(clip)
        return AudioClipDTO(
            id=clip_id,
            user_id=user_id,
            note_id=note_id,
            bucket=bucket,
            storage_key=storage_key,
            mime_type=mime_type,
            bytes=int(bytes),
            duration_ms=duration_ms,
            status="pending",
            created_at=now,
        )

    def mark_audio_clip_ready(
        self,
        user_id: str,
        clip_id: str,
        *,
        bucket: str | None = None,
        storage_key: str | None = None,
        note_id: str | None = None,
        duration_ms: int | None = None,
    ) -> AudioClipDTO | None:
        with self._session_scope() as session:
            clip = (
                session.query(AudioClipORM)
                .filter(AudioClipORM.user_id == user_id, AudioClipORM.id == clip_id)
                .one_or_none()
            )
            if not clip:
                return None
            if bucket is not None:
                clip.bucket = bucket
            if storage_key is not None:
                clip.storage_key = storage_key
            if note_id is not None:
                clip.note_id = note_id
            if duration_ms is not None:
                clip.duration_ms = duration_ms
            clip.status = "ready"
            session.add(clip)
            return _audio_clip_to_dto(clip)

    def mark_audio_clip_failed(self, user_id: str, clip_id: str) -> AudioClipDTO | None:
        with self._session_scope() as session:
            clip = (
                session.query(AudioClipORM)
                .filter(AudioClipORM.user_id == user_id, AudioClipORM.id == clip_id)
                .one_or_none()
            )
            if not clip:
                return None
            clip.status = "failed"
            session.add(clip)
            return _audio_clip_to_dto(clip)

    def get_audio_clip(self, user_id: str, clip_id: str) -> AudioClipDTO | None:
        with self._session_scope() as session:
            clip = (
                session.query(AudioClipORM)
                .filter(AudioClipORM.user_id == user_id, AudioClipORM.id == clip_id)
                .one_or_none()
            )
            return _audio_clip_to_dto(clip) if clip else None

    def get_primary_audio_clip_for_note(
        self, user_id: str, note_id: str
    ) -> AudioClipDTO | None:
        with self._session_scope() as session:
            clip = (
                session.query(AudioClipORM)
                .filter(
                    AudioClipORM.user_id == user_id,
                    AudioClipORM.note_id == note_id,
                    AudioClipORM.status == "ready",
                )
                .order_by(desc(AudioClipORM.created_at))
                .limit(1)
                .one_or_none()
            )
            return _audio_clip_to_dto(clip) if clip else None

    def list_audio_clips_for_note(self, user_id: str, note_id: str) -> list[AudioClipDTO]:
        if not note_id:
            return []
        with self._session_scope() as session:
            rows = (
                session.query(AudioClipORM)
                .filter(AudioClipORM.user_id == user_id, AudioClipORM.note_id == note_id)
                .order_by(desc(AudioClipORM.created_at))
                .all()
            )
            return [_audio_clip_to_dto(r) for r in rows]

    def delete_audio_clips_for_note(self, user_id: str, note_id: str) -> int:
        if not note_id:
            return 0
        with self._session_scope() as session:
            result = (
                session.query(AudioClipORM)
                .filter(AudioClipORM.user_id == user_id, AudioClipORM.note_id == note_id)
                .delete(synchronize_session=False)
            )
            return int(result or 0)

    def delete_audio_clip(self, user_id: str, clip_id: str) -> bool:
        with self._session_scope() as session:
            result = (
                session.query(AudioClipORM)
                .filter(AudioClipORM.user_id == user_id, AudioClipORM.id == clip_id)
                .delete(synchronize_session=False)
            )
            return result > 0

    def list_stale_pending_audio_clips(
        self,
        user_id: str,
        *,
        older_than_minutes: int = 60,
        limit: int = 100,
    ) -> list[AudioClipDTO]:
        """
        Return stale pending clips for a user (used by opportunistic cleanup).
        """
        older_than_minutes = max(1, int(older_than_minutes))
        limit = max(1, min(int(limit), 1000))
        cutoff = datetime.utcnow().timestamp() - (older_than_minutes * 60)
        cutoff_dt = datetime.utcfromtimestamp(cutoff)

        with self._session_scope() as session:
            rows = (
                session.query(AudioClipORM)
                .filter(
                    AudioClipORM.user_id == user_id,
                    AudioClipORM.status == "pending",
                    AudioClipORM.created_at < cutoff_dt,
                )
                .order_by(AudioClipORM.created_at.asc())
                .limit(limit)
                .all()
            )
            return [_audio_clip_to_dto(r) for r in rows]

    def delete_audio_clips(self, user_id: str, clip_ids: list[str]) -> int:
        if not clip_ids:
            return 0
        with self._session_scope() as session:
            result = (
                session.query(AudioClipORM)
                .filter(AudioClipORM.user_id == user_id, AudioClipORM.id.in_(clip_ids))
                .delete(synchronize_session=False)
            )
            return int(result or 0)

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
    ) -> Mapping[str, Any] | None:
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

    def _parse_embedding(self, value: Any) -> list[float]:
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
        candidate_note_ids: list[str] | None = None,
        embedding_model: str = "text-embedding-3-small",
    ) -> list[Mapping[str, Any]]:
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
            params: dict[str, Any] = {
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
                       (1.0 / (1.0 + (embedding <=> ((:qvec)::vector)))) AS score
                FROM note_embeddings
                WHERE user_id = :user_id
                  AND embedding_model = :embedding_model
                  {where_extra}
                ORDER BY embedding <=> ((:qvec)::vector)
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

    def get_notes_by_ids(self, user_id: str, note_ids: list[str]) -> list[NoteDTO]:
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

    def _date_range_to_datetimes(self, start_date: str | None, end_date: str | None) -> tuple[datetime | None, datetime | None]:
        if not start_date and not end_date:
            return None, None

        def to_start(d: str) -> datetime | None:
            try:
                return datetime.fromisoformat(d).replace(hour=0, minute=0, second=0, microsecond=0)
            except Exception:
                return None

        def to_end(d: str) -> datetime | None:
            try:
                return datetime.fromisoformat(d).replace(hour=23, minute=59, second=59, microsecond=999999)
            except Exception:
                return None

        return (to_start(start_date) if start_date else None, to_end(end_date) if end_date else None)

    def _filter_candidate_note_ids(
        self,
        user_id: str,
        folder_paths: list[str] | None = None,
        include_tags: list[str] | None = None,
        exclude_tags: list[str] | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        max_candidates: int = 5000,
    ) -> list[str] | None:
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
        folder_paths: list[str] | None = None,
        include_tags: list[str] | None = None,
        exclude_tags: list[str] | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        limit: int = 12,
        embedding_model: str = "text-embedding-3-small",
    ) -> list[Mapping[str, Any]]:
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
        fts_scores: dict[str, float] = {}
        if fts_results:
            if self.dialect == "sqlite":
                # SQLite rank: lower is better, convert via 1/(1+rank)
                for r in fts_results:
                    fts_scores[r.note.id] = 1.0 / (1.0 + float(r.rank or 0.0))
            else:
                max_rank = max(float(r.rank or 0.0) for r in fts_results) or 1.0
                for r in fts_results:
                    fts_scores[r.note.id] = float(r.rank or 0.0) / max_rank

        semantic_scores: dict[str, float] = {
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

        results: list[Mapping[str, Any]] = []
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

    def get_note(self, user_id: str, note_id: str) -> NoteDTO | None:
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
        content: str | None = None,
        metadata: NoteMetadata | None = None,
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

    def get_recent_notes(self, user_id: str, limit: int = 10) -> list[NoteDTO]:
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

    def list_notes(
        self,
        user_id: str,
        folder: str | None = None,
        limit: int = 50,
        offset: int = 0,
        order_by: str = "updated_at",
    ) -> list[NoteDTO]:
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
                .filter(NoteORM.user_id == user_id)
                .group_by(NoteORM.folder_path)
                .order_by(NoteORM.folder_path)
                .all()
            )
        return _build_folder_tree(rows)

    def get_all_tags(self, user_id: str) -> list[str]:
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

    def get_notes_by_tag(self, user_id: str, tag: str, limit: int = 50) -> list[NoteDTO]:
        with self._session_scope() as session:
            query = session.query(NoteORM).filter(NoteORM.user_id == user_id)

            if self.dialect == "postgresql":
                contains = cast(NoteORM.tags, JSONB).op("@>")(json.dumps([tag]))
                query = query.filter(contains)
            else:
                query = query.filter(NoteORM.tags.like(f'%"{tag}"%'))

            notes = query.order_by(NoteORM.updated_at.desc()).limit(limit).all()
            return [_note_to_dto(note) for note in notes]

    def get_note_count(self, user_id: str, folder: str | None = None) -> int:
        with self._session_scope() as session:
            query = session.query(func.count(NoteORM.id)).filter(NoteORM.user_id == user_id)
            if folder:
                query = query.filter(self._folder_filter_clause(folder))
            return int(query.scalar() or 0)

    def get_folder_stats(self, user_id: str, folder: str) -> FolderStats | None:
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

    def _search_notes_sqlite(self, user_id: str, query: str, limit: int) -> list[SearchResult]:
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
                .filter(NoteORM.user_id == user_id)
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

    def _folder_filter_clause(self, folder: str):
        like_pattern = f"{folder}/%"
        return or_(NoteORM.folder_path == folder, NoteORM.folder_path.like(like_pattern))

    # =========================================================================
    # USER SETTINGS METHODS
    # =========================================================================

    def get_user_settings(self, user_id: str) -> UserSettingsDTO:
        """
        Get user settings, creating defaults if not found.
        """
        with self._session_scope() as session:
            settings = (
                session.query(UserSettingsORM)
                .filter(UserSettingsORM.user_id == user_id)
                .one_or_none()
            )
            if settings:
                return _user_settings_to_dto(settings)

            # Create default settings
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
        """
        Update user settings, creating if not found.
        """
        with self._session_scope() as session:
            settings = (
                session.query(UserSettingsORM)
                .filter(UserSettingsORM.user_id == user_id)
                .one_or_none()
            )
            now = datetime.utcnow()

            if not settings:
                # Create with the provided values
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

    # =========================================================================
    # TODO METHODS
    # =========================================================================

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
        """
        Create a new todo.
        """
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
        """
        Get a single todo by ID.
        """
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
        """
        List todos with optional filters.
        """
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
        """
        List all todos for a specific note.
        """
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
        """
        Update a todo's title or description.
        """
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
        """
        Delete a todo.
        """
        with self._session_scope() as session:
            result = (
                session.query(TodoORM)
                .filter(TodoORM.user_id == user_id, TodoORM.id == todo_id)
                .delete(synchronize_session=False)
            )
            return result > 0

    def accept_todo(self, user_id: str, todo_id: str) -> TodoDTO | None:
        """
        Accept a suggested todo (change status from suggested to accepted).
        """
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
        """
        Mark a todo as completed.
        """
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
        """
        Accept multiple todos at once.
        Returns the number of todos accepted.
        """
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
        """
        Dismiss (delete) a suggested todo.
        """
        return self.delete_todo(user_id, todo_id)

    # =========================================================================
    # MEAL TRACKING METHODS
    # =========================================================================

    def save_meal_entry(
        self,
        user_id: str,
        transcription: str,
        metadata: MealEntryMetadata,
        food_items: list[dict] | None = None,
    ) -> str:
        """
        Create a new meal entry with associated food items.

        Args:
            user_id: The user ID who owns the meal.
            transcription: The meal transcription text.
            metadata: MealEntryMetadata with meal_type, date, time, etc.
            food_items: List of dicts with name, portion, confidence.

        Returns:
            The ID of the newly created meal entry.
        """
        from datetime import date as dt_date
        from datetime import time as dt_time

        meal_id = str(uuid4())
        now = datetime.utcnow()

        # Parse date
        meal_date = dt_date.fromisoformat(metadata.meal_date)

        # Parse time if provided
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

            # Add food items
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
        """
        Get a meal entry by ID with its food items.
        """
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
        """
        Update a meal entry.

        Returns:
            True if updated, False if not found.
        """
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
        """
        Delete a meal entry and its items (cascades).
        """
        with self._session_scope() as session:
            # Delete embedding first
            session.query(MealEmbeddingORM).filter(
                MealEmbeddingORM.user_id == user_id,
                MealEmbeddingORM.meal_entry_id == meal_id,
            ).delete(synchronize_session=False)

            # Items cascade via FK, but let's be explicit
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
        """
        List meal entries within a date range.
        """
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

            # Batch load items for all entries
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
        """
        List all meals for a specific date.
        """
        return self.list_meals_by_date_range(user_id, date, date, limit=50)

    def get_meals_calendar(
        self, user_id: str, year: int, month: int
    ) -> dict[str, list[MealCalendarEntry]]:
        """
        Get meals grouped by date for a calendar view.

        Returns:
            Dict mapping date strings to lists of MealCalendarEntry.
        """
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
        """
        Add a food item to an existing meal entry.
        """
        # Verify meal exists and belongs to user
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
        """
        Update a food item.
        """
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
        """
        Delete a food item.
        """
        with self._session_scope() as session:
            result = (
                session.query(MealItemORM)
                .filter(MealItemORM.user_id == user_id, MealItemORM.id == item_id)
                .delete(synchronize_session=False)
            )
            return result > 0

    def upsert_meal_embedding(
        self,
        user_id: str,
        meal_entry_id: str,
        embedding_model: str,
        content_hash: str,
        embedding_value: str,
    ) -> None:
        """
        Upsert a meal embedding (user-scoped).
        """
        now = datetime.utcnow()
        with self._session_scope() as session:
            existing = (
                session.query(MealEmbeddingORM)
                .filter(
                    MealEmbeddingORM.user_id == user_id,
                    MealEmbeddingORM.meal_entry_id == meal_entry_id,
                    MealEmbeddingORM.embedding_model == embedding_model,
                )
                .one_or_none()
            )
            if existing:
                existing.content_hash = content_hash
                existing.embedding = embedding_value
                existing.updated_at = now
                session.add(existing)
                return

            db_emb = MealEmbeddingORM(
                id=str(uuid4()),
                user_id=user_id,
                meal_entry_id=meal_entry_id,
                embedding_model=embedding_model,
                content_hash=content_hash,
                embedding=embedding_value,
                created_at=now,
                updated_at=now,
            )
            session.add(db_emb)

    # =========================================================================
    # FEEDBACK METHODS
    # =========================================================================

    def create_feedback(
        self,
        user_id: str,
        feedback_type: str,
        title: str,
        description: str | None = None,
        rating: int | None = None,
    ) -> FeedbackDTO:
        """
        Create a new feedback submission.
        """
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
        """
        List feedback submissions for a user.
        """
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
        """
        Mark a feedback record as having had its email notification sent.

        Args:
            feedback_id: The feedback record ID.

        Returns:
            True if updated, False if not found.
        """
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

    # =========================================================================
    # VINYL COLLECTION METHODS
    # =========================================================================

    def save_vinyl_record(
        self,
        user_id: str,
        *,
        artist: str,
        album_title: str,
        release_year: int | None = None,
        genre: list[str] | None = None,
        label: str | None = None,
        catalog_number: str | None = None,
        format: str | None = None,
        pressing_country: str | None = None,
        color: str | None = None,
        condition: str | None = None,
        notes: str | None = None,
        extraction_status: str = "manual",
        extraction_confidence: float | None = None,
        cover_image_id: str | None = None,
        tracks: list[dict] | None = None,
    ) -> str:
        record_id = str(uuid4())
        now = datetime.utcnow()

        db_record = VinylRecordORM(
            id=record_id,
            user_id=user_id,
            artist=artist,
            album_title=album_title,
            release_year=release_year,
            genre=_serialize_tags(genre or []),
            label=label,
            catalog_number=catalog_number,
            format=format,
            pressing_country=pressing_country,
            color=color,
            condition=condition,
            notes=notes,
            extraction_status=extraction_status,
            extraction_confidence=extraction_confidence,
            cover_image_id=cover_image_id,
            created_at=now,
            updated_at=now,
        )

        with self._session_scope() as session:
            session.add(db_record)

            if tracks:
                for t in tracks:
                    track_id = str(uuid4())
                    db_track = VinylTrackORM(
                        id=track_id,
                        user_id=user_id,
                        vinyl_record_id=record_id,
                        side=t.get("side"),
                        position=t.get("position"),
                        title=t.get("title", ""),
                        duration=t.get("duration"),
                        created_at=now,
                    )
                    session.add(db_track)

        return record_id

    def get_vinyl_record(self, user_id: str, record_id: str) -> VinylRecordDTO | None:
        with self._session_scope() as session:
            record = (
                session.query(VinylRecordORM)
                .filter(VinylRecordORM.user_id == user_id, VinylRecordORM.id == record_id)
                .one_or_none()
            )
            if not record:
                return None

            tracks = (
                session.query(VinylTrackORM)
                .filter(VinylTrackORM.vinyl_record_id == record_id)
                .order_by(VinylTrackORM.side, VinylTrackORM.position)
                .all()
            )

            images = (
                session.query(VinylImageORM)
                .filter(VinylImageORM.vinyl_record_id == record_id)
                .order_by(VinylImageORM.created_at)
                .all()
            )

            return _vinyl_record_to_dto(record, tracks, images)

    def list_vinyl_records(
        self,
        user_id: str,
        *,
        genre: str | None = None,
        decade: int | None = None,
        format: str | None = None,
        search: str | None = None,
        sort_by: str = "created_at",
        limit: int = 50,
        offset: int = 0,
    ) -> list[VinylRecordDTO]:
        with self._session_scope() as session:
            query = session.query(VinylRecordORM).filter(
                VinylRecordORM.user_id == user_id
            )

            if genre:
                if self.dialect == "postgresql":
                    from sqlalchemy.dialects.postgresql import JSONB as _JSONB

                    query = query.filter(
                        cast(VinylRecordORM.genre, _JSONB).op("@>")(json.dumps([genre]))
                    )
                else:
                    query = query.filter(VinylRecordORM.genre.like(f'%"{genre}"%'))

            if decade is not None:
                query = query.filter(
                    VinylRecordORM.release_year >= decade,
                    VinylRecordORM.release_year < decade + 10,
                )

            if format:
                query = query.filter(VinylRecordORM.format == format)

            if search:
                like = f"%{search}%"
                query = query.filter(
                    or_(
                        VinylRecordORM.artist.ilike(like),
                        VinylRecordORM.album_title.ilike(like),
                        VinylRecordORM.label.ilike(like),
                    )
                )

            order_map = {
                "created_at": VinylRecordORM.created_at,
                "artist": VinylRecordORM.artist,
                "album_title": VinylRecordORM.album_title,
                "release_year": VinylRecordORM.release_year,
            }
            order_col = order_map.get(sort_by, VinylRecordORM.created_at)

            if sort_by in ("artist", "album_title"):
                records = query.order_by(order_col).offset(max(offset, 0)).limit(max(limit, 1)).all()
            else:
                records = query.order_by(desc(order_col)).offset(max(offset, 0)).limit(max(limit, 1)).all()

            # Batch-load cover images for records that have one
            cover_ids = [r.cover_image_id for r in records if r.cover_image_id]
            cover_images_by_id: dict[str, VinylImageORM] = {}
            if cover_ids:
                imgs = (
                    session.query(VinylImageORM)
                    .filter(VinylImageORM.id.in_(cover_ids))
                    .all()
                )
                cover_images_by_id = {i.id: i for i in imgs}

            result = []
            for r in records:
                images = []
                if r.cover_image_id and r.cover_image_id in cover_images_by_id:
                    images = [cover_images_by_id[r.cover_image_id]]
                result.append(_vinyl_record_to_dto(r, images=images))
            return result

    def update_vinyl_record(
        self,
        user_id: str,
        record_id: str,
        *,
        artist: str | None = None,
        album_title: str | None = None,
        release_year: int | None = None,
        genre: list[str] | None = None,
        label: str | None = None,
        catalog_number: str | None = None,
        format: str | None = None,
        pressing_country: str | None = None,
        color: str | None = None,
        condition: str | None = None,
        notes: str | None = None,
        extraction_status: str | None = None,
        extraction_confidence: float | None = None,
        cover_image_id: str | None = None,
        tracks: list[dict] | None = None,
    ) -> bool:
        with self._session_scope() as session:
            record = (
                session.query(VinylRecordORM)
                .filter(VinylRecordORM.user_id == user_id, VinylRecordORM.id == record_id)
                .one_or_none()
            )
            if not record:
                return False

            if artist is not None:
                record.artist = artist
            if album_title is not None:
                record.album_title = album_title
            if release_year is not None:
                record.release_year = release_year
            if genre is not None:
                record.genre = _serialize_tags(genre)
            if label is not None:
                record.label = label
            if catalog_number is not None:
                record.catalog_number = catalog_number
            if format is not None:
                record.format = format
            if pressing_country is not None:
                record.pressing_country = pressing_country
            if color is not None:
                record.color = color
            if condition is not None:
                record.condition = condition
            if notes is not None:
                record.notes = notes
            if extraction_status is not None:
                record.extraction_status = extraction_status
            if extraction_confidence is not None:
                record.extraction_confidence = extraction_confidence
            if cover_image_id is not None:
                record.cover_image_id = cover_image_id

            record.updated_at = datetime.utcnow()
            session.add(record)

            # Replace tracks if provided
            if tracks is not None:
                session.query(VinylTrackORM).filter(
                    VinylTrackORM.vinyl_record_id == record_id,
                ).delete(synchronize_session=False)

                now = datetime.utcnow()
                for t in tracks:
                    track_id = str(uuid4())
                    db_track = VinylTrackORM(
                        id=track_id,
                        user_id=user_id,
                        vinyl_record_id=record_id,
                        side=t.get("side"),
                        position=t.get("position"),
                        title=t.get("title", ""),
                        duration=t.get("duration"),
                        created_at=now,
                    )
                    session.add(db_track)

            return True

    def delete_vinyl_record(self, user_id: str, record_id: str) -> bool:
        with self._session_scope() as session:
            # Delete embeddings
            session.query(VinylEmbeddingORM).filter(
                VinylEmbeddingORM.user_id == user_id,
                VinylEmbeddingORM.vinyl_record_id == record_id,
            ).delete(synchronize_session=False)

            # Tracks + images cascade via FK, but be explicit
            session.query(VinylTrackORM).filter(
                VinylTrackORM.vinyl_record_id == record_id,
            ).delete(synchronize_session=False)
            session.query(VinylImageORM).filter(
                VinylImageORM.vinyl_record_id == record_id,
            ).delete(synchronize_session=False)

            result = (
                session.query(VinylRecordORM)
                .filter(VinylRecordORM.user_id == user_id, VinylRecordORM.id == record_id)
                .delete(synchronize_session=False)
            )
            return result > 0

    def create_vinyl_image_pending(
        self,
        user_id: str,
        *,
        image_id: str | None = None,
        vinyl_record_id: str,
        image_type: str,
        mime_type: str,
        bytes: int,
        storage_key: str,
    ) -> VinylImageDTO:
        image_id = image_id or str(uuid4())
        now = datetime.utcnow()

        img = VinylImageORM(
            id=image_id,
            user_id=user_id,
            vinyl_record_id=vinyl_record_id,
            image_type=image_type,
            storage_key=storage_key,
            mime_type=mime_type,
            bytes=int(bytes),
            status="pending",
            created_at=now,
        )
        with self._session_scope() as session:
            session.add(img)

        return VinylImageDTO(
            id=image_id,
            user_id=user_id,
            vinyl_record_id=vinyl_record_id,
            image_type=image_type,
            storage_key=storage_key,
            mime_type=mime_type,
            bytes=int(bytes),
            status="pending",
            created_at=now,
        )

    def mark_vinyl_image_ready(self, user_id: str, image_id: str) -> VinylImageDTO | None:
        with self._session_scope() as session:
            img = (
                session.query(VinylImageORM)
                .filter(VinylImageORM.user_id == user_id, VinylImageORM.id == image_id)
                .one_or_none()
            )
            if not img:
                return None
            img.status = "ready"
            session.add(img)
            return _vinyl_image_to_dto(img)

    def get_vinyl_image(self, user_id: str, image_id: str) -> VinylImageDTO | None:
        with self._session_scope() as session:
            img = (
                session.query(VinylImageORM)
                .filter(VinylImageORM.user_id == user_id, VinylImageORM.id == image_id)
                .one_or_none()
            )
            return _vinyl_image_to_dto(img) if img else None

    def list_vinyl_images(self, user_id: str, vinyl_record_id: str) -> list[VinylImageDTO]:
        with self._session_scope() as session:
            rows = (
                session.query(VinylImageORM)
                .filter(
                    VinylImageORM.user_id == user_id,
                    VinylImageORM.vinyl_record_id == vinyl_record_id,
                )
                .order_by(VinylImageORM.created_at)
                .all()
            )
            return [_vinyl_image_to_dto(r) for r in rows]

    def delete_vinyl_image(self, user_id: str, image_id: str) -> bool:
        with self._session_scope() as session:
            result = (
                session.query(VinylImageORM)
                .filter(VinylImageORM.user_id == user_id, VinylImageORM.id == image_id)
                .delete(synchronize_session=False)
            )
            return result > 0

    def get_vinyl_collection_stats(self, user_id: str) -> dict:
        with self._session_scope() as session:
            total = (
                session.query(func.count(VinylRecordORM.id))
                .filter(VinylRecordORM.user_id == user_id)
                .scalar() or 0
            )

            artist_count = (
                session.query(func.count(func.distinct(VinylRecordORM.artist)))
                .filter(VinylRecordORM.user_id == user_id)
                .scalar() or 0
            )

            return {
                "total_records": total,
                "total_artists": artist_count,
            }

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

    def upsert_vinyl_embedding(
        self,
        user_id: str,
        vinyl_record_id: str,
        embedding_model: str,
        content_hash: str,
        embedding_value: str,
    ) -> None:
        now = datetime.utcnow()
        with self._session_scope() as session:
            existing = (
                session.query(VinylEmbeddingORM)
                .filter(
                    VinylEmbeddingORM.user_id == user_id,
                    VinylEmbeddingORM.vinyl_record_id == vinyl_record_id,
                    VinylEmbeddingORM.embedding_model == embedding_model,
                )
                .one_or_none()
            )
            if existing:
                existing.content_hash = content_hash
                existing.embedding = embedding_value
                existing.updated_at = now
                session.add(existing)
                return

            db_emb = VinylEmbeddingORM(
                id=str(uuid4()),
                user_id=user_id,
                vinyl_record_id=vinyl_record_id,
                embedding_model=embedding_model,
                content_hash=content_hash,
                embedding=embedding_value,
                created_at=now,
                updated_at=now,
            )
            session.add(db_emb)

    # ========================================================================
    # SHARING & COLLABORATION – Profiles
    # ========================================================================

    def create_user_profile(
        self,
        user_id: str,
        display_name: str,
        email: str | None = None,
        avatar_url: str | None = None,
        username: str | None = None,
    ) -> UserProfileDTO:
        with self._session_scope() as session:
            now = datetime.utcnow()
            profile_id = str(uuid4())
            db_profile = UserProfileORM(
                id=profile_id,
                user_id=user_id,
                display_name=display_name,
                username=username,
                email=email,
                avatar_url=avatar_url,
                discoverable=True,
                created_at=now,
                updated_at=now,
            )
            session.add(db_profile)
            session.flush()
            return self._profile_to_dto(db_profile)

    def get_user_profile(self, user_id: str) -> UserProfileDTO | None:
        with self._session_scope() as session:
            p = (
                session.query(UserProfileORM)
                .filter(UserProfileORM.user_id == user_id)
                .one_or_none()
            )
            return self._profile_to_dto(p) if p else None

    def get_user_profile_by_id(self, profile_id: str) -> UserProfileDTO | None:
        with self._session_scope() as session:
            p = (
                session.query(UserProfileORM)
                .filter(UserProfileORM.id == profile_id)
                .one_or_none()
            )
            return self._profile_to_dto(p) if p else None

    def update_user_profile(
        self,
        user_id: str,
        *,
        display_name: str | None = None,
        username: str | None = ...,  # type: ignore[assignment]
        bio: str | None = ...,  # type: ignore[assignment]
        discoverable: bool | None = None,
    ) -> UserProfileDTO | None:
        with self._session_scope() as session:
            p = (
                session.query(UserProfileORM)
                .filter(UserProfileORM.user_id == user_id)
                .one_or_none()
            )
            if not p:
                return None
            if display_name is not None:
                p.display_name = display_name
            if username is not ...:
                p.username = username
            if bio is not ...:
                p.bio = bio
            if discoverable is not None:
                p.discoverable = discoverable
            p.updated_at = datetime.utcnow()
            session.flush()
            return self._profile_to_dto(p)

    def update_user_profile_avatar(
        self,
        user_id: str,
        avatar_storage_key: str | None,
    ) -> UserProfileDTO | None:
        with self._session_scope() as session:
            p = (
                session.query(UserProfileORM)
                .filter(UserProfileORM.user_id == user_id)
                .one_or_none()
            )
            if not p:
                return None
            p.avatar_storage_key = avatar_storage_key
            p.updated_at = datetime.utcnow()
            session.flush()
            return self._profile_to_dto(p)

    def get_username_exists(self, username: str) -> bool:
        with self._session_scope() as session:
            return (
                session.query(UserProfileORM)
                .filter(func.lower(UserProfileORM.username) == username.lower())
                .count()
                > 0
            )

    def search_user_profiles(self, query: str, *, limit: int = 20, exclude_user_id: str | None = None) -> list[UserProfileDTO]:
        with self._session_scope() as session:
            like = f"%{query}%"
            q = session.query(UserProfileORM).filter(
                UserProfileORM.discoverable.is_(True),
                or_(
                    UserProfileORM.display_name.ilike(like),
                    UserProfileORM.email.ilike(like),
                    UserProfileORM.username.ilike(like),
                ),
            )
            if exclude_user_id:
                q = q.filter(UserProfileORM.user_id != exclude_user_id)
            results = q.limit(max(limit, 1)).all()
            return [self._profile_to_dto(p) for p in results]

    def get_user_profiles_batch(self, user_ids: list[str]) -> dict[str, UserProfileDTO]:
        if not user_ids:
            return {}
        with self._session_scope() as session:
            profiles = (
                session.query(UserProfileORM)
                .filter(UserProfileORM.user_id.in_(user_ids))
                .all()
            )
            return {p.user_id: self._profile_to_dto(p) for p in profiles}

    @staticmethod
    def _profile_to_dto(p: UserProfileORM) -> UserProfileDTO:
        return UserProfileDTO(
            id=p.id,
            user_id=p.user_id,
            display_name=p.display_name,
            username=p.username,
            email=p.email,
            avatar_url=p.avatar_url,
            avatar_storage_key=p.avatar_storage_key,
            bio=p.bio,
            discoverable=p.discoverable,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )

    # ========================================================================
    # SHARING & COLLABORATION – Friendships
    # ========================================================================

    def create_friendship(self, requester_id: str, addressee_id: str) -> FriendshipDTO:
        with self._session_scope() as session:
            now = datetime.utcnow()
            friendship = FriendshipORM(
                id=str(uuid4()),
                requester_id=requester_id,
                addressee_id=addressee_id,
                status="pending",
                created_at=now,
                updated_at=now,
            )
            session.add(friendship)
            session.flush()
            return self._friendship_to_dto(friendship)

    def get_friendship(self, friendship_id: str) -> FriendshipDTO | None:
        with self._session_scope() as session:
            f = session.query(FriendshipORM).filter(FriendshipORM.id == friendship_id).one_or_none()
            return self._friendship_to_dto(f) if f else None

    def get_friendship_between(self, user_a: str, user_b: str) -> FriendshipDTO | None:
        with self._session_scope() as session:
            f = (
                session.query(FriendshipORM)
                .filter(
                    or_(
                        (FriendshipORM.requester_id == user_a) & (FriendshipORM.addressee_id == user_b),
                        (FriendshipORM.requester_id == user_b) & (FriendshipORM.addressee_id == user_a),
                    )
                )
                .one_or_none()
            )
            return self._friendship_to_dto(f) if f else None

    def update_friendship_status(self, friendship_id: str, status: str) -> FriendshipDTO | None:
        with self._session_scope() as session:
            f = session.query(FriendshipORM).filter(FriendshipORM.id == friendship_id).one_or_none()
            if not f:
                return None
            f.status = status
            f.updated_at = datetime.utcnow()
            session.flush()
            return self._friendship_to_dto(f)

    def list_friends(self, user_id: str) -> list[FriendshipDTO]:
        with self._session_scope() as session:
            friendships = (
                session.query(FriendshipORM)
                .filter(
                    FriendshipORM.status == "accepted",
                    or_(
                        FriendshipORM.requester_id == user_id,
                        FriendshipORM.addressee_id == user_id,
                    ),
                )
                .order_by(desc(FriendshipORM.updated_at))
                .all()
            )
            return [self._friendship_to_dto(f) for f in friendships]

    def list_pending_requests(self, user_id: str) -> list[FriendshipDTO]:
        with self._session_scope() as session:
            friendships = (
                session.query(FriendshipORM)
                .filter(
                    FriendshipORM.addressee_id == user_id,
                    FriendshipORM.status == "pending",
                )
                .order_by(desc(FriendshipORM.created_at))
                .all()
            )
            return [self._friendship_to_dto(f) for f in friendships]

    def list_sent_requests(self, user_id: str) -> list[FriendshipDTO]:
        with self._session_scope() as session:
            friendships = (
                session.query(FriendshipORM)
                .filter(
                    FriendshipORM.requester_id == user_id,
                    FriendshipORM.status == "pending",
                )
                .order_by(desc(FriendshipORM.created_at))
                .all()
            )
            return [self._friendship_to_dto(f) for f in friendships]

    def are_friends(self, user_a: str, user_b: str) -> bool:
        with self._session_scope() as session:
            f = (
                session.query(FriendshipORM)
                .filter(
                    FriendshipORM.status == "accepted",
                    or_(
                        (FriendshipORM.requester_id == user_a) & (FriendshipORM.addressee_id == user_b),
                        (FriendshipORM.requester_id == user_b) & (FriendshipORM.addressee_id == user_a),
                    ),
                )
                .one_or_none()
            )
            return f is not None

    def delete_friendship(self, friendship_id: str) -> bool:
        with self._session_scope() as session:
            f = session.query(FriendshipORM).filter(FriendshipORM.id == friendship_id).one_or_none()
            if not f:
                return False
            session.delete(f)
            return True

    @staticmethod
    def _friendship_to_dto(f: FriendshipORM) -> FriendshipDTO:
        return FriendshipDTO(
            id=f.id,
            requester_id=f.requester_id,
            addressee_id=f.addressee_id,
            status=f.status,
            created_at=f.created_at,
            updated_at=f.updated_at,
        )

    # ========================================================================
    # SHARING & COLLABORATION – Resource Shares
    # ========================================================================

    def create_resource_share(
        self,
        owner_id: str,
        shared_with_id: str,
        resource_type: str,
        permission: str = "view",
    ) -> ResourceShareDTO:
        with self._session_scope() as session:
            now = datetime.utcnow()
            share = ResourceShareORM(
                id=str(uuid4()),
                owner_id=owner_id,
                shared_with_id=shared_with_id,
                resource_type=resource_type,
                permission=permission,
                status="pending",
                created_at=now,
                updated_at=now,
            )
            session.add(share)
            session.flush()
            return self._share_to_dto(share)

    def get_resource_share(self, share_id: str) -> ResourceShareDTO | None:
        with self._session_scope() as session:
            s = session.query(ResourceShareORM).filter(ResourceShareORM.id == share_id).one_or_none()
            return self._share_to_dto(s) if s else None

    def update_share_status(self, share_id: str, status: str) -> ResourceShareDTO | None:
        with self._session_scope() as session:
            s = session.query(ResourceShareORM).filter(ResourceShareORM.id == share_id).one_or_none()
            if not s:
                return None
            s.status = status
            s.updated_at = datetime.utcnow()
            session.flush()
            return self._share_to_dto(s)

    def list_shares_as_owner(self, owner_id: str) -> list[ResourceShareDTO]:
        with self._session_scope() as session:
            shares = (
                session.query(ResourceShareORM)
                .filter(ResourceShareORM.owner_id == owner_id)
                .order_by(desc(ResourceShareORM.created_at))
                .all()
            )
            return [self._share_to_dto(s) for s in shares]

    def list_shares_as_recipient(self, user_id: str, *, status: str | None = None) -> list[ResourceShareDTO]:
        with self._session_scope() as session:
            q = session.query(ResourceShareORM).filter(ResourceShareORM.shared_with_id == user_id)
            if status:
                q = q.filter(ResourceShareORM.status == status)
            shares = q.order_by(desc(ResourceShareORM.created_at)).all()
            return [self._share_to_dto(s) for s in shares]

    def list_accepted_shares_for_resource(self, owner_id: str, resource_type: str) -> list[ResourceShareDTO]:
        with self._session_scope() as session:
            shares = (
                session.query(ResourceShareORM)
                .filter(
                    ResourceShareORM.owner_id == owner_id,
                    ResourceShareORM.resource_type == resource_type,
                    ResourceShareORM.status == "accepted",
                )
                .all()
            )
            return [self._share_to_dto(s) for s in shares]

    def get_share_between(self, owner_id: str, shared_with_id: str, resource_type: str) -> ResourceShareDTO | None:
        with self._session_scope() as session:
            s = (
                session.query(ResourceShareORM)
                .filter(
                    ResourceShareORM.owner_id == owner_id,
                    ResourceShareORM.shared_with_id == shared_with_id,
                    ResourceShareORM.resource_type == resource_type,
                )
                .one_or_none()
            )
            return self._share_to_dto(s) if s else None

    def delete_share(self, share_id: str) -> bool:
        with self._session_scope() as session:
            s = session.query(ResourceShareORM).filter(ResourceShareORM.id == share_id).one_or_none()
            if not s:
                return False
            session.delete(s)
            return True

    def has_access(self, viewer_id: str, owner_id: str, resource_type: str, min_permission: str = "view") -> bool:
        if viewer_id == owner_id:
            return True
        allowed = ["view", "edit"] if min_permission == "view" else ["edit"]
        with self._session_scope() as session:
            s = (
                session.query(ResourceShareORM)
                .filter(
                    ResourceShareORM.owner_id == owner_id,
                    ResourceShareORM.shared_with_id == viewer_id,
                    ResourceShareORM.resource_type == resource_type,
                    ResourceShareORM.status == "accepted",
                    ResourceShareORM.permission.in_(allowed),
                )
                .one_or_none()
            )
            return s is not None

    def get_calendar_member_ids(self, owner_id: str) -> list[str]:
        with self._session_scope() as session:
            shares = (
                session.query(ResourceShareORM)
                .filter(
                    ResourceShareORM.owner_id == owner_id,
                    ResourceShareORM.resource_type == "meal_calendar",
                    ResourceShareORM.status == "accepted",
                    ResourceShareORM.permission == "edit",
                )
                .all()
            )
            return [owner_id] + [s.shared_with_id for s in shares]

    def revoke_shares_between(self, user_a: str, user_b: str) -> int:
        """Revoke all shares between two users (used when unfriending)."""
        with self._session_scope() as session:
            shares = (
                session.query(ResourceShareORM)
                .filter(
                    or_(
                        (ResourceShareORM.owner_id == user_a) & (ResourceShareORM.shared_with_id == user_b),
                        (ResourceShareORM.owner_id == user_b) & (ResourceShareORM.shared_with_id == user_a),
                    )
                )
                .all()
            )
            count = 0
            for s in shares:
                s.status = "revoked"
                s.updated_at = datetime.utcnow()
                count += 1
            return count

    @staticmethod
    def _share_to_dto(s: ResourceShareORM) -> ResourceShareDTO:
        return ResourceShareDTO(
            id=s.id,
            owner_id=s.owner_id,
            shared_with_id=s.shared_with_id,
            resource_type=s.resource_type,
            permission=s.permission,
            status=s.status,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )

    # ========================================================================
    # SHARING & COLLABORATION – Multi-User Queries
    # ========================================================================

    def list_vinyl_records_for_user(
        self,
        target_user_id: str,
        *,
        genre: str | None = None,
        decade: int | None = None,
        format: str | None = None,
        search: str | None = None,
        sort_by: str = "created_at",
        limit: int = 50,
        offset: int = 0,
    ) -> list[VinylRecordDTO]:
        """List vinyl records for a specific user (used for shared library access)."""
        return self.list_vinyl_records(
            target_user_id,
            genre=genre,
            decade=decade,
            format=format,
            search=search,
            sort_by=sort_by,
            limit=limit,
            offset=offset,
        )

    def get_vinyl_record_for_user(self, target_user_id: str, record_id: str) -> VinylRecordDTO | None:
        """Get a vinyl record for a specific user (used for shared library access)."""
        return self.get_vinyl_record(target_user_id, record_id)

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
        """List meals for multiple users (used for shared calendar)."""
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
        """Get calendar view of meals for multiple users.

        Returns same typed format as get_meals_calendar.
        """
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

    def _configure_engine(
        self,
        db_path: Path | None,
        database_url: str | None,
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

