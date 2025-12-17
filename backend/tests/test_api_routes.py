from __future__ import annotations

from pathlib import Path

import pytest

from app import create_app
from app.services.container import Services
from app.services.models import NoteMetadata
from app.services.storage import NoteStorage
from app.services import s3_audio as _s3_audio


class _FakeAsker:
    def answer(self, question, plan, notes):  # noqa: ANN001 - test fake
        class _Result:
            answer_markdown = "test answer"
            cited_note_ids = []
            followups = []

        return _Result()


class _FakeCategorizer:
    def categorize(self, transcription, existing_folders):  # noqa: ANN001 - test fake
        raise AssertionError("categorizer should not be called in these tests")


class _FakeSummarizer:
    def summarize(self, notes_content):  # noqa: ANN001 - test fake
        raise AssertionError("summarizer should not be called in these tests")

class _FakeEmbeddings:
    model = "test-embedding-model"


class _FakePlanner:
    def plan(self, *args, **kwargs):  # noqa: ANN001 - test fake
        raise AssertionError("planner should not be called in these tests")


def test_transcribe_uploads_audio_to_s3_and_links_clip(client, app, monkeypatch):  # noqa: ANN001
    # Avoid OpenAI dependency + complex downstream services; verify S3 upload + response shape.
    from app import routes as _routes
    from app.services import s3_audio as _s3_audio

    monkeypatch.setattr(_routes, "transcribe_bytes", lambda *a, **k: ("hello", {"duration": 1.0}))

    class _CatResult:
        action = "create"
        folder_path = "inbox"
        filename = "test.md"
        tags = []
        confidence = 0.9
        reasoning = "test"

    # Patch categorizer + embeddings to avoid touching OpenAI
    monkeypatch.setattr(
        app.extensions["services"].categorizer,
        "categorize",
        lambda *a, **k: _CatResult(),
    )
    monkeypatch.setattr(
        app.extensions["services"].embeddings,
        "embed_text",
        lambda *a, **k: [0.0],
        raising=False,
    )
    monkeypatch.setattr(
        app.extensions["services"].embeddings,
        "model",
        "test-embedding-model",
        raising=False,
    )
    monkeypatch.setattr(
        app.extensions["services"].storage,
        "dialect",
        "sqlite",
        raising=False,
    )

    uploaded: dict[str, str] = {}

    def _fake_put_object_bytes(*, storage_key: str, content_type: str, data: bytes) -> None:
        uploaded["storage_key"] = storage_key
        uploaded["content_type"] = content_type
        uploaded["bytes"] = str(len(data))

    monkeypatch.setattr(_s3_audio, "put_object_bytes", _fake_put_object_bytes)

    # Send a minimal audio body
    resp = client.post(
        "/api/transcribe",
        data=b"x" * 2000,
        headers={"X-Test-User-Id": "user-a", "Content-Type": "audio/m4a"},
    )
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["text"] == "hello"
    assert "audio" in payload and payload["audio"]["clip_id"]
    assert uploaded["content_type"] == "audio/m4a"
    assert uploaded["storage_key"]


@pytest.fixture()
def app(tmp_path: Path):
    test_db = tmp_path / "api_test.db"
    storage = NoteStorage(db_path=test_db)
    services = Services(
        storage=storage,
        embeddings=_FakeEmbeddings(),
        planner=_FakePlanner(),
        asker=_FakeAsker(),
        categorizer=_FakeCategorizer(),
        summarizer=_FakeSummarizer(),
    )

    app = create_app(testing=True, services=services)
    yield app


@pytest.fixture()
def client(app):
    return app.test_client()


def _stub_presign(url: str, method: str = "PUT"):
    return _s3_audio.PresignedRequest(
        url=url, method=method, expires_at="2099-01-01T00:00:00+00:00", headers={}
    )


