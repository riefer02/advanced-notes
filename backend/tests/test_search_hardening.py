"""Search hardening and embedding reuse tests."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.embeddings import EmbeddingsService
from app.services.storage import NoteStorage


def _create(client, content: str, title: str = "Note"):
    response = client.post(
        "/api/notes",
        json={"title": title, "content": content, "folder_path": "inbox"},
        headers={"X-Test-User-Id": "user-a"},
    )
    assert response.status_code == 201
    return response.get_json()


def test_search_survives_fts_operators_and_quotes(client):
    _create(client, "react performance optimization notes")

    for query in ['react" OR *', "foo\"bar", "react OR", '"unterminated', "AND ()"]:
        response = client.get("/api/search", query_string={"q": query}, headers={"X-Test-User-Id": "user-a"})
        assert response.status_code == 200, query


def test_search_supports_prefix_queries(client):
    _create(client, "react performance optimization notes")

    response = client.get(
        "/api/search", query_string={"q": "perf"}, headers={"X-Test-User-Id": "user-a"}
    )

    assert response.status_code == 200
    results = response.get_json()["results"]
    assert len(results) == 1
    assert results[0]["note"]["title"] == "Note"


def test_search_ignores_punctuation_only_queries(client):
    _create(client, "react performance optimization notes")

    response = client.get(
        "/api/search", query_string={"q": "!!! ???"}, headers={"X-Test-User-Id": "user-a"}
    )

    assert response.status_code == 200
    assert response.get_json()["results"] == []


class _FakeEmbeddingsAPI:
    def __init__(self) -> None:
        self.calls = 0

    def create(self, model, input):  # noqa: ANN001, A002
        self.calls += 1
        return SimpleNamespace(data=[SimpleNamespace(embedding=[0.1] * 1536)])


class _FakeClient:
    def __init__(self) -> None:
        self.embeddings = _FakeEmbeddingsAPI()


def test_embedding_is_reused_when_content_hash_matches(tmp_path):
    storage = NoteStorage(db_path=tmp_path / "embeddings.db")
    fake_client = _FakeClient()
    service = EmbeddingsService(client=fake_client, model="test-model")

    assert service.upsert_for_note(
        storage=storage,
        user_id="user-a",
        note_id="note-1",
        title="Title",
        content="Same content",
        tags=["a"],
    )
    assert fake_client.embeddings.calls == 1

    # Unchanged text: no second API call.
    assert service.upsert_for_note(
        storage=storage,
        user_id="user-a",
        note_id="note-1",
        title="Title",
        content="Same content",
        tags=["a"],
    )
    assert fake_client.embeddings.calls == 1

    # Changed text: exactly one new embedding.
    assert service.upsert_for_note(
        storage=storage,
        user_id="user-a",
        note_id="note-1",
        title="Title",
        content="Different content",
        tags=["a"],
    )
    assert fake_client.embeddings.calls == 2

    stored = storage.get_note_embedding("user-a", "note-1", "test-model")
    assert stored is not None
    assert stored["content_hash"]
