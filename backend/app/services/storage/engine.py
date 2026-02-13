"""Storage engine base: connection management, session scoping, shared utilities."""

from __future__ import annotations

import json
from collections.abc import Generator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from ...database import Base, create_engine_for_url, get_engine, get_session_factory

# ---------------------------------------------------------------------------
# SQLite FTS setup
# ---------------------------------------------------------------------------

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
        active_table = "notes_fts_live"

        conn.exec_driver_sql("DROP TRIGGER IF EXISTS notes_ai")
        conn.exec_driver_sql("DROP TRIGGER IF EXISTS notes_au")
        conn.exec_driver_sql("DROP TRIGGER IF EXISTS notes_ad")

        conn.exec_driver_sql(f"DROP TABLE IF EXISTS {active_table}")
        conn.exec_driver_sql(_sqlite_fts_statements(active_table)[0])

        conn.exec_driver_sql(
            f"INSERT INTO {active_table}(note_id, title, content, tags) "
            "SELECT id, title, content, tags FROM notes"
        )

        conn.exec_driver_sql(f"SELECT count(*) FROM {active_table}").scalar_one()

        _create_or_update_triggers(conn, active_table)

        return active_table

    with engine.begin() as conn:
        for statement in _sqlite_fts_statements("notes_fts"):
            try:
                conn.exec_driver_sql(statement)
            except OperationalError as e:
                if "vtable constructor failed" in str(e).lower():
                    break
                raise

        active_table = "notes_fts" if _fts_is_healthy(conn) else _repair_fts(conn)

        if active_table == "notes_fts":
            _create_or_update_triggers(conn, "notes_fts")

    _SQLITE_SCHEMA_CACHE[cache_key] = active_table
    return active_table


# ---------------------------------------------------------------------------
# Shared tag / datetime serialization helpers
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# StorageEngine base class
# ---------------------------------------------------------------------------


class StorageEngine:
    """Base class providing database connection and session management."""

    def __init__(self, db_path: Path | None = None, database_url: str | None = None):
        self.engine, self.session_factory = self._configure_engine(db_path, database_url)
        self.dialect = self.engine.dialect.name
        self.sqlite_fts_table = "notes_fts"

        if self.dialect == "sqlite":
            self.sqlite_fts_table = _ensure_sqlite_schema(self.engine)

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
