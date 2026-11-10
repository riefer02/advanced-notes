"""Tests for folder entities/rename and transcript storage."""

from __future__ import annotations

USER = {"X-Test-User-Id": "user-a"}
OTHER = {"X-Test-User-Id": "user-b"}


def _create(client, title: str, folder: str):
    response = client.post(
        "/api/notes",
        json={"title": title, "content": "body", "folder_path": folder},
        headers=USER,
    )
    assert response.status_code == 201
    return response.get_json()


def test_rename_folder_moves_the_subtree(client):
    first = _create(client, "Work", "work")
    second = _create(client, "Meeting", "work/meetings")
    _create(client, "Personal", "personal")

    response = client.post(
        "/api/folders/work/rename", json={"new_path": "projects"}, headers=USER
    )
    assert response.status_code == 200
    assert response.get_json()["renamed_notes"] == 2

    projects = client.get("/api/notes", query_string={"folder": "projects"}, headers=USER)
    assert projects.status_code == 200
    assert projects.get_json()["total"] == 2

    old = client.get("/api/notes", query_string={"folder": "work"}, headers=USER)
    assert old.get_json()["total"] == 0

    updated_first = client.get(f"/api/notes/{first['id']}", headers=USER).get_json()
    updated_second = client.get(f"/api/notes/{second['id']}", headers=USER).get_json()
    assert updated_first["folder_path"] == "projects"
    assert updated_second["folder_path"] == "projects/meetings"
    assert updated_first["folder_id"]
    assert updated_second["folder_id"]

    stats = client.get("/api/folders/projects/stats", headers=USER)
    assert stats.status_code == 200
    assert stats.get_json()["note_count"] == 2


def test_rename_rejects_conflicts_and_self_moves(client):
    _create(client, "Work", "work")
    _create(client, "Projects", "projects")

    conflict = client.post(
        "/api/folders/work/rename", json={"new_path": "projects"}, headers=USER
    )
    assert conflict.status_code == 409

    self_move = client.post(
        "/api/folders/work/rename", json={"new_path": "work/child"}, headers=USER
    )
    assert self_move.status_code == 400

    missing = client.post(
        "/api/folders/nope/rename", json={"new_path": "elsewhere"}, headers=USER
    )
    assert missing.status_code == 404


def test_rename_is_user_scoped(client):
    _create(client, "Work", "work")

    response = client.post(
        "/api/folders/work/rename", json={"new_path": "projects"}, headers=OTHER
    )
    assert response.status_code == 404

    notes = client.get("/api/notes", query_string={"folder": "work"}, headers=USER)
    assert notes.get_json()["total"] == 1


def test_empty_folder_stats_returns_404(client):
    response = client.get("/api/folders/nope/stats", headers=USER)
    assert response.status_code == 404


def test_transcripts_are_listed_for_a_note(client, app):
    note = _create(client, "Recorded", "inbox")
    storage = app.extensions["services"].storage

    storage.create_transcript(
        user_id="user-a",
        note_id=note["id"],
        audio_clip_id=None,
        text="raw transcript",
        language="en",
        model="gpt-transcribe",
        duration_seconds=1.5,
        confidence=0.9,
    )

    response = client.get(f"/api/notes/{note['id']}/transcripts", headers=USER)
    assert response.status_code == 200
    transcripts = response.get_json()["transcripts"]
    assert len(transcripts) == 1
    assert transcripts[0]["text"] == "raw transcript"
    assert transcripts[0]["language"] == "en"

    other = client.get(f"/api/notes/{note['id']}/transcripts", headers=OTHER)
    assert other.status_code == 404
