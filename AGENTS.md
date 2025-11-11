# Chisos

## Stack
- Backend: Flask + Python 3.11+ (managed with `uv`)
- Frontend: Vite + React + TypeScript + TanStack Router
- Database: SQLite (dev) / PostgreSQL (prod)
- Auth: Clerk JWT
- Migrations: Alembic
- Deployment: Railway

## Database

### User Isolation
- All tables have `user_id` column
- All queries filter by authenticated `user_id` from JWT token
- Never allow cross-user data access

### Schema & Migrations
- SQLAlchemy models in `backend/app/database.py` define schema
- Create migration: `cd backend && uv run alembic revision --autogenerate -m "description"`
- Apply locally: `uv run alembic upgrade head`
- Production: Automatic via `Procfile` release command on Railway deploy

### Storage Layer Pattern
All methods in `backend/app/services/storage.py` require `user_id` as first parameter:
```python
def method_name(self, user_id: str, other_params) -> ReturnType:
    # All SQL queries include WHERE user_id = ? (SQLite) or %s (PostgreSQL)
```

## Authentication

### Backend
- All endpoints except `/api/health` require `@require_auth` decorator
- Extract user: `user_id = g.user_id` (from JWT `sub` claim)
- Pass `user_id` to all storage methods

### Frontend
- JWT token auto-added via `getAuthHeaders()` in `lib/api.ts`
- Token from `useAuth().getToken()` (Clerk)
- Sent as `Authorization: Bearer <token>` header

## Package Management

Backend:
- Add: `uv add package-name`
- Update requirements: `uv pip compile pyproject.toml -o requirements.txt`
- Commit both `pyproject.toml` and `requirements.txt`

Frontend:
- Use `pnpm` for all operations
- Commit `package.json` and `pnpm-lock.yaml`

## Adding New Features

### New Model Field
1. Update SQLAlchemy model in `backend/app/database.py`
2. Run `alembic revision --autogenerate -m "add field"`
3. Review generated migration
4. Test: `alembic upgrade head`
5. Commit migration file

### New API Endpoint
1. Add route in `backend/app/routes.py` with `@require_auth`
2. Extract `user_id = g.user_id`
3. Pass to storage method
4. All queries automatically user-scoped

## Key Files
- `backend/app/database.py` - SQLAlchemy models (source of truth)
- `backend/app/services/storage.py` - Database adapter layer
- `backend/app/routes.py` - API endpoints with auth
- `backend/app/auth.py` - JWT verification
- `backend/migrate.py` - Migration runner for Railway
- `backend/Procfile` - Railway deployment config

