from __future__ import annotations

from app.services.models import MealEntryMetadata, NoteMetadata


def _seed_account(storage, user_id: str) -> dict:
    note_id = storage.save_note(
        user_id=user_id,
        content="Delete me",
        metadata=NoteMetadata(title="Delete me", folder_path="inbox", tags=["private"]),
    )
    storage.create_todo(user_id, "Delete todo")
    storage.save_meal_entry(
        user_id=user_id,
        transcription="Delete meal",
        metadata=MealEntryMetadata(
            meal_type="dinner", meal_date="2026-02-03", confidence=None
        ),
        food_items=[{"name": "Dinner", "portion": None, "confidence": None}],
    )
    vinyl_id = storage.save_vinyl_record(user_id, artist="Delete", album_title="Record")
    storage.create_vinyl_image_pending(
        user_id,
        vinyl_record_id=vinyl_id,
        image_type="front_cover",
        mime_type="image/jpeg",
        bytes=123,
        storage_key=f"vinyl/{user_id}/cover.jpg",
    )
    storage.create_audio_clip_pending(
        user_id,
        note_id=note_id,
        mime_type="audio/webm",
        bytes=456,
        duration_ms=1000,
        storage_key=f"audio/{user_id}/clip.webm",
    )
    storage.create_user_profile(user_id, "Delete User", email="delete@example.com")
    storage.update_user_profile_avatar(user_id, f"avatars/{user_id}/avatar.webp")
    storage.get_user_settings(user_id)
    return {"note_id": note_id, "vinyl_id": vinyl_id}


def test_account_deletion_requires_confirmation(client):
    response = client.delete("/api/account", json={"confirm": "nope"}, headers={"X-Test-User-Id": "u1"})
    assert response.status_code == 400


def test_storage_key_inventory_includes_audio_vinyl_and_avatar(client, app):
    storage = app.extensions["services"].storage
    _seed_account(storage, "u1")

    keys = storage.collect_user_storage_keys("u1")
    assert keys["audio"] == ["audio/u1/clip.webm"]
    assert keys["vinyl"] == ["vinyl/u1/cover.jpg"]
    assert keys["avatar"] == ["avatars/u1/avatar.webp"]


def test_delete_account_purges_all_user_data(client, app):
    storage = app.extensions["services"].storage
    seeded = _seed_account(storage, "u1")
    _seed_account(storage, "u2")

    response = client.delete(
        "/api/account", json={"confirm": "DELETE"}, headers={"X-Test-User-Id": "u1"}
    )
    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["deleted"] is True
    assert body["purged"]["notes"] == 1
    assert body["purged"]["meal_entries"] == 1
    assert body["purged"]["vinyl_records"] == 1

    assert storage.get_note("u1", seeded["note_id"]) is None
    assert storage.list_todos("u1") == []
    assert storage.get_user_profile("u1") is None
    assert storage.list_vinyl_records("u1") == []
    assert storage.list_audio_clips_for_note("u1", seeded["note_id"]) == []

    # Another account is untouched.
    assert storage.get_user_profile("u2") is not None
    assert len(storage.list_todos("u2")) == 1
