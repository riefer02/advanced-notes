# ASR Backend

Flask API server with OpenAI GPT-4o-mini-transcribe for speech-to-text.

## Features

- **Transcription**: OpenAI GPT-4o-mini-transcribe API
- **AI Categorization**: GPT-4o-mini with structured outputs
- **Authentication**: Clerk JWT verification with user isolation
- **Storage**: SQLite (dev) / PostgreSQL (prod) with full-text search
- **Migrations**: Alembic for database schema management
- **11 REST API Endpoints**: Complete CRUD for notes, folders, tags, search (all user-scoped)

## Setup

```bash
# Install dependencies
uv sync

# Create .env file with required variables
cat > .env << EOF
OPENAI_API_KEY=sk-your-key-here
CLERK_DOMAIN=your-app.clerk.accounts.dev
CLERK_SECRET_KEY=sk_test_your_secret_key
EOF

# Run database migrations
uv run alembic upgrade head

# Start development server
./run.sh
```

## API Endpoints

All endpoints (except `/api/health`) require authentication via `Authorization: Bearer <token>` header.

- `POST /api/transcribe` - Transcribe audio + categorize + save (user-scoped)
- `GET /api/notes` - List user's notes
- `GET /api/notes/<id>` - Get specific note (user-scoped)
- `PUT /api/notes/<id>` - Update note (user-scoped)
- `DELETE /api/notes/<id>` - Delete note (user-scoped)
- `GET /api/folders` - Get user's folder hierarchy
- `GET /api/folders/<path>/stats` - Folder statistics (user-scoped)
- `GET /api/tags` - List user's tags
- `GET /api/tags/<tag>/notes` - Get notes by tag (user-scoped)
- `GET /api/search?q=` - Full-text search (user-scoped)
- `GET /api/health` - Health check (public)

Server runs on **http://localhost:5001**

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

## Deployment Benefits

- ✅ No GPU required (API-based transcription)
- ✅ No model downloads (no HuggingFace cache)
- ✅ Lightweight (only ~30 packages)
- ✅ Platform-agnostic (works on any OS)
