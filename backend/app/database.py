"""
SQLAlchemy models for database schema definition and migrations.

These models are primarily used for Alembic migrations, not for ORM queries.
The existing storage.py adapter pattern is maintained for actual database operations.
"""

from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    Float,
    TIMESTAMP,
    Index,
    create_engine,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
import os

Base = declarative_base()


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
    """Create SQLAlchemy engine based on environment"""
    return create_engine(get_database_url())

