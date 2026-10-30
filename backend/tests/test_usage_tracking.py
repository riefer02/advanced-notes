"""Unit tests for model cost lookup and estimation."""

from __future__ import annotations

import pytest

from app.services.usage_tracking import UsageTrackingService, _lookup_model_cost


def test_lookup_prefers_exact_transcription_pricing():
    """gpt-4o-mini must not swallow gpt-4o-mini-transcribe via substring match."""
    assert _lookup_model_cost("gpt-4o-mini-transcribe") == {"per_minute": 0.003}
    assert _lookup_model_cost("gpt-4o-mini-transcribe-2025-12-15") == {
        "per_minute": 0.003
    }


def test_lookup_uses_longest_match_for_dated_and_fine_tuned_ids():
    assert _lookup_model_cost("gpt-6-luna-2027-01-01") == {
        "prompt": 0.0001,
        "completion": 0.0005,
    }
    assert _lookup_model_cost("ft:gpt-4o-mini-transcribe:org::id") == {
        "per_minute": 0.003
    }


def test_lookup_returns_none_for_unknown_model():
    assert _lookup_model_cost("not-a-real-model") is None


def test_estimate_cost_bills_transcription_by_minute():
    svc = UsageTrackingService()

    assert svc._estimate_cost("gpt-4o-mini-transcribe", audio_seconds=60) == 0.003
    assert svc._estimate_cost("gpt-transcribe", audio_seconds=60) == 0.0045


def test_estimate_cost_prices_current_chat_models():
    svc = UsageTrackingService()

    assert svc._estimate_cost(
        "gpt-6.1-terra", prompt_tokens=1000, completion_tokens=1000
    ) == pytest.approx(0.006)
    assert svc._estimate_cost(
        "gpt-6.1-sol", prompt_tokens=1000, completion_tokens=1000
    ) == pytest.approx(0.012)
