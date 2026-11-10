"""Tests for normalized tag storage and filtering."""

from __future__ import annotations

USER = {"X-Test-User-Id": "user-a"}
OTHER = {"X-Test-User-Id": "user-b"}


def _create(client, title: str, tags: list[str], content: str = "body"):
    response = client.post(
        "/api/notes",
        json={
            "title": title,
            "content": content,
            "folder_path": "inbox",
            "tags": tags,
        },
        headers=USER,
    )
    assert response.status_code == 201
    return response.get_json()


def test_tags_are_normalized_and_deduplicated(client):
    note = _create(client, "React", ["React", "react", "Performance"])

    assert note["tags"] == ["react", "performance"]
    tags = client.get("/api/tags", headers=USER).get_json()["tags"]
    assert tags == ["performance", "react"]


def test_tag_filter_is_exact_not_substring(client):
    _create(client, "React note", ["react"])
    _create(client, "Reactive note", ["reactive"])

    react = client.get("/api/tags/react/notes", headers=USER).get_json()["notes"]
    reactive = client.get("/api/tags/reactive/notes", headers=USER).get_json()["notes"]

    assert [note["title"] for note in react] == ["React note"]
    assert [note["title"] for note in reactive] == ["Reactive note"]


def test_updating_tags_replaces_the_join_rows(client):
    note = _create(client, "Tagged", ["old", "keep"])

    response = client.put(
        f"/api/notes/{note['id']}",
        json={"tags": ["New", "keep"]},
        headers=USER,
    )
    assert response.status_code == 200
    assert response.get_json()["tags"] == ["new", "keep"]

    assert client.get("/api/tags/old/notes", headers=USER).get_json()["notes"] == []
    assert len(client.get("/api/tags/new/notes", headers=USER).get_json()["notes"]) == 1
    assert len(client.get("/api/tags/keep/notes", headers=USER).get_json()["notes"]) == 1


def test_tags_are_user_scoped(client):
    _create(client, "Mine", ["shared-name"])

    assert client.get("/api/tags", headers=OTHER).get_json()["tags"] == []
    assert (
        client.get("/api/tags/shared-name/notes", headers=OTHER).get_json()["notes"]
        == []
    )


def test_archiving_removes_tag_from_active_tag_list(client):
    note = _create(client, "Tagged", ["archive-me"])

    client.post(f"/api/notes/{note['id']}/archive", json={"archived": True}, headers=USER)

    assert client.get("/api/tags", headers=USER).get_json()["tags"] == []
    assert (
        client.get("/api/tags/archive-me/notes", headers=USER).get_json()["notes"]
        == []
    )
