"""Vinyl collection storage mixin."""

from __future__ import annotations

import json
from datetime import datetime
from uuid import uuid4

from sqlalchemy import cast, desc, func, or_

from ...database import VinylEmbedding as VinylEmbeddingORM
from ...database import VinylImage as VinylImageORM
from ...database import VinylRecord as VinylRecordORM
from ...database import VinylTrack as VinylTrackORM
from ..models import VinylImage as VinylImageDTO
from ..models import VinylRecord as VinylRecordDTO
from ..models import VinylTrack as VinylTrackDTO
from .engine import _deserialize_tags, _serialize_tags


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


class VinylStorageMixin:
    """Vinyl record, image, track, and collection operations."""

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
            session.query(VinylEmbeddingORM).filter(
                VinylEmbeddingORM.user_id == user_id,
                VinylEmbeddingORM.vinyl_record_id == record_id,
            ).delete(synchronize_session=False)

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

    # -----------------------------------------------------------------------
    # Multi-user queries (shared library)
    # -----------------------------------------------------------------------

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
        return self.get_vinyl_record(target_user_id, record_id)
