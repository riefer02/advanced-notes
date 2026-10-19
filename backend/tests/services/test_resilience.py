"""Tests for the shared resilience helpers."""

import pytest

from app.services.resilience import (
    ExternalServiceError,
    require_external,
    retry_with_backoff,
    with_fallback,
)


def test_retry_succeeds_after_transient_failures(monkeypatch):
    monkeypatch.setattr("app.services.resilience.time.sleep", lambda _delay: None)

    calls = {"count": 0}

    def flaky() -> str:
        calls["count"] += 1
        if calls["count"] < 3:
            raise ConnectionError("temporary")
        return "ok"

    assert retry_with_backoff(flaky, service="test", attempts=3) == "ok"
    assert calls["count"] == 3


def test_retry_exhaustion_raises_external_service_error(monkeypatch):
    monkeypatch.setattr("app.services.resilience.time.sleep", lambda _delay: None)

    with pytest.raises(ExternalServiceError) as exc_info:
        retry_with_backoff(lambda: 1 / 0, service="test", attempts=2)

    assert exc_info.value.service == "test"


def test_with_fallback_returns_value_or_callable():
    assert with_fallback(lambda: 1 / 0, fallback=42, service="test") == 42
    assert with_fallback(lambda: 1 / 0, fallback=lambda: "fb", service="test") == "fb"
    assert with_fallback(lambda: "ok", fallback="fb", service="test") == "ok"


def test_require_external_wraps_and_preserves_our_error():
    with pytest.raises(ExternalServiceError):
        require_external(lambda: 1 / 0, service="test")

    assert require_external(lambda: "ok", service="test") == "ok"

    def already_unavailable() -> None:
        raise ExternalServiceError("upstream", "custom message")

    with pytest.raises(ExternalServiceError) as exc_info:
        require_external(already_unavailable, service="test")

    assert exc_info.value.message == "custom message"
