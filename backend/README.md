# Chisos Backend

Flask API for audio transcription, AI organization, and the notes app (notes, todos, meals, vinyl, sharing, admin).

See the [project README](../README.md) for the full stack and [docs/](../docs/README.md) for guides.

## Features

- **Transcription**: OpenAI `gpt-transcribe`
- **AI Categorization**: GPT-6 Luna with structured outputs, plus meal and vinyl extraction
- **Note Quality**: Generated titles/summaries, editable notes, revisions, source-audio playback
- **Authentication**: Clerk JWT verification with per-user isolation
- **Storage**: SQLite (dev) / PostgreSQL (prod) with FTS and vector search
- **Migrations**: Alembic for database schema management
- **Background work**: Durable email outbox, usage quotas, ops events and digests

## Setup

```bash
# Install dependencies
uv sync

# Create .env with the required variables
cat > .env << EOF
OPENAI_API_KEY=sk-your-key-here
# Optional overrides
OPENAI_MODEL=gpt-6-luna
OPENAI_REASONING_EFFORT=none
TRANSCRIBE_MODEL=gpt-transcribe
# Required in production: Clerk issuer domain (no https://)
CLERK_DOMAIN=your-app.clerk.accounts.dev
# Required in production: frontend origin allowed by CORS
FRONTEND_URL=https://your-frontend.example.com
# Omit for local SQLite (backend/.notes.db)
# DATABASE_URL=postgresql://user:pass@host:5432/dbname
EOF

# Run database migrations
uv run alembic upgrade head

# Start the development server
./run.sh
```

Optional integrations (S3 audio/images, SES notifications) are documented in
[docs/environment-setup.md](../docs/environment-setup.md) and
[docs/audio-clips-s3.md](../docs/audio-clips-s3.md).

## Service Container (Dependency Injection)

Routes do not construct global singletons. Instead, the app initializes a `Services` container and stores it on the Flask app:

- `backend/app/services/container.py`: `Services`, `create_services()`, `get_services()`
- `backend/app/__init__.py`: attaches `app.extensions["services"] = create_services()`
- `backend/app/routes/`: each blueprint calls `svc = get_services()` per-request

This keeps route code thin and lets route tests inject fakes by overriding `app.extensions["services"]`.

## API

All endpoints (except `/api/health`) require `Authorization: Bearer <token>` and are scoped to the authenticated user.

Route modules under `backend/app/routes/` cover:

- **Notes**: transcribe, create/edit/delete, revisions, search, folders, tags
- **Todos**: suggested and accepted action items
- **Meals**: transcriptions, entries, calendar
- **Vinyl**: records, tracks, images
- **Sharing**: profiles, friends, resource shares
- **Admin & ops**: dashboard, reports, feedback, health/readiness
- **System**: settings, usage, webhooks

See [docs/api-reference.md](../docs/api-reference.md) for request/response details.

Server runs on **http://localhost:5001**.

## Database Migrations

```bash
# Create new migration (autogenerate from models)
uv run alembic revision --autogenerate -m "description"

# Apply migrations
uv run alembic upgrade head

# View history
uv run alembic history

# Rollback one migration
uv run alembic downgrade -1
```

## Running Tests

```bash
cd backend
uv run python -m pytest tests/
```

## Deployment

Railway uses `backend/Procfile` (`python migrate.py && gunicorn ...`) and `backend/railway.toml`.
See [docs/railway-deployment.md](../docs/railway-deployment.md).
