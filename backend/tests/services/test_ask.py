"""
Lightweight tests for the Ask Notes retrieval stack.

These tests avoid calling OpenAI by inserting fake embeddings directly.
Run:
  cd backend && uv run python -m tests.services.test_ask
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.database import Note as NoteORM
from app.services.embeddings import vector_to_json
from app.services.models import NoteMetadata
from app.services.storage import NoteStorage


def _set_note_created_at(storage: NoteStorage, user_id: str, note_id: str, created_at: datetime) -> None:
    with storage._session_scope() as session:  # noqa: SLF001 - test helper
        note = (
            session.query(NoteORM)
            .filter(NoteORM.user_id == user_id, NoteORM.id == note_id)
            .one()
        )
        note.created_at = created_at
        note.updated_at = created_at
        session.add(note)


def test_semantic_search_is_user_scoped() -> None:
    test_db = Path("test_ask.db").resolve()
    test_db.unlink(missing_ok=True)

    storage = NoteStorage(db_path=test_db)

    user_a = "user-a"
    user_b = "user-b"

    note_a = storage.save_note(
        user_id=user_a,
        content="I ate salmon and broccoli.",
        metadata=NoteMetadata(
            title="Food log",
            folder_path="personal/food",
            tags=["food", "health"],
        ),
    )
    note_b = storage.save_note(
        user_id=user_b,
        content="I ate pizza.",
        metadata=NoteMetadata(
            title="Food log (other user)",
            folder_path="personal/food",
            tags=["food"],
        ),
    )

    storage.upsert_note_embedding(
        user_id=user_a,
        note_id=note_a,
        embedding_model="text-embedding-3-small",
        content_hash="a",
        embedding_value=vector_to_json([1.0, 0.0, 0.0]),
    )
    storage.upsert_note_embedding(
        user_id=user_b,
        note_id=note_b,
        embedding_model="text-embedding-3-small",
        content_hash="b",
        embedding_value=vector_to_json([0.0, 1.0, 0.0]),
    )

    hits = storage.semantic_search(
        user_id=user_a,
        query_embedding_literal=vector_to_json([1.0, 0.0, 0.0]),
        limit=10,
        embedding_model="text-embedding-3-small",
    )

    assert hits, "Expected at least one hit for user A"
    assert all(h["note_id"] != note_b for h in hits), "Must never return other user's notes"
    assert hits[0]["note_id"] == note_a

    # Cleanup
    test_db.unlink(missing_ok=True)
    test_db.with_suffix(".db-wal").unlink(missing_ok=True)
    test_db.with_suffix(".db-shm").unlink(missing_ok=True)


def test_retrieve_for_question_applies_time_and_tag_filters() -> None:
    test_db = Path("test_ask_filters.db").resolve()
    test_db.unlink(missing_ok=True)

    storage = NoteStorage(db_path=test_db)
    user_id = "user-x"

    food_note = storage.save_note(
        user_id=user_id,
        content="Breakfast: oatmeal. Lunch: salad. Dinner: chicken.",
        metadata=NoteMetadata(
            title="Food in Feb",
            folder_path="personal/food",
            tags=["food"],
        ),
    )
    work_note = storage.save_note(
        user_id=user_id,
        content="Met with the team to discuss quarterly roadmap.",
        metadata=NoteMetadata(
            title="Work meeting",
            folder_path="work/meetings",
            tags=["work", "meeting"],
        ),
    )

    _set_note_created_at(storage, user_id, food_note, datetime(2025, 2, 15, 12, 0, 0))
    _set_note_created_at(storage, user_id, work_note, datetime(2025, 3, 1, 9, 0, 0))

    storage.upsert_note_embedding(
        user_id=user_id,
        note_id=food_note,
        embedding_model="text-embedding-3-small",
        content_hash="food",
        embedding_value=vector_to_json([1.0, 0.0, 0.0]),
    )
    storage.upsert_note_embedding(
        user_id=user_id,
        note_id=work_note,
        embedding_model="text-embedding-3-small",
        content_hash="work",
        embedding_value=vector_to_json([0.0, 1.0, 0.0]),
    )

    results = storage.retrieve_for_question(
        user_id=user_id,
        fts_query="food",
        query_embedding_literal=vector_to_json([1.0, 0.0, 0.0]),
        include_tags=["food"],
        start_date="2025-02-01",
        end_date="2025-02-28",
        limit=10,
        embedding_model="text-embedding-3-small",
    )

    assert results, "Expected at least one retrieval result"
    top = results[0]["note"]
    assert top.id == food_note
    assert all(r["note"].id != work_note for r in results)

    # Cleanup
    test_db.unlink(missing_ok=True)
    test_db.with_suffix(".db-wal").unlink(missing_ok=True)
    test_db.with_suffix(".db-shm").unlink(missing_ok=True)


if __name__ == "__main__":
    test_semantic_search_is_user_scoped()
    test_retrieve_for_question_applies_time_and_tag_filters()
    print("✅ Ask tests passed")


