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

    def embed_text(self, text):
        return [0.0]

    def upsert_for_note(self, storage, user_id, note_id, title, content, tags=None):
        return True


class _FakePlanner:
    def plan(self, *args, **kwargs):  # noqa: ANN001 - test fake
        raise AssertionError("planner should not be called in these tests")


class _FakeMealExtractor:
    def extract(self, *args, **kwargs):  # noqa: ANN001 - test fake
        raise AssertionError("meal extractor should not be called in these tests")


class _FakeUsageTracking:
    """Fake usage tracking service for tests."""

    def record_usage(self, **kwargs):  # noqa: ANN001
        return "test-usage-id"

    def get_current_usage(self, user_id):  # noqa: ANN001
        from datetime import UTC, datetime

        class _UsageSummary:
            period_start = datetime.now(UTC)
            period_end = datetime.now(UTC)
            transcription_minutes_used = 0.0
            transcription_minutes_limit = 100
            ai_calls_used = 0
            ai_calls_limit = 500
            estimated_cost_usd = 0.0
            tier = "free"

            def model_dump(self):
                return {
                    "user_id": user_id,
                    "period_start": self.period_start.isoformat(),
                    "period_end": self.period_end.isoformat(),
                    "transcription_minutes_used": self.transcription_minutes_used,
                    "transcription_minutes_limit": self.transcription_minutes_limit,
                    "ai_calls_used": self.ai_calls_used,
                    "ai_calls_limit": self.ai_calls_limit,
                    "estimated_cost_usd": self.estimated_cost_usd,
                    "tier": self.tier,
                }

        return _UsageSummary()

    def check_quota(self, user_id, service_type):  # noqa: ANN001
        from datetime import UTC, datetime

        class _QuotaCheck:
            allowed = True
            used = 0.0
            limit = 100.0 if service_type == "transcription" else 500.0
            unit = "minutes" if service_type == "transcription" else "calls"
            resets_at = datetime.now(UTC)
            warning = False

        return _QuotaCheck()

    def get_usage_history(self, user_id, limit=50, offset=0, service_type=None):  # noqa: ANN001
        return []


class _FakeEmailService:
    """Fake email service for tests."""

    def is_configured(self):
        return False

    def send_feedback_notification(self, **kwargs):
        return False


