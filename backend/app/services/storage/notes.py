"""Note storage mixin: CRUD, folders, tags, search."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import case, cast, desc, func, or_, text
from sqlalchemy.dialects.postgresql import JSONB

from ...database import Folder as FolderORM
from ...database import Note as NoteORM
from ...database import NoteEmbedding as NoteEmbeddingORM
from ...database import NoteRevision as NoteRevisionORM
from ...database import NoteTag as NoteTagORM
from ...database import Tag as TagORM
from ...database import Transcript as TranscriptORM
from ..models import FolderNode, FolderStats, NoteMetadata, SearchResult
from ..models import Note as NoteDTO
from ..models import NoteRevision as NoteRevisionDTO
from .engine import _coerce_datetime, _deserialize_tags, _serialize_tags

NOTE_VIEW_ACTIVE = "active"
NOTE_VIEW_ARCHIVED = "archived"
NOTE_VIEW_TRASH = "trash"
NOTE_VIEWS = (NOTE_VIEW_ACTIVE, NOTE_VIEW_ARCHIVED, NOTE_VIEW_TRASH)

_FTS_TOKEN_RE = re.compile(r"[\w'’-]+", re.UNICODE)


def _normalize_tags(tags: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in tags or []:
        name = str(raw).strip().lower()[:50]
        if name and name not in seen:
            seen.add(name)
            cleaned.append(name)
        if len(cleaned) >= 20:
            break
    return cleaned


def _fts5_query(query: str, max_terms: int = 16) -> str:
    """Turn arbitrary user text into a safe FTS5 MATCH expression.

    Parameter binding prevents SQL injection but not FTS5 syntax errors:
    ``react OR`` or ``foo"bar`` raise OperationalError and become a 500. Quote
    every token, escape embedded quotes, and add a prefix wildcard outside the
    quotes.
    """
    tokens = _FTS_TOKEN_RE.findall(query or "")[:max_terms]
    if not tokens:
        return '""'
    parts = ['"' + token.replace('"', '""') + '"' for token in tokens]
    if len(parts[-1]) > 4:
        parts[-1] += "*"
    return " AND ".join(parts)


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
        folder_id=row.get("folder_id"),
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
        folder_id=note.folder_id,
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


def _normalize_folder_path(path: str | None) -> str:
    parts = [part.strip() for part in (path or "").split("/") if part.strip()]
    return "/".join(parts)[:500] or "inbox"


class NoteStorageMixin:
    """Note CRUD, folders, tags, and search operations."""

    def _ensure_folder(self, session, user_id: str, path: str) -> str:
        normalized = _normalize_folder_path(path)
        folder = (
            session.query(FolderORM)
            .filter(FolderORM.user_id == user_id, FolderORM.path == normalized)
            .one_or_none()
        )
        if folder is None:
            folder = FolderORM(
                id=str(uuid4()),
                user_id=user_id,
                path=normalized,
                name=normalized.rsplit("/", 1)[-1],
                parent_path=(
                    normalized.rsplit("/", 1)[0] if "/" in normalized else None
                ),
            )
            session.add(folder)
            session.flush()
        return folder.id

    def _sync_note_tags(self, session, note: NoteORM) -> None:
        """Keep normalized tags in sync with the legacy notes.tags JSON cache."""
        session.query(NoteTagORM).filter(
            NoteTagORM.note_id == note.id
        ).delete(synchronize_session=False)

        seen: set[str] = set()
        for raw_name in _deserialize_tags(note.tags):
            name = str(raw_name).strip()
            name_norm = name.lower()[:100]
            if not name_norm or name_norm in seen:
                continue
            seen.add(name_norm)

            tag = (
                session.query(TagORM)
                .filter(
                    TagORM.user_id == note.user_id,
                    TagORM.name_norm == name_norm,
                )
                .one_or_none()
            )
            if tag is None:
                tag = TagORM(
                    id=str(uuid4()),
                    user_id=note.user_id,
                    name=name[:100],
                    name_norm=name_norm,
                )
                session.add(tag)
                session.flush()

            session.add(
                NoteTagORM(
                    note_id=note.id,
                    tag_id=tag.id,
                    user_id=note.user_id,
                )
            )

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
            tags=_serialize_tags(_normalize_tags(metadata.tags)),
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
            db_note.folder_id = self._ensure_folder(
                session, user_id, db_note.folder_path
            )
            session.add(db_note)
            self._sync_note_tags(session, db_note)

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
                note.folder_id = self._ensure_folder(
                    session, user_id, note.folder_path
                )
                note.tags = _serialize_tags(_normalize_tags(metadata.tags))
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
                self._sync_note_tags(session, note)

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
            note.folder_id = self._ensure_folder(
                session, user_id, note.folder_path
            )
            note.tags = revision.tags
            note.word_count = revision.word_count or len(revision.content.split())
            self._sync_note_tags(session, note)
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

    def rename_folder(self, user_id: str, old_path: str, new_path: str) -> int:
        """Rename a folder subtree. Returns notes updated, or a negative code.

        -1 not found, -2 target exists, -3 invalid move.
        """
        old = _normalize_folder_path(old_path)
        new = _normalize_folder_path(new_path)
        if new == old or new.startswith(f"{old}/"):
            return -3

        with self._session_scope() as session:
            folders = (
                session.query(FolderORM)
                .filter(
                    FolderORM.user_id == user_id,
                    or_(
                        FolderORM.path == old,
                        FolderORM.path.like(f"{old}/%"),
                    ),
                )
                .all()
            )
            if not folders:
                return -1

            collision = (
                session.query(FolderORM)
                .filter(
                    FolderORM.user_id == user_id,
                    or_(
                        FolderORM.path == new,
                        FolderORM.path.like(f"{new}/%"),
                    ),
                )
                .first()
            )
            if collision:
                return -2

            now = datetime.utcnow()
            new_paths: dict[str, str] = {}
            for folder in folders:
                suffix = folder.path[len(old) :]
                renamed = f"{new}{suffix}"
                new_paths[folder.path] = renamed
                folder.path = renamed
                folder.name = renamed.rsplit("/", 1)[-1]
                folder.parent_path = (
                    renamed.rsplit("/", 1)[0] if "/" in renamed else None
                )
                folder.updated_at = now
                session.add(folder)

            folder_id_by_path = {folder.path: folder.id for folder in folders}
            notes = (
                session.query(NoteORM)
                .filter(
                    NoteORM.user_id == user_id,
                    or_(
                        NoteORM.folder_path == old,
                        NoteORM.folder_path.like(f"{old}/%"),
                    ),
                )
                .all()
            )
            for note in notes:
                renamed = new_paths.get(note.folder_path)
                if renamed is None:
                    suffix = note.folder_path[len(old) :]
                    renamed = f"{new}{suffix}"
                note.folder_path = renamed
                note.folder_id = folder_id_by_path.get(renamed)
                note.updated_at = now
                session.add(note)

            return len(notes)

    def create_transcript(
        self,
        user_id: str,
        *,
        note_id: str | None,
        text: str,
        audio_clip_id: str | None = None,
        language: str | None = None,
        model: str | None = None,
        duration_seconds: float | None = None,
        confidence: float | None = None,
    ) -> str:
        transcript_id = str(uuid4())
        with self._session_scope() as session:
            session.add(
                TranscriptORM(
                    id=transcript_id,
                    user_id=user_id,
                    note_id=note_id,
                    audio_clip_id=audio_clip_id,
                    text=text,
                    language=(language or "")[:20] or None,
                    model=(model or "")[:100] or None,
                    duration_seconds=duration_seconds,
                    confidence=confidence,
                )
            )
        return transcript_id

    def list_transcripts_for_note(self, user_id: str, note_id: str) -> list[dict]:
        with self._session_scope() as session:
            rows = (
                session.query(TranscriptORM)
                .filter(
                    TranscriptORM.user_id == user_id,
                    TranscriptORM.note_id == note_id,
                )
                .order_by(desc(TranscriptORM.created_at))
                .all()
            )
            return [
                {
                    "id": row.id,
                    "note_id": row.note_id,
                    "audio_clip_id": row.audio_clip_id,
                    "text": row.text,
                    "language": row.language,
                    "model": row.model,
                    "duration_seconds": row.duration_seconds,
                    "confidence": row.confidence,
                    "created_at": row.created_at.isoformat()
                    if row.created_at
                    else None,
                }
                for row in rows
            ]

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
                session.query(TagORM.name)
                .join(NoteTagORM, NoteTagORM.tag_id == TagORM.id)
                .join(NoteORM, NoteORM.id == NoteTagORM.note_id)
                .filter(
                    NoteORM.user_id == user_id,
                    *_visibility_clauses(),
                )
                .distinct()
                .order_by(TagORM.name)
                .all()
            )
            normalized = [row[0] for row in rows]
            if normalized:
                return normalized

            # Legacy fallback for databases not yet backfilled.
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
        name_norm = tag.strip().lower()
        with self._session_scope() as session:
            has_normalized_tags = (
                session.query(TagORM.id)
                .filter(TagORM.user_id == user_id)
                .first()
                is not None
            )

            if has_normalized_tags:
                notes = (
                    session.query(NoteORM)
                    .join(NoteTagORM, NoteTagORM.note_id == NoteORM.id)
                    .join(TagORM, TagORM.id == NoteTagORM.tag_id)
                    .filter(
                        NoteORM.user_id == user_id,
                        TagORM.name_norm == name_norm,
                        *_visibility_clauses(),
                    )
                    .order_by(NoteORM.updated_at.desc())
                    .limit(limit)
                    .all()
                )
                return [_note_to_dto(note) for note in notes]

            # Legacy fallback for databases not yet backfilled.
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
                session.query(TagORM.name, func.count(NoteTagORM.tag_id))
                .join(NoteTagORM, NoteTagORM.tag_id == TagORM.id)
                .join(NoteORM, NoteORM.id == NoteTagORM.note_id)
                .filter(
                    NoteORM.user_id == user_id,
                    self._folder_filter_clause(folder),
                    *_visibility_clauses(),
                )
                .group_by(TagORM.name)
                .order_by(func.count(NoteTagORM.tag_id).desc())
                .limit(5)
                .all()
            )
            top_tags = [name for name, _count in tag_rows]

            if not top_tags:
                legacy_rows = (
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
                for (value,) in legacy_rows:
                    for tag in _deserialize_tags(value):
                        tag_counts[tag] = tag_counts.get(tag, 0) + 1
                top_tags = [
                    tag
                    for tag, _count in sorted(
                        tag_counts.items(), key=lambda item: item[1], reverse=True
                    )[:5]
                ]

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
                        "match_query": _fts5_query(query),
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
        # `search_vector` is a generated STORED column with a GIN index; it is
        # created by migration for Postgres only (SQLite uses FTS5).
        sql = text(
            """
            SELECT
                n.id,
                ts_rank_cd(n.search_vector, q, 32) AS rank,
                ts_headline(
                    'simple',
                    n.content,
                    q,
                    'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=24, MinWords=8'
                ) AS snippet
            FROM notes n, websearch_to_tsquery('simple', :query) AS q
            WHERE n.user_id = :user_id
              AND n.deleted_at IS NULL
              AND n.archived_at IS NULL
              AND n.search_vector @@ q
            ORDER BY rank DESC
            LIMIT :limit
            """
        )

        with self._session_scope() as session:
            rows = (
                session.execute(
                    sql,
                    {
                        "user_id": user_id,
                        "query": query,
                        "limit": max(limit, 1),
                    },
                )
                .mappings()
                .all()
            )

        ids = [row["id"] for row in rows]
        notes = self.get_notes_by_ids(user_id, ids)
        note_by_id = {note.id: note for note in notes}

        results: list[SearchResult] = []
        for row in rows:
            note = note_by_id.get(row["id"])
            if note is None:
                continue
            results.append(
                SearchResult(
                    note=note,
                    rank=float(row.get("rank") or 0.0),
                    snippet=row.get("snippet") or "",
                )
            )
        return results
