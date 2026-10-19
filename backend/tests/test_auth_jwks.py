"""Tests for Clerk JWKS caching and authentication failure modes."""

from __future__ import annotations

import pytest
from flask import jsonify

import app.auth as auth_module
from app import create_app
from app.auth import JWKSUnavailableError, get_jwks, require_auth, verify_clerk_token


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


@pytest.fixture(autouse=True)
def _reset_jwks_cache(monkeypatch):
    monkeypatch.setattr(auth_module, "_jwks_cache", None)
    monkeypatch.setattr(auth_module, "_jwks_cache_expires_at", 0.0)


@pytest.fixture()
def app():
    app = create_app(testing=True)

    @app.get("/protected")
    @require_auth
    def protected():
        return jsonify({"ok": True})

    return app


def test_jwks_is_cached_within_ttl(monkeypatch):
    calls = []

    def fake_get(url, timeout):  # noqa: ANN001, ARG001
        calls.append(url)
        return _FakeResponse({"keys": [{"kid": "a"}]})

    monkeypatch.setattr(auth_module.requests, "get", fake_get)

    assert get_jwks()["keys"][0]["kid"] == "a"
    assert get_jwks()["keys"][0]["kid"] == "a"
    assert len(calls) == 1


def test_jwks_refetches_after_ttl(monkeypatch):
    calls = []

    def fake_get(url, timeout):  # noqa: ANN001, ARG001
        calls.append(url)
        return _FakeResponse({"keys": [{"kid": "a"}]})

    monkeypatch.setattr(auth_module.requests, "get", fake_get)

    get_jwks()
    monkeypatch.setattr(auth_module, "_jwks_cache_expires_at", 0.0)
    get_jwks()

    assert len(calls) == 2


def test_jwks_falls_back_to_stale_cache_on_outage(monkeypatch):
    monkeypatch.setattr(auth_module, "_jwks_cache", {"keys": [{"kid": "old"}]})
    monkeypatch.setattr(auth_module, "_jwks_cache_expires_at", 0.0)

    def fail(url, timeout):  # noqa: ANN001, ARG001
        raise ConnectionError("idp down")

    monkeypatch.setattr(auth_module.requests, "get", fail)

    assert get_jwks()["keys"][0]["kid"] == "old"


def test_jwks_raises_when_unavailable_without_cache(monkeypatch):
    def fail(url, timeout):  # noqa: ANN001, ARG001
        raise ConnectionError("idp down")

    monkeypatch.setattr(auth_module.requests, "get", fail)

    with pytest.raises(JWKSUnavailableError):
        get_jwks()


def test_unknown_kid_forces_a_refresh(monkeypatch):
    responses = [
        _FakeResponse({"keys": [{"kid": "old"}]}),
        _FakeResponse({"keys": [{"kid": "new"}]}),
    ]
    calls = []

    def fake_get(url, timeout):  # noqa: ANN001, ARG001
        calls.append(url)
        return responses.pop(0)

    class _FakeJwt:
        @staticmethod
        def get_unverified_header(token):  # noqa: ANN001, ARG004
            return {"kid": "new"}

        @staticmethod
        def decode(token, key, **kwargs):  # noqa: ANN001, ARG004
            return {"sub": "user-1"}

    monkeypatch.setattr(auth_module.requests, "get", fake_get)
    monkeypatch.setattr(auth_module, "jwt", _FakeJwt)

    assert verify_clerk_token("token") == {"sub": "user-1"}
    assert len(calls) == 2


def test_require_auth_returns_503_when_jwks_unavailable(app, monkeypatch):
    def boom(token):  # noqa: ANN001, ARG001
        raise JWKSUnavailableError("idp down")

    monkeypatch.setattr(auth_module, "verify_clerk_token", boom)

    resp = app.test_client().get(
        "/protected", headers={"Authorization": "Bearer token"}
    )

    assert resp.status_code == 503


def test_require_auth_rejects_token_without_sub(app, monkeypatch):
    monkeypatch.setattr(auth_module, "verify_clerk_token", lambda token: {"sub": None})

    resp = app.test_client().get(
        "/protected", headers={"Authorization": "Bearer token"}
    )

    assert resp.status_code == 401


def test_require_auth_accepts_valid_token(app, monkeypatch):
    monkeypatch.setattr(
        auth_module, "verify_clerk_token", lambda token: {"sub": "user-1"}
    )

    resp = app.test_client().get(
        "/protected", headers={"Authorization": "Bearer token"}
    )

    assert resp.status_code == 200
