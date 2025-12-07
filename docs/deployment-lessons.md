# Deployment Lessons Learned
**Last Updated:** December 7, 2025

This document captures critical learnings from the "Smart Summary" feature deployment to ensure smoother future releases.

## 1. Database Migrations & Start-up Reliability

### The Issue
We relied on the `release:` command in the `Procfile` to run database migrations. On Railway (and potentially other PaaS), this command was either skipped or failed silently in the environment context, leading to a `relation "digests" does not exist` error because the table wasn't created.

### The Fix
**Force migrations on startup.**
Instead of relying on the platform's "release" phase, we changed the `web` command to explicitly run migrations before starting the server:

```bash
# Procfile
web: python migrate.py && gunicorn -w 4 -b 0.0.0.0:$PORT wsgi:app
```

**Rule for Future:**
Always ensure migrations are part of the **application startup chain** in production to guarantee the schema matches the code.

## 2. Environment Variable Visibility (The "SQLite Ghost")

### The Issue
The application code fell back to SQLite (default dev behavior) because `os.getenv("DATABASE_URL")` appeared missing/empty to the Gunicorn worker, even though the migration script saw it. This caused a confusing `sqlite3.OperationalError: vtable constructor failed: notes_fts` error in production (which runs Postgres), because the app tried to access SQLite-specific FTS tables.

### The Fix
**Fail fast in Production.**
We updated `backend/app/database.py` to explicitly check for `FLASK_ENV=production`. If detected, it **must** find `DATABASE_URL` or raise a hard error immediately.

```python
if os.getenv("FLASK_ENV") == "production" and not database_url:
    raise ValueError("DATABASE_URL is not set in production!")
```

**Rule for Future:**
Never allow "silent fallbacks" for critical infrastructure (DB, Auth) in production. Explicitly validate the environment configuration on startup.

## 3. Service Initialization & Resiliency

### The Issue
The `AISummarizerService` was initialized at the module level in `routes.py`. This caused the entire Flask application to crash on startup if `OPENAI_API_KEY` was missing, even if the summarization feature wasn't being used.

### The Fix
**Lazy Initialization.**
We moved the service instantiation inside the route handler:

```python
@bp.post("/summarize")
def summarize():
    try:
        summarizer = AISummarizerService() # Init here
    except ValueError:
        return jsonify({"error": "Service not configured"}), 503
```

**Rule for Future:**
Initialize external service clients (OpenAI, AWS, etc.) lazily or within a factory function to prevent configuration errors from blocking the entire application boot.

## 4. Cross-Database Compatibility (SQLite vs Postgres)

### The Issue
The application supports both SQLite (Dev) and Postgres (Prod). We encountered issues where SQLite-specific features (FTS5 Virtual Tables) were referenced or expected in the Postgres environment.

### The Fix
**Dialect Checks.**
Ensure code that uses `notes_fts` or other specific features checks `storage.dialect == 'sqlite'` before execution. The storage layer already handles this, but the "SQLite Ghost" issue (see #2) bypassed this check by making the app *think* it was on SQLite.

**Rule for Future:**
Test DB-specific logic carefully. If using SQLite for dev and Postgres for prod, ensure all dialect-specific code is strictly guarded.

