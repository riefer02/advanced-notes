# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chisos is a production-ready notes application with audio transcription and AI-powered categorization. It's a full-stack monorepo with a Flask/Python backend and React/TypeScript frontend.

## Commands

### Development
```bash
make dev                 # Start both backend and frontend
make backend             # Start only Flask (http://localhost:5001)
make frontend            # Start only Vite (http://localhost:5173)
```

### Backend
```bash
cd backend && ./run.sh                           # Start Flask dev server
cd backend && uv sync                            # Install dependencies
cd backend && uv add <package>                   # Add new dependency
cd backend && uv run python -m pytest tests/    # Run test suite
cd backend && uv run python -m pytest -x tests/ # Run tests, stop on first failure
```

### Frontend
```bash
cd frontend && npm run dev      # Start Vite dev server
cd frontend && npm run build    # Production build with type checking
cd frontend && npm run lint     # ESLint (zero-warning policy)
```

### Database Migrations
```bash
cd backend && uv run alembic upgrade head                          # Apply migrations
cd backend && uv run alembic revision --autogenerate -m "message"  # Create migration
```

## Architecture

### Tech Stack
- **Backend**: Flask + Python 3.11+ + SQLAlchemy + OpenAI API
- **Frontend**: Vite + React 18 + TypeScript + TanStack Router + TanStack Query + Tailwind CSS
- **Auth**: Clerk JWT (all endpoints except `/api/health` require auth)
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **Package Management**: `uv` (backend), `pnpm` or `npm` (frontend)

### Key Directories
- `backend/app/routes.py` - REST API endpoints (11 total)
- `backend/app/services/` - Business logic (storage, AI categorization, embeddings, S3)
- `backend/app/database.py` - SQLAlchemy models (source of truth for schema)
- `frontend/src/routes/` - TanStack Router file-based routes
- `frontend/src/components/` - React components
- `frontend/src/lib/api.ts` - Type-safe API client with auth headers

### Patterns

**User Isolation**: All database tables have `user_id` column. All queries filter by authenticated user from JWT `sub` claim. Storage layer methods require `user_id` as first parameter.

**Backend Auth**: Routes use `@require_auth` decorator → extract `user_id = g.user_id` → pass to storage methods.

**Dependency Injection**: Services accessed via `get_services()` from `app.extensions["services"]`. Tests can override the container to inject fakes.

**Testing Seam**: When `app.config["TESTING"] == True`, authenticate with `X-Test-User-Id` header instead of Clerk JWT.

## Verification Before Finishing (REQUIRED)

**ALWAYS run these checks before committing or pushing code. CI will fail otherwise.**

### Backend changes:
```bash
cd backend && uv run ruff check app/ --fix      # Fix lint issues
cd backend && uv run python -m pytest tests/    # Run all tests
```

### Frontend changes:
```bash
cd frontend && npm run lint                     # ESLint (zero-warning policy)
cd frontend && npm run format:check             # Prettier formatting
cd frontend && npm run test:run                 # Run Vitest tests
cd frontend && npm run build                    # TypeScript + production build
```

### Full verification (run all):
```bash
# Backend
cd backend && uv run ruff check app/ --fix && uv run python -m pytest tests/

# Frontend
cd frontend && npm run lint && npm run format:check && npm run test:run && npm run build
```

## Testing

### Backend Tests
```bash
cd backend && uv run python -m pytest tests/              # Run all tests
cd backend && uv run python -m pytest tests/ -x          # Stop on first failure
cd backend && uv run python -m pytest tests/ -k "search" # Run tests matching keyword
cd backend && uv run python -m pytest tests/ -v          # Verbose output
cd backend && uv run python -m pytest tests/ --cov       # With coverage report
```

**Writing Backend Tests:**
- Use pytest fixtures from `conftest.py` or define in test file
- Use `X-Test-User-Id` header for auth in test client requests
- Create fake service classes (e.g., `_FakeEmbeddings`) to avoid external API calls
- Tests are in `backend/tests/` - see `test_happy_path.py` for comprehensive examples

