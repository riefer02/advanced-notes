"""
Central SQLAlchemy models and session utilities.

These definitions power both Alembic migrations and runtime ORM queries.
"""

import os
from contextlib import contextmanager
from typing import Generator, Optional

from sqlalchemy import (
    Column,
    Float,
    Index,
    Integer,
    String,
    Text,
    TIMESTAMP,
    create_engine,
    event,
)
from sqlalchemy.engine import Engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.sql import func

Base = declarative_base()

_engine: Optional[Engine] = None
_SessionFactory: Optional[sessionmaker] = None


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
    else:
        # SQLite (development)
        from pathlib import Path
        db_path = Path(__file__).parent.parent / ".notes.db"
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


def create_engine_for_url(database_url: Optional[str] = None) -> Engine:
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

