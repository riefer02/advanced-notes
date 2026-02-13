"""Audio clip storage mixin."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import desc

from ...database import AudioClip as AudioClipORM
from ..models import AudioClip as AudioClipDTO


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


class AudioStorageMixin:
    """Audio clip CRUD operations."""

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
