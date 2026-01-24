#!/usr/bin/env python3
"""
Database migration script for Railway deployments.

This script runs Alembic migrations during the build/deploy process.
"""

import os
import subprocess
import sys


def _safe_db_info() -> str:
    """Return database type without exposing credentials."""
    url = os.getenv("DATABASE_URL")
    if not url:
        return "SQLite (development)"
    if url.startswith("postgresql"):
        return "PostgreSQL"
    if url.startswith("mysql"):
        return "MySQL"
    return "Database configured"


def run_migrations():
    """Run all pending database migrations"""
    print("🔄 Running database migrations...")
    print(f"   Database: {_safe_db_info()}")
    
    try:
        # Run alembic upgrade using subprocess
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            check=True,
            capture_output=True,
            text=True
        )
        
        print(result.stdout)
        print("✅ Migrations completed successfully!")
        return 0
        
    except subprocess.CalledProcessError as e:
        print("❌ Migration failed:")
        print(e.stdout)
        print(e.stderr)
        return 1
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(run_migrations())

