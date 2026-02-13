"""NoteStorage facade: composes all feature mixins into a single class."""

from __future__ import annotations

from .audio import AudioStorageMixin
from .embeddings import EmbeddingStorageMixin
from .engine import StorageEngine
from .meals import MealStorageMixin
from .notes import NoteStorageMixin
from .settings import SettingsStorageMixin
from .sharing import SharingStorageMixin
from .todos import TodoStorageMixin
from .vinyl import VinylStorageMixin


class NoteStorage(
    NoteStorageMixin,
    AudioStorageMixin,
    EmbeddingStorageMixin,
    TodoStorageMixin,
    MealStorageMixin,
    VinylStorageMixin,
    SharingStorageMixin,
    SettingsStorageMixin,
    StorageEngine,
):
    """
    SQLAlchemy-based storage facade used by Flask routes and services.

    This is the primary data access layer for the application. All methods
    enforce user isolation by requiring `user_id` as the first parameter.

    Composed from feature-specific mixins for maintainability:
    - NoteStorageMixin: Note CRUD, folders, tags, search
    - AudioStorageMixin: Audio clip lifecycle
    - EmbeddingStorageMixin: Embeddings, semantic search, hybrid retrieval
    - TodoStorageMixin: Todo CRUD
    - MealStorageMixin: Meal tracking, calendar
    - VinylStorageMixin: Vinyl collection, images, tracks
    - SharingStorageMixin: Profiles, friendships, resource shares
    - SettingsStorageMixin: User settings, digests, ask history, feedback
    - StorageEngine: Connection management, session scoping
    """

    pass
