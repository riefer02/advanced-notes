#!/usr/bin/env python3
"""
Database migration script for Railway deployments.

This script runs Alembic migrations during the build/deploy process.

On PostgreSQL it takes a session-level advisory lock first, so several
replicas booting at once run the migration exactly once instead of racing the
same revision.
"""

import os
import subprocess
import sys

# Arbitrary constant shared by every Chisos migration runner.
_ADVISORY_LOCK_KEY = 1128618323  # 0x43484953
_LOCK_TIMEOUT_SECONDS = 300
_MIGRATION_TIMEOUT_SECONDS = 300
_PG_OPTIONS = (
    "-c statement_timeout=240000 "
    "-c lock_timeout=15000 "
    "-c idle_in_transaction_session_timeout=60000"
)


def _safe_db_info() -> str:
    """Return database type without exposing credentials."""
    url = os.getenv("DATABASE_URL")
    if not url:
        return "SQLite (development)"
    if url.startswith("postgresql") or url.startswith("postgres://"):
        return "PostgreSQL"
    if url.startswith("mysql"):
        return "MySQL"
    return "Database configured"


def _postgres_dsn() -> str | None:
    """Return a psycopg2-compatible DSN, or None when not PostgreSQL."""
    url = os.getenv("DATABASE_URL")
    if not url:
        return None
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql+"):
        # e.g. postgresql+psycopg2:// -> postgresql://
        return "postgresql://" + url.split("://", 1)[1]
    if url.startswith("postgresql://"):
        return url
    return None


class _MigrationLock:
    """Best-effort cross-process migration lock for PostgreSQL."""

    def __init__(self) -> None:
        self._conn = None

    def __enter__(self) -> "_MigrationLock":
        dsn = _postgres_dsn()
        if not dsn:
            return self
        try:
            import psycopg2
        except ImportError:  # pragma: no cover - deployment image always has it
            print("WARNING: psycopg2 unavailable; running migrations without a lock")
            return self

        try:
            self._conn = psycopg2.connect(dsn, connect_timeout=5)
            self._conn.autocommit = True
            with self._conn.cursor() as cursor:
                cursor.execute("SET lock_timeout = %s", (f"{_LOCK_TIMEOUT_SECONDS}s",))
                cursor.execute("SELECT pg_advisory_lock(%s)", (_ADVISORY_LOCK_KEY,))
            print("🔒 Acquired migration advisory lock")
        except Exception as exc:  # noqa: BLE001 - fail loudly, do not migrate unlocked
            if self._conn is not None:
                self._conn.close()
                self._conn = None
            raise RuntimeError(
                f"Could not acquire the database migration lock: {exc}"
            ) from exc
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._conn is None:
            return
        try:
            with self._conn.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", (_ADVISORY_LOCK_KEY,))
        finally:
            self._conn.close()
            self._conn = None


def run_migrations():
    """Run all pending database migrations"""
    print("🔄 Running database migrations...")
    print(f"   Database: {_safe_db_info()}")

    try:
        with _MigrationLock():
            env = dict(os.environ)
            env.setdefault("PGOPTIONS", _PG_OPTIONS)
            result = subprocess.run(
                ["alembic", "upgrade", "head"],
                check=True,
                text=True,
                timeout=_MIGRATION_TIMEOUT_SECONDS,
                env=env,
            )

        print(result.stdout or "")
        print("✅ Migrations completed successfully!")
        return 0

    except subprocess.TimeoutExpired:
        print(
            f"❌ Migration timed out after {_MIGRATION_TIMEOUT_SECONDS}s "
            "(check lock waits or a long index build)"
        )
        return 1
    except subprocess.CalledProcessError as e:
        print("❌ Migration failed:")
        if e.stdout:
            print(e.stdout)
        if e.stderr:
            print(e.stderr)
        return 1
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(run_migrations())
