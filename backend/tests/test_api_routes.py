from __future__ import annotations

from pathlib import Path

import pytest

from app import create_app
from app.services.container import Services
from app.services.models import NoteMetadata
from app.services.storage import NoteStorage


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


