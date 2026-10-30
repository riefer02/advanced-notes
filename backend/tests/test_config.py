"""Configuration deprecation-warning tests."""

from __future__ import annotations

import warnings

import pytest

from app.config import Config


def test_warn_deprecated_models(monkeypatch):
    monkeypatch.setattr(Config, "OPENAI_MODEL", "gpt-4o-mini")
    monkeypatch.setattr(Config, "TRANSCRIBE_MODEL", "gpt-transcribe")

    with pytest.warns(UserWarning, match="gpt-4o-mini"):
        Config.warn_deprecated_models()


def test_no_warning_for_current_models(monkeypatch):
    monkeypatch.setattr(Config, "OPENAI_MODEL", "gpt-6-luna")
    monkeypatch.setattr(Config, "TRANSCRIBE_MODEL", "gpt-transcribe")

    with warnings.catch_warnings():
        warnings.simplefilter("error")
        Config.warn_deprecated_models()
