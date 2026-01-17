"""
Central SQLAlchemy models and session utilities.

These definitions power both Alembic migrations and runtime ORM queries.
"""

import os
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import (
    TIMESTAMP,
    Boolean,
    Column,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    create_engine,
    event,
)
from sqlalchemy.engine import Engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.sql import func
from sqlalchemy.types import TypeDecorator, UserDefinedType

Base = declarative_base()

_engine: Engine | None = None
_SessionFactory: sessionmaker | None = None


class Note(Base):
    """
    Notes table with user isolation.
    
    Schema supports both SQLite (dev) and PostgreSQL (prod).
    """
    __tablename__ = "notes"
    
    # Core fields
    id = Column(String(36), primary_key=True)
    user_id = Column(String(255), nullable=False, index=True)  # Clerk user ID
    title = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    folder_path = Column(Text, nullable=False, index=True)
    
    # Tags - stored as JSON/JSONB
    tags = Column(Text, nullable=True)  # JSON string for SQLite, JSONB for PostgreSQL
    
    # Timestamps
    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP, nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Metadata
    word_count = Column(Integer, default=0)
    confidence = Column(Float, nullable=True)
    transcription_duration = Column(Float, nullable=True)
    model_version = Column(String(50), nullable=True)
    
    # Indexes
    __table_args__ = (
        Index('idx_notes_user_id', 'user_id'),
        Index('idx_notes_user_folder', 'user_id', 'folder_path'),
        Index('idx_notes_user_created', 'user_id', 'created_at'),
        Index('idx_notes_user_updated', 'user_id', 'updated_at'),
    )


class Digest(Base):
    """
    Digest table for storing generated summaries of notes.
    """
    __tablename__ = "digests"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(255), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())

    __table_args__ = (
        Index('idx_digests_user_id', 'user_id'),
        Index('idx_digests_user_created', 'user_id', 'created_at'),
    )


class AskHistory(Base):
    """
    Persisted history of Ask Notes queries/results (compact form), with user isolation.
    """

    __tablename__ = "ask_history"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(255), nullable=False, index=True)

    query = Column(Text, nullable=False)
    query_plan_json = Column(Text, nullable=False)
    answer_markdown = Column(Text, nullable=False)
    cited_note_ids_json = Column(Text, nullable=False)
    source_scores_json = Column(Text, nullable=True)

    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_ask_history_user_id", "user_id"),
        Index("idx_ask_history_user_created", "user_id", "created_at"),
    )


class _PGVector(UserDefinedType):
    """pgvector column type (declared without adding third-party dependencies)."""

    def __init__(self, dims: int):
        self.dims = dims

    def get_col_spec(self, **kw):
        return f"vector({self.dims})"


class VectorEmbedding(TypeDecorator):
    """
    Cross-dialect embedding type:
    - SQLite: stored as TEXT (JSON list of floats)
    - Postgres: stored as pgvector vector(dims)
    """

    impl = Text
    cache_ok = True

    def __init__(self, dims: int, **kwargs):
        super().__init__(**kwargs)
        self.dims = dims

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(_PGVector(self.dims))
        return dialect.type_descriptor(Text())


class NoteEmbedding(Base):
    """
    Embeddings for semantic search, with user isolation.
    """

    __tablename__ = "note_embeddings"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(255), nullable=False, index=True)
    note_id = Column(String(36), nullable=False, index=True)

    embedding_model = Column(String(100), nullable=False)
    content_hash = Column(String(64), nullable=False)
    embedding = Column(VectorEmbedding(1536), nullable=False)

    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())
    updated_at = Column(
        TIMESTAMP, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_note_embeddings_user_note", "user_id", "note_id"),
        Index("idx_note_embeddings_user_model", "user_id", "embedding_model"),
        Index("idx_note_embeddings_user_updated", "user_id", "updated_at"),
    )