def test_audio_clip_flow_is_user_scoped(client, app, monkeypatch):  # noqa: ANN001
    svc = app.extensions["services"]

    monkeypatch.setattr(
        _s3_audio,
        "presign_put_object",
        lambda **kwargs: _stub_presign("https://example.com/put", "PUT"),
    )
    monkeypatch.setattr(
        _s3_audio,
        "presign_get_object",
        lambda **kwargs: _stub_presign("https://example.com/get", "GET"),
    )
    monkeypatch.setattr(
        _s3_audio,
        "object_key_for_clip",
        lambda **kwargs: f"{kwargs['user_id']}/{kwargs['clip_id']}.m4a",
    )

    # Create a note for user-a (optional association)
    note_id = svc.storage.save_note(
        user_id="user-a",
        content="hello",
        metadata=NoteMetadata(title="A", folder_path="x", tags=[]),
    )

    # Create upload session as user-a
    resp = client.post(
        "/api/audio-clips",
        json={"note_id": note_id, "mime_type": "audio/m4a", "bytes": 1234, "duration_ms": 1000},
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 200
    payload = resp.get_json()
    clip_id = payload["clip"]["id"]
    assert payload["upload"]["url"]

    # Other user cannot complete
    resp = client.post(
        f"/api/audio-clips/{clip_id}/complete",
        headers={"X-Test-User-Id": "user-b"},
    )
    assert resp.status_code == 404

    # Complete as user-a
    resp = client.post(
        f"/api/audio-clips/{clip_id}/complete",
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 200
    assert resp.get_json()["clip"]["status"] == "ready"

    # Playback as user-a returns presigned GET
    resp = client.get(
        f"/api/audio-clips/{clip_id}/playback",
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 200
    assert resp.get_json()["url"] == "https://example.com/get"

    # Other user cannot playback
    resp = client.get(
        f"/api/audio-clips/{clip_id}/playback",
        headers={"X-Test-User-Id": "user-b"},
    )
    assert resp.status_code == 404

    # Convenience route returns primary clip + playback
    resp = client.get(
        f"/api/notes/{note_id}/audio",
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 200
    assert resp.get_json()["clip"]["id"] == clip_id
    assert resp.get_json()["playback"]["url"] == "https://example.com/get"

    # Delete is user-scoped
    resp = client.delete(
        f"/api/audio-clips/{clip_id}",
        headers={"X-Test-User-Id": "user-b"},
    )
    assert resp.status_code == 404
    resp = client.delete(
        f"/api/audio-clips/{clip_id}",
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 200
    assert resp.get_json()["success"] is True


def test_list_notes_is_user_scoped(client, app):  # noqa: ANN001 - pytest fixtures
    svc = app.extensions["services"]

    note_a = svc.storage.save_note(
        user_id="user-a",
        content="hello from a",
        metadata=NoteMetadata(title="A", folder_path="x", tags=[]),
    )
    svc.storage.save_note(
        user_id="user-b",
        content="hello from b",
        metadata=NoteMetadata(title="B", folder_path="x", tags=[]),
    )

    resp = client.get("/api/notes", headers={"X-Test-User-Id": "user-a"})
    assert resp.status_code == 200
    payload = resp.get_json()
    ids = {n["id"] for n in payload["notes"]}
    assert note_a in ids
    assert len(ids) == 1


def test_get_note_404_when_other_user(client, app):  # noqa: ANN001 - pytest fixtures
    svc = app.extensions["services"]

    note_id = svc.storage.save_note(
        user_id="user-b",
        content="private",
        metadata=NoteMetadata(title="B", folder_path="x", tags=[]),
    )

    resp = client.get(f"/api/notes/{note_id}", headers={"X-Test-User-Id": "user-a"})
    assert resp.status_code == 404


def test_ask_requires_query_field(client):  # noqa: ANN001 - pytest fixtures
    resp = client.post("/api/ask", json={}, headers={"X-Test-User-Id": "user-a"})
    assert resp.status_code == 400
    assert resp.get_json()["error"]


