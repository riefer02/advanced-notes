"""
Tests for authentication utilities in app/auth.py.

Tests token extraction and auth decorator behavior.
"""
from __future__ import annotations

import pytest
from flask import Flask

from app.auth import get_auth_token


# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture()
def app():
    """Minimal Flask app for testing request context."""
    app = Flask(__name__)
    app.config["TESTING"] = True
    return app


# ============================================================================
# get_auth_token
# ============================================================================


def test_get_auth_token_extracts_bearer_token(app):
    """Extracts token from Bearer authorization header."""
    with app.test_request_context(headers={"Authorization": "Bearer my-jwt-token"}):
        token = get_auth_token()
        assert token == "my-jwt-token"


def test_get_auth_token_returns_none_without_header(app):
    """Returns None when Authorization header is missing."""
    with app.test_request_context():
        token = get_auth_token()
        assert token is None


def test_get_auth_token_returns_none_for_empty_header(app):
    """Returns None when Authorization header is empty."""
    with app.test_request_context(headers={"Authorization": ""}):
        token = get_auth_token()
        assert token is None


def test_get_auth_token_returns_none_for_non_bearer(app):
    """Returns None for non-Bearer auth schemes."""
    with app.test_request_context(headers={"Authorization": "Basic dXNlcjpwYXNz"}):
        token = get_auth_token()
        assert token is None


def test_get_auth_token_returns_none_for_malformed_bearer(app):
    """Returns None when Bearer prefix is present but lowercase."""
    with app.test_request_context(headers={"Authorization": "bearer my-token"}):
        token = get_auth_token()
        assert token is None


def test_get_auth_token_returns_none_for_bearer_only(app):
    """Returns empty string when only 'Bearer ' is present (no token)."""
    with app.test_request_context(headers={"Authorization": "Bearer "}):
        token = get_auth_token()
        # The implementation returns everything after "Bearer ", which is empty string
        assert token == ""


def test_get_auth_token_preserves_token_content(app):
    """Preserves special characters in token."""
    complex_token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature"
    with app.test_request_context(headers={"Authorization": f"Bearer {complex_token}"}):
        token = get_auth_token()
        assert token == complex_token


def test_get_auth_token_with_extra_spaces(app):
    """Handles extra spaces in token (preserves them)."""
    with app.test_request_context(headers={"Authorization": "Bearer  token-with-space"}):
        token = get_auth_token()
        # The implementation slices from position 7, preserving the extra space
        assert token == " token-with-space"


# ============================================================================
# require_auth decorator (via integration)
# ============================================================================


def test_require_auth_with_test_user_header():
    """Test user header works in testing mode."""
    from app import create_app
    from app.services.container import Services
    from app.services.storage import NoteStorage
    from pathlib import Path
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        test_db = Path(tmp) / "test.db"
        storage = NoteStorage(db_path=test_db)

        # Minimal fakes for services
        class _FakePlanner:
            def plan(self, *a, **k):
                raise AssertionError("not called")

        class _FakeAsker:
            def answer(self, *a, **k):
                raise AssertionError("not called")

        class _FakeCategorizer:
            def categorize(self, *a, **k):
                raise AssertionError("not called")

        class _FakeSummarizer:
            def summarize(self, *a, **k):
                raise AssertionError("not called")

        class _FakeEmbeddings:
            model = "test"
            def embed_text(self, *a):
                return [0.0]
            def upsert_for_note(self, *a, **k):
                return True

        class _FakeMealExtractor:
            def extract(self, *a, **k):
                raise AssertionError("not called")

        class _FakeUsageTracking:
            def record_usage(self, **k):
                return "test-id"
            def check_quota(self, user_id, service_type):
                class _R:
                    allowed = True
                    warning = False
                return _R()
            def get_current_usage(self, user_id):
                pass
            def get_usage_history(self, *a, **k):
                return []

        services = Services(
            storage=storage,
            embeddings=_FakeEmbeddings(),
            planner=_FakePlanner(),
            asker=_FakeAsker(),
            categorizer=_FakeCategorizer(),
            summarizer=_FakeSummarizer(),
            meal_extractor=_FakeMealExtractor(),
            usage_tracking=_FakeUsageTracking(),
        )

        app = create_app(testing=True, services=services)
        client = app.test_client()

        # Request without auth header should fail
        resp = client.get("/api/notes")
        assert resp.status_code == 401

        # Request with test user header should succeed
        resp = client.get("/api/notes", headers={"X-Test-User-Id": "test-user"})
        assert resp.status_code == 200


def test_require_auth_returns_401_without_token():
    """Returns 401 when no token is provided (non-testing mode)."""
    from app import create_app
    from app.services.container import Services
    from app.services.storage import NoteStorage
    from pathlib import Path
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        test_db = Path(tmp) / "test.db"
        storage = NoteStorage(db_path=test_db)

        class _FakePlanner:
            def plan(self, *a, **k):
                raise AssertionError("not called")

        class _FakeAsker:
            def answer(self, *a, **k):
                raise AssertionError("not called")

        class _FakeCategorizer:
            def categorize(self, *a, **k):
                raise AssertionError("not called")

        class _FakeSummarizer:
            def summarize(self, *a, **k):
                raise AssertionError("not called")

        class _FakeEmbeddings:
            model = "test"
            def embed_text(self, *a):
                return [0.0]
            def upsert_for_note(self, *a, **k):
                return True

        class _FakeMealExtractor:
            def extract(self, *a, **k):
                raise AssertionError("not called")

        class _FakeUsageTracking:
            def record_usage(self, **k):
                return "test-id"
            def check_quota(self, user_id, service_type):
                class _R:
                    allowed = True
                    warning = False
                return _R()
            def get_current_usage(self, user_id):
                pass
            def get_usage_history(self, *a, **k):
                return []

        services = Services(
            storage=storage,
            embeddings=_FakeEmbeddings(),
            planner=_FakePlanner(),
            asker=_FakeAsker(),
            categorizer=_FakeCategorizer(),
            summarizer=_FakeSummarizer(),
            meal_extractor=_FakeMealExtractor(),
            usage_tracking=_FakeUsageTracking(),
        )

        # NOT in testing mode - X-Test-User-Id header won't work
        app = create_app(testing=False, services=services)
        client = app.test_client()

        # Should return 401 without valid Clerk token
        resp = client.get("/api/notes", headers={"X-Test-User-Id": "test-user"})
        assert resp.status_code == 401
        assert "Missing authentication token" in resp.get_json()["error"]