def test_transcribe_uploads_audio_to_s3_and_links_clip(client, app, monkeypatch):  # noqa: ANN001
    # Avoid OpenAI dependency + complex downstream services; verify S3 upload + response shape.
    from app import routes as _routes
    from app.services import s3_audio as _s3_audio

    monkeypatch.setattr(_routes, "transcribe_bytes", lambda *a, **k: ("hello", {"duration": 1.0, "model": "test"}))

    class _CatSuggestion:
        action = "create"
        folder_path = "inbox"
        filename = "test.md"
        tags = []
        confidence = 0.9
        reasoning = "test"

    class _UsageInfo:
        prompt_tokens = 100
        completion_tokens = 50
        total_tokens = 150

    class _CatResult:
        suggestion = _CatSuggestion()
        usage = _UsageInfo()
        model = "test-model"

    # Patch categorizer + embeddings to avoid touching OpenAI
    monkeypatch.setattr(
        app.extensions["services"].categorizer,
        "categorize",
        lambda *a, **k: _CatResult() if k.get("return_usage") else _CatSuggestion(),
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


def test_transcribe_cleans_up_when_transcription_fails(client, app, monkeypatch):  # noqa: ANN001
    # Ensure we delete the uploaded object and mark the clip failed when transcription errors out.
    from app import routes as _routes
    from app.services import s3_audio as _s3_audio

    monkeypatch.setattr(_routes, "transcribe_bytes", lambda *a, **k: (_ for _ in ()).throw(ValueError("bad audio")))

    deleted: list[str] = []

    monkeypatch.setattr(
        _s3_audio,
        "delete_object",
        lambda *, storage_key: deleted.append(storage_key),
    )

    failed: list[tuple[str, str]] = []

    def _record_failed(user_id: str, clip_id: str):
        failed.append((user_id, clip_id))
        return None

    monkeypatch.setattr(app.extensions["services"].storage, "mark_audio_clip_failed", _record_failed)

    # Prevent boto3 usage in tests.
    monkeypatch.setattr(_s3_audio, "put_object_bytes", lambda **kwargs: None)
    monkeypatch.setattr(_s3_audio, "object_key_for_clip", lambda **kwargs: "user-a/fixed.m4a")

    resp = client.post(
        "/api/transcribe",
        data=b"x" * 2000,
        headers={"X-Test-User-Id": "user-a", "Content-Type": "audio/m4a"},
    )
    assert resp.status_code == 400
    assert deleted == ["user-a/fixed.m4a"]
    assert failed and failed[0][0] == "user-a"


@pytest.fixture()
def app(tmp_path: Path, monkeypatch):  # noqa: ANN001 - pytest fixture
    monkeypatch.setenv("AUDIO_CLIPS_ENABLED", "true")
    test_db = tmp_path / "api_test.db"
    storage = NoteStorage(db_path=test_db)
    services = Services(
        storage=storage,
        embeddings=_FakeEmbeddings(),
        planner=_FakePlanner(),
        asker=_FakeAsker(),
        categorizer=_FakeCategorizer(),
        summarizer=_FakeSummarizer(),
        meal_extractor=_FakeMealExtractor(),
        usage_tracking=_FakeUsageTracking(),
        email=_FakeEmailService(),
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
    monkeypatch.setattr(
        _s3_audio,
        "head_object",
        lambda **kwargs: _s3_audio.ObjectHead(content_length=1234, content_type="audio/m4a"),
    )

    deleted: list[str] = []
    monkeypatch.setattr(_s3_audio, "delete_object", lambda *, storage_key: deleted.append(storage_key))

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
    assert deleted == [f"user-a/{clip_id}.m4a"]


def test_audio_clip_complete_requires_uploaded_object(client, app, monkeypatch):  # noqa: ANN001
    # /complete must verify the upload exists and matches metadata before marking ready.
    from app.services import s3_audio as _s3_audio

    monkeypatch.setattr(
        _s3_audio,
        "presign_put_object",
        lambda **kwargs: _stub_presign("https://example.com/put", "PUT"),
    )
    monkeypatch.setattr(
        _s3_audio,
        "object_key_for_clip",
        lambda **kwargs: f"{kwargs['user_id']}/{kwargs['clip_id']}.m4a",
    )

    # Create upload session
    resp = client.post(
        "/api/audio-clips",
        json={"mime_type": "audio/m4a", "bytes": 1234},
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 200
    clip_id = resp.get_json()["clip"]["id"]

    # HEAD failure -> 409
    monkeypatch.setattr(_s3_audio, "head_object", lambda **kwargs: (_ for _ in ()).throw(Exception("404")))
    resp = client.post(
        f"/api/audio-clips/{clip_id}/complete",
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 409

    # Size mismatch -> 409
    monkeypatch.setattr(
        _s3_audio,
        "head_object",
        lambda **kwargs: _s3_audio.ObjectHead(content_length=999, content_type="audio/m4a"),
    )
    resp = client.post(
        f"/api/audio-clips/{clip_id}/complete",
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 409

    # Correct -> ready
    monkeypatch.setattr(
        _s3_audio,
        "head_object",
        lambda **kwargs: _s3_audio.ObjectHead(content_length=1234, content_type="audio/m4a"),
    )
    resp = client.post(
        f"/api/audio-clips/{clip_id}/complete",
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 200
    assert resp.get_json()["clip"]["status"] == "ready"


def test_delete_note_cascades_to_audio_clips(client, app, monkeypatch):  # noqa: ANN001
    # Deleting a note should delete its audio clips and best-effort delete stored objects.
    from app.services import s3_audio as _s3_audio

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
    monkeypatch.setattr(
        _s3_audio,
        "head_object",
        lambda **kwargs: _s3_audio.ObjectHead(content_length=1234, content_type="audio/m4a"),
    )

    deleted: list[str] = []
    monkeypatch.setattr(_s3_audio, "delete_object", lambda *, storage_key: deleted.append(storage_key))

    # Create a note
    note_id = app.extensions["services"].storage.save_note(
        user_id="user-a",
        content="hello",
        metadata=NoteMetadata(title="A", folder_path="x", tags=[]),
    )

    # Create a clip linked to the note and mark ready
    resp = client.post(
        "/api/audio-clips",
        json={"note_id": note_id, "mime_type": "audio/m4a", "bytes": 1234},
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 200
    clip_id = resp.get_json()["clip"]["id"]

    resp = client.post(
        f"/api/audio-clips/{clip_id}/complete",
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 200

    # Delete the note -> should cascade delete the clip + S3 object
    resp = client.delete(
        f"/api/notes/{note_id}",
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 200
    assert deleted == [f"user-a/{clip_id}.m4a"]

    # Clip should now be gone
    resp = client.get(
        f"/api/audio-clips/{clip_id}/playback",
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 404


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


def test_audio_clips_disabled_returns_501(tmp_path, monkeypatch):  # noqa: ANN001
    """When AUDIO_CLIPS_ENABLED is false, audio endpoints return 501."""
    # Explicitly disable audio clips
    monkeypatch.setenv("AUDIO_CLIPS_ENABLED", "false")

    storage = NoteStorage(db_path=tmp_path / "disabled_test.db")
    services = Services(
        storage=storage,
        embeddings=_FakeEmbeddings(),
        planner=_FakePlanner(),
        asker=_FakeAsker(),
        categorizer=_FakeCategorizer(),
        summarizer=_FakeSummarizer(),
        meal_extractor=_FakeMealExtractor(),
        usage_tracking=_FakeUsageTracking(),
        email=_FakeEmailService(),
    )

    app = create_app(testing=True, services=services)
    client = app.test_client()

    # POST /api/audio-clips should return 501
    resp = client.post(
        "/api/audio-clips",
        json={"mime_type": "audio/mp4", "bytes": 1234},
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 501
    assert "disabled" in resp.get_json()["error"].lower()

    # POST /api/transcribe should return 501
    resp = client.post(
        "/api/transcribe",
        data=b"x" * 2000,
        headers={"X-Test-User-Id": "user-a", "Content-Type": "audio/mp4"},
    )
    assert resp.status_code == 501


def test_audio_clip_complete_mime_type_mismatch(client, app, monkeypatch):  # noqa: ANN001
    """MIME type mismatch on complete returns 409."""
    monkeypatch.setattr(
        _s3_audio,
        "presign_put_object",
        lambda **kwargs: _stub_presign("https://example.com/put", "PUT"),
    )
    monkeypatch.setattr(
        _s3_audio,
        "object_key_for_clip",
        lambda **kwargs: f"{kwargs['user_id']}/{kwargs['clip_id']}.mp4",
    )

    # Create upload session with audio/mp4
    resp = client.post(
        "/api/audio-clips",
        json={"mime_type": "audio/mp4", "bytes": 1234},
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 200
    clip_id = resp.get_json()["clip"]["id"]

    # HEAD returns different content-type (audio/webm instead of audio/mp4)
    monkeypatch.setattr(
        _s3_audio,
        "head_object",
        lambda **kwargs: _s3_audio.ObjectHead(content_length=1234, content_type="audio/webm"),
    )

    resp = client.post(
        f"/api/audio-clips/{clip_id}/complete",
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 409
    assert "content-type" in resp.get_json()["error"].lower()


def test_audio_clip_playback_not_ready_returns_409(client, app, monkeypatch):  # noqa: ANN001
    """Playback of clip that's not ready returns 409."""
    monkeypatch.setattr(
        _s3_audio,
        "presign_put_object",
        lambda **kwargs: _stub_presign("https://example.com/put", "PUT"),
    )
    monkeypatch.setattr(
        _s3_audio,
        "object_key_for_clip",
        lambda **kwargs: f"{kwargs['user_id']}/{kwargs['clip_id']}.mp4",
    )

    # Create upload session (status = pending)
    resp = client.post(
        "/api/audio-clips",
        json={"mime_type": "audio/mp4", "bytes": 1234},
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 200
    clip_id = resp.get_json()["clip"]["id"]

    # Try to playback without completing
    resp = client.get(
        f"/api/audio-clips/{clip_id}/playback",
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 409
    assert "not ready" in resp.get_json()["error"].lower()


def test_transcribe_returns_400_for_empty_audio(client, app, monkeypatch):  # noqa: ANN001
    """POST /api/transcribe with empty body returns 400."""
    resp = client.post(
        "/api/transcribe",
        data=b"",
        headers={"X-Test-User-Id": "user-a", "Content-Type": "audio/mp4"},
    )
    assert resp.status_code == 400
    assert "no audio" in resp.get_json()["error"].lower()


def test_create_audio_clip_requires_mime_type(client):  # noqa: ANN001
    """POST /api/audio-clips without mime_type returns 400."""
    resp = client.post(
        "/api/audio-clips",
        json={"bytes": 1234},
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 400
    assert "mime_type" in resp.get_json()["error"]


def test_create_audio_clip_requires_positive_bytes(client):  # noqa: ANN001
    """POST /api/audio-clips with bytes <= 0 returns 400."""
    resp = client.post(
        "/api/audio-clips",
        json={"mime_type": "audio/mp4", "bytes": 0},
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 400
    assert "bytes" in resp.get_json()["error"]

    resp = client.post(
        "/api/audio-clips",
        json={"mime_type": "audio/mp4", "bytes": -100},
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 400


def test_create_audio_clip_bytes_must_be_integer(client):  # noqa: ANN001
    """POST /api/audio-clips with non-integer bytes returns 400."""
    resp = client.post(
        "/api/audio-clips",
        json={"mime_type": "audio/mp4", "bytes": "not a number"},
        headers={"X-Test-User-Id": "user-a"},
    )
    assert resp.status_code == 400
    assert "integer" in resp.get_json()["error"]


