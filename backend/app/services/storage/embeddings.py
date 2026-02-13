"""Embedding storage mixin: note/meal/vinyl embeddings and semantic search."""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import bindparam, cast, or_, text
from sqlalchemy.dialects.postgresql import JSONB

from ...database import MealEmbedding as MealEmbeddingORM
from ...database import Note as NoteORM
from ...database import NoteEmbedding as NoteEmbeddingORM
from ...database import VinylEmbedding as VinylEmbeddingORM
from ..embeddings import vector_from_json


class EmbeddingStorageMixin:
    """Embedding CRUD, semantic search, and hybrid retrieval operations."""

    def upsert_note_embedding(
        self,
        user_id: str,
        note_id: str,
        embedding_model: str,
        content_hash: str,
        embedding_value: str,
    ) -> None:
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
            if s.startswith("[") and (s.endswith("]") or s.endswith("]::vector")):
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

        from ..embeddings import cosine_similarity, normalize_similarity

        scored = []
        for row in rows:
            vec = self._parse_embedding(row.embedding)
            sim = normalize_similarity(cosine_similarity(q_vec, vec))
            scored.append({"note_id": row.note_id, "score": float(sim)})

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:limit]

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
        folder_paths = [p for p in (folder_paths or []) if p]
        include_tags = [t for t in (include_tags or []) if t]
        exclude_tags = [t for t in (exclude_tags or []) if t]

        start_dt, end_dt = self._date_range_to_datetimes(start_date, end_date)

        any_filter = bool(folder_paths or include_tags or exclude_tags or start_dt or end_dt)
        if not any_filter:
            return None

        with self._session_scope() as session:
            query = session.query(NoteORM.id).filter(NoteORM.user_id == user_id)

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
        limit = max(1, min(limit, 50))
        candidate_ids = self._filter_candidate_note_ids(
            user_id=user_id,
            folder_paths=folder_paths,
            include_tags=include_tags,
            exclude_tags=exclude_tags,
            start_date=start_date,
            end_date=end_date,
        )

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

        fts_scores: dict[str, float] = {}
        if fts_results:
            if self.dialect == "sqlite":
                for r in fts_results:
                    fts_scores[r.note.id] = 1.0 / (1.0 + float(r.rank or 0.0))
            else:
                max_rank = max(float(r.rank or 0.0) for r in fts_results) or 1.0
                for r in fts_results:
                    fts_scores[r.note.id] = float(r.rank or 0.0) / max_rank

        semantic_scores: dict[str, float] = {
            h["note_id"]: float(h.get("score") or 0.0) for h in semantic_hits
        }

        note_ids = set(semantic_scores.keys()) | set(fts_scores.keys())
        if candidate_ids is not None:
            note_ids &= set(candidate_ids)

        def blended(nid: str) -> float:
            s = semantic_scores.get(nid, 0.0)
            f = fts_scores.get(nid, 0.0)
            return 0.65 * s + 0.35 * f

        ranked_ids = sorted(note_ids, key=blended, reverse=True)[:limit]
        notes = self.get_notes_by_ids(user_id, ranked_ids)
        note_by_id = {n.id: n for n in notes}

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

    # -----------------------------------------------------------------------
    # Meal embeddings
    # -----------------------------------------------------------------------

    def upsert_meal_embedding(
        self,
        user_id: str,
        meal_entry_id: str,
        embedding_model: str,
        content_hash: str,
        embedding_value: str,
    ) -> None:
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

    # -----------------------------------------------------------------------
    # Vinyl embeddings
    # -----------------------------------------------------------------------

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
