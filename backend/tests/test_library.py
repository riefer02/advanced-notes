from __future__ import annotations

from app.services.models import MealEntryMetadata, NoteMetadata


def _seed(storage, user_id: str = "u1") -> None:
    storage.save_note(
        user_id=user_id,
        content="Library note",
        metadata=NoteMetadata(title="Library note", folder_path="inbox", tags=["lib"]),
    )
    storage.create_todo(user_id, "Library todo", status="accepted")
    storage.save_meal_entry(
        user_id=user_id,
        transcription="Library meal",
        metadata=MealEntryMetadata(
            meal_type="lunch", meal_date="2026-02-03", confidence=None
        ),
        food_items=[{"name": "Soup", "portion": None, "confidence": None}],
    )
    storage.save_vinyl_record(user_id, artist="Artist", album_title="Album")


def test_library_returns_every_kind(client, app):
    _seed(app.extensions["services"].storage)
    response = client.get("/api/library", headers={"X-Test-User-Id": "u1"})
    assert response.status_code == 200

    body = response.get_json()
    assert body["counts"] == {"note": 1, "meal": 1, "vinyl": 1, "todo": 1}
    kinds = {item["kind"] for item in body["items"]}
    assert kinds == {"note", "meal", "vinyl", "todo"}


def test_library_type_filter(client, app):
    _seed(app.extensions["services"].storage)
    response = client.get("/api/library?type=meal", headers={"X-Test-User-Id": "u1"})
    body = response.get_json()
    assert [item["kind"] for item in body["items"]] == ["meal"]
    assert body["counts"]["meal"] == 1
    assert body["counts"]["note"] == 0


def test_library_is_user_scoped_and_rejects_bad_type(client, app):
    _seed(app.extensions["services"].storage)
    _seed(app.extensions["services"].storage, "u2")

    response = client.get("/api/library", headers={"X-Test-User-Id": "u1"})
    titles = [item["data"].get("title") for item in response.get_json()["items"] if item["kind"] == "note"]
    assert "Library note" in titles
    assert len(titles) == 1

    response = client.get("/api/library?type=pdf", headers={"X-Test-User-Id": "u1"})
    assert response.status_code == 400