class AudioClip(Base):
    """
    Audio clip metadata (bytes stored in S3/object storage; metadata stored here), with user isolation.
    """

    __tablename__ = "audio_clips"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(255), nullable=False, index=True)

    # Optional association to a note. For v1 we treat the most-recent clip for a note as its "primary".
    note_id = Column(String(36), nullable=True, index=True)

    # Object storage location.
    bucket = Column(String(255), nullable=True)
    storage_key = Column(Text, nullable=False)

    # Media metadata.
    mime_type = Column(String(100), nullable=False)
    bytes = Column(Integer, nullable=False)
    duration_ms = Column(Integer, nullable=True)

    # Simple lifecycle state: pending (upload not completed) / ready (playable) / failed.
    status = Column(String(20), nullable=False, server_default="pending")

    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_audio_clips_user_id", "user_id"),
        Index("idx_audio_clips_user_note", "user_id", "note_id"),
        Index("idx_audio_clips_user_created", "user_id", "created_at"),
    )


class UserSettings(Base):
    """
    User settings for preferences like auto-accept todos.
    """

    __tablename__ = "user_settings"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(255), nullable=False, unique=True, index=True)

    # Todo extraction behavior
    auto_accept_todos = Column(Boolean, nullable=False, server_default="0")

    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())
    updated_at = Column(
        TIMESTAMP, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (Index("idx_user_settings_user_id", "user_id"),)


class Todo(Base):
    """
    Todos extracted from notes or created manually.
    Status: suggested (needs user review), accepted (active todo), completed (done).
    """

    __tablename__ = "todos"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(255), nullable=False, index=True)

    # Optional FK to source note. Nullable for manual todos or if note was deleted.
    note_id = Column(String(36), ForeignKey("notes.id", ondelete="SET NULL"), nullable=True, index=True)

    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)

    # Status: suggested | accepted | completed
    status = Column(String(20), nullable=False, server_default="suggested")

    # AI extraction metadata
    confidence = Column(Float, nullable=True)
    extraction_context = Column(Text, nullable=True)

    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())
    updated_at = Column(
        TIMESTAMP, nullable=False, server_default=func.now(), onupdate=func.now()
    )
    completed_at = Column(TIMESTAMP, nullable=True)

    __table_args__ = (
        Index("idx_todos_user_id", "user_id"),
        Index("idx_todos_user_status", "user_id", "status"),
        Index("idx_todos_user_note", "user_id", "note_id"),
        Index("idx_todos_user_created", "user_id", "created_at"),
    )


def get_database_url() -> str:
    """
    Get database URL from environment, defaulting to SQLite.
    
    Returns:
        Database connection string
    """
    database_url = os.getenv("DATABASE_URL")
    
    if database_url:
        # PostgreSQL
        return database_url
    
    # Debug/Safety check
    flask_env = os.getenv("FLASK_ENV", "development")
    if flask_env == "production":
        # In production, we must have DATABASE_URL. Do not fallback to SQLite.
        # Check if we have RAILWAY_TCP_PROXY_DOMAIN as an alternative indicator
        raise ValueError("DATABASE_URL environment variable is not set in production environment!")

    # SQLite (development)
    from pathlib import Path
    db_path = Path(__file__).parent.parent / ".notes.db"
    print(f"WARNING: using SQLite database at {db_path}")
    return f"sqlite:///{db_path}"


def get_engine():
    """Get (and lazily create) the shared SQLAlchemy engine."""
    global _engine
    if _engine is None:
        _engine = create_engine_for_url()
    return _engine


def get_session_factory() -> sessionmaker:
    """Return the configured session factory."""
    global _SessionFactory
    if _SessionFactory is None:
        _SessionFactory = sessionmaker(
            bind=get_engine(),
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
            future=True,
        )
    return _SessionFactory


@contextmanager
def get_session() -> Generator[Session, None, None]:
    """
    Provide a transactional scope around a series of operations.
    
    Example:
        with get_session() as session:
            session.query(...)
    """
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def create_engine_for_url(database_url: str | None = None) -> Engine:
    """Build a SQLAlchemy engine for the given URL (or default environment)."""
    url = database_url or get_database_url()
    engine = create_engine(
        url,
        future=True,
        echo=False,
        pool_pre_ping=True,
    )

    if engine.dialect.name == "sqlite":
        event.listen(engine, "connect", _set_sqlite_pragmas)

    return engine


def _set_sqlite_pragmas(dbapi_connection, connection_record):
    """
    Apply SQLite pragmas for better consistency (WAL, foreign keys).
    
    This mirrors the previous manual adapter initialization logic.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()

