"""Tests for note lifecycle: soft delete, archive, pin, and revisions."""

from __future__ import annotations

from app.services.models import NoteMetadata

USER = {"X-Test-User-Id": "user-a"}


def _create(client, content: str = "alpha beta", title: str = "Note", folder: str = "inbox"):
    response = client.post(
        "/api/notes",
        json={"title": title, "content": content, "folder_path": folder},
        headers=USER,
    )
    assert response.status_code == 201
    return response.get_json()


def test_manual_note_is_marked_as_manual_source(client):
    note = _create(client, content="typed by hand")
    assert note["source"] == "manual"
    assert note["version"] == 1
    assert note["deleted_at"] is None
    assert note["archived_at"] is None


def test_archive_hides_note_from_active_views(client, app):
    note = _create(client, content="archive alpha", folder="work")

    response = client.post(
        f"/api/notes/{note['id']}/archive", json={"archived": True}, headers=USER
    )
    assert response.status_code == 200
    assert response.get_json()["archived_at"] is not None

    active = client.get("/api/notes", headers=USER).get_json()
    assert active["total"] == 0

    archived = client.get("/api/notes?view=archived", headers=USER).get_json()
    assert archived["total"] == 1

    # Archived notes do not leak into search, tags, folders, or dashboard.
    assert client.get("/api/search?q=alpha", headers=USER).get_json()["results"] == []
    assert client.get("/api/tags", headers=USER).get_json()["tags"] == []
    folders = client.get("/api/folders", headers=USER).get_json()["folders"]
    assert folders["subfolders"] == []
    assert client.get("/api/dashboard/stats", headers=USER).get_json()["notes"]["total"] == 0

    response = client.post(
        f"/api/notes/{note['id']}/archive", json={"archived": False}, headers=USER
    )
    assert response.status_code == 200
    assert response.get_json()["archived_at"] is None
    assert client.get("/api/notes", headers=USER).get_json()["total"] == 1


def test_pinned_notes_sort_first(client, app):
    first = _create(client, content="first", title="First")
    _create(client, content="second", title="Second")

    response = client.post(
        f"/api/notes/{first['id']}/pin", json={"pinned": True}, headers=USER
    )
    assert response.status_code == 200
    assert response.get_json()["pinned_at"] is not None

    listing = client.get("/api/notes", headers=USER).get_json()
    assert listing["notes"][0]["id"] == first["id"]

    response = client.post(
        f"/api/notes/{first['id']}/pin", json={"pinned": False}, headers=USER
    )
    assert response.status_code == 200
    assert response.get_json()["pinned_at"] is None


def test_soft_delete_hides_note_until_restored(client, app):
    note = _create(client, content="trash alpha", folder="work")

    response = client.delete(f"/api/notes/{note['id']}", headers=USER)
    assert response.status_code == 200

    # Owner can still open it directly.
    direct = client.get(f"/api/notes/{note['id']}", headers=USER)
    assert direct.status_code == 200
    assert direct.get_json()["deleted_at"] is not None

    assert client.get("/api/notes", headers=USER).get_json()["total"] == 0
    trash = client.get("/api/notes?view=trash", headers=USER).get_json()
    assert trash["total"] == 1

    assert client.get("/api/search?q=alpha", headers=USER).get_json()["results"] == []
    assert client.get("/api/tags", headers=USER).get_json()["tags"] == []

    response = client.post(f"/api/notes/{note['id']}/restore", headers=USER)
    assert response.status_code == 200
    assert response.get_json()["deleted_at"] is None
    assert client.get("/api/notes", headers=USER).get_json()["total"] == 1


def test_editing_a_trashed_note_is_rejected(client):
    note = _create(client, content="trashed")
    client.delete(f"/api/notes/{note['id']}", headers=USER)

    response = client.put(
        f"/api/notes/{note['id']}", json={"content": "new"}, headers=USER
    )
    assert response.status_code == 409


def test_delete_is_idempotent(client):
    note = _create(client, content="delete twice")

    first = client.delete(f"/api/notes/{note['id']}", headers=USER)
    second = client.delete(f"/api/notes/{note['id']}", headers=USER)

    assert first.status_code == 200
    assert second.status_code == 200


def test_permanent_delete_requires_trash_and_purges_revisions(client, app):
    note = _create(client, content="v1", title="v1")
    client.put(f"/api/notes/{note['id']}", json={"content": "v2"}, headers=USER)

    # Active notes cannot be purged.
    blocked = client.delete(f"/api/notes/{note['id']}/permanent", headers=USER)
    assert blocked.status_code == 409

    client.delete(f"/api/notes/{note['id']}", headers=USER)
    purged = client.delete(f"/api/notes/{note['id']}/permanent", headers=USER)
    assert purged.status_code == 200

    assert client.get(f"/api/notes/{note['id']}", headers=USER).status_code == 404
    revisions = client.get(f"/api/notes/{note['id']}/revisions", headers=USER)
    assert revisions.status_code == 404


def test_update_creates_revisions_and_restore_round_trips(client, app):
    note = _create(client, content="version one", title="One")

    client.put(
        f"/api/notes/{note['id']}",
        json={"content": "version two", "title": "Two"},
        headers=USER,
    )
    client.put(
        f"/api/notes/{note['id']}",
        json={"content": "version three", "title": "Three"},
        headers=USER,
    )

    revisions = client.get(f"/api/notes/{note['id']}/revisions", headers=USER).get_json()
    assert [r["version"] for r in revisions["revisions"]] == [2, 1]
    assert revisions["current_version"] == 3
    assert revisions["revisions"][0]["content"] == "version two"
    assert revisions["revisions"][1]["content"] == "version one"

    restored = client.post(
        f"/api/notes/{note['id']}/revisions/1/restore", headers=USER
    )
    assert restored.status_code == 200
    current = restored.get_json()
    assert current["content"] == "version one"
    assert current["title"] == "One"
    assert current["version"] == 4

    # Restoring snapshots the state being replaced, so v3 is recoverable.
    revisions = client.get(f"/api/notes/{note['id']}/revisions", headers=USER).get_json()
    assert [r["version"] for r in revisions["revisions"]] == [3, 2, 1]
    assert revisions["revisions"][0]["content"] == "version three"


def test_revision_restore_is_user_scoped(client, app):
    note = _create(client, content="private")
    client.put(f"/api/notes/{note['id']}", json={"content": "private v2"}, headers=USER)

    response = client.post(
        f"/api/notes/{note['id']}/revisions/1/restore",
        headers={"X-Test-User-Id": "user-b"},
    )
    assert response.status_code == 404


def test_audio_note_defaults_to_audio_source(client, app):
    note_id = app.extensions["services"].storage.save_note(
        user_id="user-a",
        content="recorded",
        metadata=NoteMetadata(title="Recorded", folder_path="inbox", tags=[]),
    )
    note = app.extensions["services"].storage.get_note("user-a", note_id)
    assert note is not None
    assert note.source == "audio"
