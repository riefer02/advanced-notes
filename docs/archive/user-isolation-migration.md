# User Isolation & Database Migrations

**Status:** ✅ Implemented  
**Date:** November 11, 2025

## Overview

The application now has complete user isolation - each user only sees their own notes. This document explains the implementation and how migrations work.

---

## What Changed

### 1. Database Schema

Added `user_id` column to the `notes` table:

```sql
ALTER TABLE notes ADD COLUMN user_id VARCHAR(255) NOT NULL;
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_user_folder ON notes(user_id, folder_path);
CREATE INDEX idx_notes_user_created ON notes(user_id, created_at);
CREATE INDEX idx_notes_user_updated ON notes(user_id, updated_at);
```

### 2. Migration System

- **Tool:** Alembic (Django-style autogenerate)
- **Location:** `backend/alembic/`
- **Current Migration:** `1ec4c0eb879f_add_user_id_for_user_isolation_to_.py`

### 3. Storage Layer Updates

All storage methods now require `user_id` parameter:

```python
# Before
storage.save_note(content, metadata)
storage.list_notes(folder='inbox')

# After
storage.save_note(user_id, content, metadata)
storage.list_notes(user_id, folder='inbox')
```

### 4. API Routes

All routes now use `@require_auth` decorator and extract `user_id` from JWT token:

```python
@bp.get("/notes")
@require_auth
def list_notes():
    user_id = g.user_id  # From Clerk JWT token
    notes = storage.list_notes(user_id, ...)
```

---

## How Migrations Work

### Development (SQLite)

```bash
cd backend

# Create a new migration (autogenerate from models)
uv run alembic revision --autogenerate -m "description"

# Run migrations
uv run alembic upgrade head

# Rollback one migration
uv run alembic downgrade -1

# View migration history
uv run alembic history
```

### Production (Railway + PostgreSQL)

Migrations run **automatically** on every deployment:

1. Git push triggers Railway deployment
2. Railway runs `release` command from `Procfile`
3. `migrate.py` script executes `alembic upgrade head`
4. Then starts the web server

**Procfile:**
```
release: python migrate.py
web: gunicorn -w 4 -b 0.0.0.0:$PORT wsgi:app
```

---

## Migration Strategy

The migration handles both scenarios:

### Scenario 1: Fresh Database (New Install)
- Creates `notes` table with `user_id` from the start
- No data migration needed

### Scenario 2: Existing Database (Production)
- Detects existing `notes` table
- Adds `user_id` column
- Creates indexes for user-scoped queries

---

## Authentication Flow

### Frontend → Backend

1. **User signs in via Clerk** (dashboard page)
2. **Frontend gets JWT token:** `useAuth().getToken()`
3. **API calls include token:** `Authorization: Bearer <token>`
4. **Backend verifies JWT:** `@require_auth` decorator
5. **Extracts user_id:** `g.user_id = payload.get('sub')`
6. **All queries filtered by user_id**

### Security

✅ JWT verified with Clerk's public keys (JWKS)  
✅ Every API request requires valid token  
✅ User can only access their own notes  
✅ SQL queries include `WHERE user_id = ?`  
✅ Indexes optimized for user-scoped queries

---

## Creating New Migrations

### Auto-generate from models

1. **Update SQLAlchemy models** in `backend/app/database.py`
2. **Generate migration:**
   ```bash
   cd backend
   uv run alembic revision --autogenerate -m "add new column"
   ```
3. **Review the generated migration** in `alembic/versions/`
4. **Test locally:**
   ```bash
   uv run alembic upgrade head
   ```
5. **Commit and push** - Railway will auto-apply on deploy

### Manual migration

If you need more control:

```bash
cd backend
uv run alembic revision -m "custom migration"
# Edit the generated file in alembic/versions/
# Add your upgrade() and downgrade() logic
uv run alembic upgrade head
```

---

## Database Comparison

### SQLite (Development)

```sql
CREATE TABLE notes (
    id VARCHAR(36) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    tags TEXT,  -- JSON string
    created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
    updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
    word_count INTEGER,
    confidence FLOAT,
    transcription_duration FLOAT,
    model_version VARCHAR(50),
    PRIMARY KEY (id)
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE notes_fts USING fts5(
    note_id UNINDEXED,
    title,
    content,
    tags
);
```

### PostgreSQL (Production)

```sql
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    tags JSONB,  -- Native JSON type
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    word_count INTEGER DEFAULT 0,
    confidence REAL,
    transcription_duration REAL,
    model_version TEXT,
    search_vector tsvector  -- PostgreSQL full-text search
);

-- Trigger to auto-update search_vector
CREATE TRIGGER notes_search_vector_update
BEFORE INSERT OR UPDATE ON notes
FOR EACH ROW EXECUTE FUNCTION notes_search_update();
```

---

## Testing User Isolation

### Local Testing

1. **Sign up with two different accounts**
2. **Create notes as User A**
3. **Sign out and sign in as User B**
4. **Verify User B cannot see User A's notes**

### Production Verification

```bash
# Check Railway logs
railway logs

# Look for migration output:
# 🔄 Running database migrations...
# ✅ Migrations completed successfully!
```

### Database Inspection

```sql
-- Check user_id column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'notes';

-- Verify user isolation
SELECT user_id, COUNT(*) as note_count 
FROM notes 
GROUP BY user_id;
```

---

## Troubleshooting

### Migration fails on Railway

**Check logs:**
```bash
railway logs --filter "migrate"
```

**Common issues:**
- Missing `DATABASE_URL` env var
- PostgreSQL connection timeout
- Syntax error in migration file

**Solution:**
- Verify `DATABASE_URL` is set (Railway auto-sets this)
- Check PostgreSQL database is running
- Test migration locally first

### SQLite to PostgreSQL differences

The migration handles both, but be aware:
- **Tags:** SQLite uses TEXT (JSON string), PostgreSQL uses JSONB
- **Search:** SQLite uses FTS5, PostgreSQL uses tsvector
- **Type conversions:** Handled automatically by Alembic

---

## Best Practices

### When making schema changes:

1. ✅ Update `backend/app/database.py` models first
2. ✅ Generate migration with descriptive message
3. ✅ Review generated migration (auto-generate isn't perfect)
4. ✅ Test locally with SQLite
5. ✅ Test rollback: `alembic downgrade -1`
6. ✅ Commit both model changes and migration
7. ✅ Deploy to Railway (migrations run automatically)
8. ✅ Monitor Railway logs for migration success

### Avoid:

- ❌ Manually editing database in production
- ❌ Skipping local testing
- ❌ Deleting migration files
- ❌ Modifying applied migrations (create new one instead)

---

## Future Enhancements

Potential improvements:

- [ ] Add database backups before migrations
- [ ] Add migration dry-run mode
- [ ] Create admin dashboard for legacy note reassignment
- [ ] Add multi-tenancy (teams/organizations)
- [ ] Add note sharing between users
- [ ] Add audit log for user actions

---

## Reference

- **Alembic Docs:** https://alembic.sqlalchemy.org/
- **Clerk Auth:** https://clerk.com/docs
- **Railway Deployments:** https://docs.railway.app/deploy/deployments
- **SQLAlchemy Migrations:** https://docs.sqlalchemy.org/en/20/

---

**Questions?** Check the codebase:
- Migration: `backend/alembic/versions/1ec4c0eb879f_*.py`
- Models: `backend/app/database.py`
- Storage: `backend/app/services/storage.py`
- Routes: `backend/app/routes.py`
- Auth: `backend/app/auth.py`

