"""Tests for database URL normalization."""

from app.database import _normalize_database_url


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