### Frontend Tests
```bash
cd frontend && npm test              # Run tests in watch mode
cd frontend && npm run test:run      # Run tests once
cd frontend && npm run test:coverage # Run with coverage
```

**Writing Frontend Tests:**
- Use Vitest + React Testing Library
- Test files: `*.test.tsx` alongside components or in `__tests__/` directories
- Mock hooks with `vi.mock()` when testing components that use TanStack Query
- Use `screen.getByRole()`, `screen.getByText()` for accessible queries
- See `EmptyState.test.tsx`, `QueryStateRenderer.test.tsx` for examples

## Linting & Formatting

### Backend
```bash
cd backend && uv run ruff check app/         # Lint Python code
cd backend && uv run ruff check app/ --fix   # Auto-fix issues
cd backend && uv run mypy app/               # Type check
```

### Frontend
```bash
cd frontend && npm run lint          # ESLint check
cd frontend && npm run format        # Format with Prettier
cd frontend && npm run format:check  # Check formatting
```

## Code Organization Guide

### Adding a New API Endpoint
1. Add route in `backend/app/routes.py` with `@bp.get/post/put/delete` and `@require_auth`
2. Add storage method in `backend/app/services/storage.py` (follow user_id pattern)
3. Add Pydantic models in `backend/app/services/models.py` if needed
4. Add API function in `frontend/src/lib/api.ts`
5. Add TanStack Query hook in `frontend/src/hooks/` if needed

### Adding a New Service
1. Create service class in `backend/app/services/`
2. Register in `backend/app/services/container.py`
3. Access via `svc = get_services()` in routes

### Adding a New Frontend Component
1. Create component in `frontend/src/components/`
2. Use `QueryStateRenderer` for loading/error states
3. Use `EmptyState` for empty content states
4. Add TanStack Query hooks in `frontend/src/hooks/`

### Adding a New Route (Frontend)
1. Create file in `frontend/src/routes/` (file-based routing)
2. Run `npm run dev` to regenerate route tree
3. Routes are auto-registered by TanStack Router

## Common Debugging Tips

### Backend
- Check `backend/.env` has `OPENAI_API_KEY` set
- For 401 errors: verify Clerk domain config or use `X-Test-User-Id` header in tests
- SQLite DB at `backend/.notes.db` (can delete for fresh start in dev)

### Frontend
- Check browser console for API errors
- Verify `VITE_CLERK_PUBLISHABLE_KEY` in `frontend/.env.local`
- TanStack Query DevTools available in dev mode (bottom-right corner)

## Continuous Integration

GitHub Actions workflows run automatically on PRs and pushes to `main`:

### Backend CI (`.github/workflows/ci-backend-tests.yml`)
- Triggers on changes to `backend/**`
- Runs ruff linting with GitHub annotations
- Runs pytest with coverage (minimum 50% required)
- Uploads coverage report as artifact

### Frontend CI (`.github/workflows/ci-frontend-tests.yml`)
- Triggers on changes to `frontend/**`
- Runs ESLint
- Checks Prettier formatting
- Runs Vitest with coverage
- Builds production bundle
- Uploads coverage report as artifact

### Test Coverage Requirements
- **Backend**: 50% minimum (currently ~73%)
- **Frontend**: No minimum (currently testing key utility components)

### Test Files
- `backend/tests/test_api_routes.py` - Audio clip endpoint tests
- `backend/tests/test_happy_path.py` - Comprehensive API endpoint tests (54 tests)
- `frontend/src/components/*.test.tsx` - Component unit tests (29 tests)

## Environment Variables

Backend (`backend/.env`):
- `OPENAI_API_KEY` - Required for transcription and AI
- `CLERK_DOMAIN` - JWT issuer domain
- `AUDIO_CLIPS_ENABLED` - Feature flag for S3 audio storage

Frontend (`frontend/.env.local`):
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `VITE_API_URL` - Backend URL (default: http://localhost:5001)
