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

## Verification Before Finishing

1. **Frontend changes**: Run `cd frontend && npm run build` - fix TypeScript/build errors
2. **Backend changes**: Run `cd backend && uv run python -m pytest tests/` - ensure tests pass

## Environment Variables

Backend (`backend/.env`):
- `OPENAI_API_KEY` - Required for transcription and AI
- `CLERK_DOMAIN` - JWT issuer domain
- `AUDIO_CLIPS_ENABLED` - Feature flag for S3 audio storage

Frontend (`frontend/.env.local`):
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `VITE_API_URL` - Backend URL (default: http://localhost:5001)
