#!/usr/bin/env python3
"""
Database migration script for Railway deployments.

This script runs Alembic migrations during the build/deploy process.
"""

import subprocess
import sys
import os


def run_migrations():
    """Run all pending database migrations"""
    print("🔄 Running database migrations...")
    print(f"   Database: {os.getenv('DATABASE_URL', 'SQLite (development)')}")
    
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
        print(f"❌ Migration failed:")
        print(e.stdout)
        print(e.stderr)
        return 1
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(run_migrations())

