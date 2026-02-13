"""
Shared pytest fixtures for the backend test suite.

Fakes and the app factory live in tests/helpers.py so that test files
can import them directly for customisation.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from tests.helpers import make_app


@pytest.fixture()
def app(tmp_path: Path, monkeypatch):
    """Default test app with all canonical fake services."""
    return make_app(tmp_path, monkeypatch=monkeypatch)


@pytest.fixture()
def client(app):
    return app.test_client()
