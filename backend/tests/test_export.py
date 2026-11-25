from __future__ import annotations

import io
import json
import zipfile

from app.services.models import MealEntryMetadata, NoteMetadata


def _seed(storage, user_id: str) -> None:
    storage.save_note(
        user_id=user_id,
        content="Export body",
        metadata=NoteMetadata(
            title="Export note", folder_path="inbox", tags=["export", "test"]
        ),
    )
    storage.create_todo(user_id, "Export todo", description="A task")
    storage.save_meal_entry(
        user_id=user_id,
        transcription="Soup and bread",
        metadata=MealEntryMetadata(
            meal_type="lunch", meal_date="2026-01-02", confidence=None
        ),
        food_items=[{"name": "Soup", "portion": "1 bowl", "confidence": None}],
    )
    storage.save_vinyl_record(user_id, artist="Artist", album_title="Album")


def test_export_json_contains_user_data(client, app):
    storage = app.extensions["services"].storage
    _seed(storage, "user-a")

    response = client.get("/api/export?format=json", headers={"X-Test-User-Id": "user-a"})
    assert response.status_code == 200
    assert "attachment" in response.headers["Content-Disposition"]

    payload = json.loads(response.data)
    assert payload["notes"][0]["title"] == "Export note"
    assert payload["notes"][0]["view"] == "active"
    assert payload["todos"][0]["title"] == "Export todo"
    assert payload["meals"][0]["transcription"] == "Soup and bread"
    assert payload["vinyl"][0]["album_title"] == "Album"
    assert "export" in payload["tags"]
    assert payload["counts"]["notes"] == 1


def test_export_zip_contains_json_readme_and_markdown(client, app):
    storage = app.extensions["services"].storage
    _seed(storage, "user-a")

    response = client.get("/api/export?format=zip", headers={"X-Test-User-Id": "user-a"})
    assert response.status_code == 200
    assert response.mimetype == "application/zip"

    with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
        names = archive.namelist()
        assert "data.json" in names
        assert "README.txt" in names
        note_files = [name for name in names if name.startswith("notes/")]
        assert len(note_files) == 1
        assert "# Export note" in archive.read(note_files[0]).decode()
        assert json.loads(archive.read("data.json"))["notes"][0]["title"] == "Export note"


def test_export_is_user_scoped(client, app):
    storage = app.extensions["services"].storage
    _seed(storage, "user-a")
    storage.save_note(
        user_id="user-b",
        content="Private",
        metadata=NoteMetadata(title="Other user note", folder_path="inbox", tags=[]),
    )

    response = client.get("/api/export?format=json", headers={"X-Test-User-Id": "user-a"})
    payload = json.loads(response.data)
    titles = [note["title"] for note in payload["notes"]]
    assert "Other user note" not in titles


def test_export_rejects_unknown_format(client):
    response = client.get("/api/export?format=pdf", headers={"X-Test-User-Id": "user-a"})
    assert response.status_code == 400
    assert "format" in response.get_json()["error"]
