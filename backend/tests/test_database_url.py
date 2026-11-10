"""Tests for database URL normalization and environment safety."""

import pytest

from app.database import _normalize_database_url, get_database_url


def _clear_db_env(monkeypatch):
    for key in ("DATABASE_URL", "APP_ENV", "ENV", "FLASK_ENV", "ALLOW_SQLITE"):
        monkeypatch.delenv(key, raising=False)


def test_postgres_urls_are_pinned_to_psycopg2():
    assert (
        _normalize_database_url("postgresql://user:pass@host:5432/db")
        == "postgresql+psycopg2://user:pass@host:5432/db"
    )
    assert (
        _normalize_database_url("postgres://user@host/db")
        == "postgresql+psycopg2://user@host/db"
    )


def test_already_explicit_or_non_postgres_urls_are_unchanged():
    assert _normalize_database_url("postgresql+psycopg2://host/db") == (
        "postgresql+psycopg2://host/db"
    )
    assert _normalize_database_url("postgresql+psycopg://host/db") == (
        "postgresql+psycopg://host/db"
    )
    assert _normalize_database_url("sqlite:////tmp/test.db") == "sqlite:////tmp/test.db"


@pytest.mark.parametrize("env_key", ["APP_ENV", "ENV", "FLASK_ENV"])
def test_production_without_database_url_refuses_sqlite(monkeypatch, env_key):
    _clear_db_env(monkeypatch)
    monkeypatch.setenv(env_key, "production")

    with pytest.raises(ValueError, match="DATABASE_URL is required"):
        get_database_url()


def test_allow_sqlite_opt_out_is_explicit(monkeypatch):
    _clear_db_env(monkeypatch)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ALLOW_SQLITE", "true")

    assert get_database_url().startswith("sqlite:///")


def test_development_still_defaults_to_sqlite(monkeypatch):
    _clear_db_env(monkeypatch)

    assert get_database_url().startswith("sqlite:///")
