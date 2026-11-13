# Chisos

**Production-ready audio-first notes application**:

- **Frontend**: Vite + React + TypeScript + Tailwind CSS + TanStack Query/Router
- **Backend**: Flask + OpenAI (`gpt-transcribe` transcription, GPT-6 Luna categorization)
- **Data**: SQLite with FTS5 (dev) / PostgreSQL with FTS + vector search (prod)
- **Auth**: Clerk JWT with per-user isolation
- **Deployment-friendly**: No GPU required, pure API calls

---

## 📚 Documentation

**Complete documentation**: See [`docs/`](./docs/) folder

- **[Environment Setup](./docs/environment-setup.md)** - API keys, configuration
- **[API Reference](./docs/api-reference.md)** - Complete endpoint documentation
- **[Audio clips (S3)](./docs/audio-clips-s3.md)** - Optional audio storage + upload/playback flow
- **[Roadmap & Status](./docs/roadmap.md)** - What is done and what is next
- **[Documentation Index](./docs/README.md)** - Full documentation catalog

## 🚀 Quick Start

### Prerequisites

- **Node.js 20.19+ or 22.12+** ([Vite requirements](https://vite.dev/guide/))
- **Python 3.11+**
- **uv** (install with: `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **OpenAI API key** (for transcription + AI categorization) - See [environment setup](./docs/environment-setup.md)

### Backend Setup

```bash
cd backend

# Install dependencies (creates .venv and installs from pyproject.toml)
uv sync

# Create .env file with your OpenAI API key
echo "OPENAI_API_KEY=sk-your-key-here" > .env

# Optional: enable audio clips (S3-backed)
# echo "AUDIO_CLIPS_ENABLED=true" >> .env
# echo "S3_BUCKET=your-bucket-name" >> .env

# Start Flask server on http://localhost:5001
./run.sh
```

**First run:** No model download needed! Uses OpenAI API for transcription.

### Frontend Setup

Open a **new terminal**:

```bash
cd frontend

# Install Node dependencies
pnpm install

# Start Vite dev server on http://localhost:5173
pnpm run dev
```

Visit **http://localhost:5173** and record or upload audio (MP3, WAV, WebM, M4A, etc.) to see the transcription.

---

## 📁 Project Structure

```
chisos/
├─ README.md              # This file
├─ .gitignore
├─ Makefile               # Optional: run both servers with 'make dev'
│
├─ backend/               # Flask + OpenAI API
│  ├─ pyproject.toml      # uv project definition
│  ├─ uv.lock             # Dependency lock file (committed)
│  ├─ run.sh              # Dev server launcher
│  ├─ wsgi.py             # WSGI entry point
│  └─ app/
│     ├─ __init__.py      # Flask app factory, CORS, error handlers
│     ├─ asr.py           # OpenAI transcription API client
│     ├─ auth.py          # Clerk JWT verification
│     ├─ config.py        # Environment-backed configuration
│     ├─ database.py      # SQLAlchemy models (schema source of truth)
│     ├─ routes/          # REST API blueprints, one module per feature
│     └─ services/        # AI services + storage/ package (per-feature mixins)
│
└─ frontend/              # Vite + React + TS + Tailwind
   ├─ package.json
   ├─ pnpm-lock.yaml      # pnpm is the only supported package manager
   ├─ vite.config.ts
   ├─ tsconfig.json
   ├─ index.html
   ├─ .env.example        # Copy to .env.local
   └─ src/
      ├─ main.tsx         # Providers, router, auth token bridge
      ├─ routes/          # TanStack Router file-based routes
      ├─ components/      # UI components (+ ui/ primitives)
      ├─ hooks/           # TanStack Query hooks
      └─ lib/api/         # Typed API client (core.ts + feature modules)
```

---

## 🔧 How It Works

### Backend (`backend/`)

1. **Transcription** (`app/asr.py`):
   - Uses **OpenAI gpt-transcribe** API
   - Supports: MP3, WAV, WebM, M4A, MP4, MPEG, MPGA (up to 25MB)
   - No local model download required
   - Fast, reliable, API-based transcription

2. **AI Categorization** (`app/services/ai_categorizer.py`):
   - Uses **OpenAI GPT-6 Luna** for semantic analysis
   - Generates folder paths, human-readable titles, summaries, filenames, and tags automatically
   - Structured JSON outputs for reliability

3. **Storage** (`app/services/storage/`):
   - **SQLite** for local dev, **PostgreSQL** in production
   - Full-text search and vector embeddings for semantic retrieval
   - CRUD operations, folder hierarchy, tag management
   - Split into per-feature mixins (`notes.py`, `todos.py`, `meals.py`, `vinyl.py`, `sharing.py`, …)

4. **REST API** (`app/routes/`):
   - Endpoints for transcription, notes, todos, meals, vinyl, sharing, admin, and **Ask Notes**
   - Returns JSON responses with comprehensive metadata

5. **CORS**: Enabled via `flask-cors` so the Vite dev server (`:5173`) can call Flask (`:5001`); production origins come from `FRONTEND_URL`

### Frontend (`frontend/`)

- **Vite**: Fast dev server with HMR
- **React + TypeScript**: Type-safe components
- **Tailwind CSS**: Utility-first styling
- **AudioUploader component**: File upload → POST to `/api/transcribe` → display transcript + metadata

---

## 📊 API Reference

### `POST /api/transcribe`

**Request:**
- **Multipart form-data** with `file` field, OR
- **Raw audio bytes** in body

**Response:**
```json
{
  "text": "transcribed speech text",
  "meta": {
    "device": "openai-api",
    "model": "gpt-transcribe",
    "language": "en",
    "duration": 3.45
  },
  "categorization": {
    "note_id": "abc123",
    "title": "New Product Feature Idea",
    "summary": "A short note about a product feature idea.",
    "folder_path": "Ideas/Product",
    "filename": "new_feature_idea.txt",
    "tags": ["product", "feature"],
    "confidence": 0.95,
    "reasoning": "This appears to be a product feature idea..."
  }
}
```

**Error:**
```json
{
  "error": "error message"
}
```

### `GET /api/health`

**Response:**
```json
{
  "status": "ok"
}
```

### `POST /api/ask`

Ask a natural-language question about your notes. The backend creates a structured query plan and performs hybrid retrieval (filters + full-text search + embeddings) before generating a markdown answer with sources.

---

## 🛠️ Development Commands

### Backend

```bash
cd backend

# Install/update dependencies
uv sync

# Add a new dependency
uv add <package-name>

# Run Flask dev server
./run.sh

# Or manually:
uv run flask run --host 0.0.0.0 --port 5001
```

### Frontend

```bash
cd frontend

# Install dependencies
pnpm install

# Dev server (http://localhost:5173)
pnpm run dev

# Production build
pnpm run build

# Preview production build
pnpm run preview

# Lint
pnpm run lint
```

### Both (Optional Makefile)

```bash
# Start both backend and frontend
make dev
```

---

## ☁️ Deployment Notes

- **Backend**: Railway via `backend/Procfile` — runs `migrate.py` then Gunicorn
- **Frontend**: static `dist/` build served with the included `frontend/Caddyfile`
- **Database**: PostgreSQL in production, SQLite for local development
- **No GPU required**: pure API-based transcription, no model downloads

See [Railway Deployment](./docs/railway-deployment.md) for the full setup.

---

## 🔍 Troubleshooting

### Backend

**"OPENAI_API_KEY is required"**
- Create `backend/.env` file with your API key
- Get key from: https://platform.openai.com/api-keys
- See [environment setup](./docs/environment-setup.md)

**Ask Notes returns 500**
- Verify `OPENAI_API_KEY` is set
- Ensure your OpenAI project has access to the configured models:
  - `OPENAI_MODEL` (default: `gpt-6-luna`)
  - `TRANSCRIBE_MODEL` (default: `gpt-transcribe`)
  - `OPENAI_EMBEDDING_MODEL` (default: `text-embedding-3-small`)

**Transcription fails with 401 error**
- Check your API key is valid
- Ensure you have credits/billing set up on OpenAI

**Transcription fails with 404/model_not_found**
- The project may not have access to `TRANSCRIBE_MODEL` yet
- Check `GET /v1/models` or temporarily set `TRANSCRIBE_MODEL` to a model the project can use

**Transcription too slow**
- OpenAI API typically responds in 1-3 seconds
- Check your internet connection
- Verify API status: https://status.openai.com/

### Frontend

**CORS errors**
- Ensure backend is running on `:5001`
- Check `frontend/.env.local` has `VITE_API_URL=http://localhost:5001`
- In production, set `FRONTEND_URL` so the backend allows the deployed origin

**Build errors**
- Delete `node_modules/` and run `pnpm install` again
- Verify Node version: `node -v` (should be 20.19+ or 22.12+)

**Audio recording/upload fails**
- Check browser console for errors
- Ensure microphone permissions are granted
- OpenAI supports: MP3, MP4, MPEG, MPGA, M4A, WAV, WebM (max 25MB)

---

## 📦 Production Considerations

### Backend

- **CORS**: Allowed origins are localhost plus `FRONTEND_URL` (see `app/__init__.py`)
- **File size limits**: Enforced by `MAX_AUDIO_BYTES`, `MAX_IMAGE_BYTES`, and `MAX_AVATAR_BYTES` in `app/config.py`
- **Rate limiting**: Sliding-window budgets in `app/services/rate_limit.py` plus usage quotas
- **Authentication**: Clerk JWTs enforced by `@require_auth`; all queries are user-scoped
- **Deployment**: Gunicorn via `backend/Procfile` (migrations run first)

### Frontend

- **Build for production**:
  ```bash
  pnpm run build
  # Output in frontend/dist/
  ```
- **Environment variables**: Set `VITE_API_URL` and `VITE_CLERK_PUBLISHABLE_KEY`
- **Static hosting**: Serve `dist/` behind the `frontend/Caddyfile`

### Transcription

- **Model**: `gpt-transcribe` for uploaded recordings. The `gpt-4o-*-transcribe` family shuts down on 2027-02-26.
- **Cost monitoring**: Track OpenAI API usage on dashboard
- **Quality**: Use `prompt`, `keywords`, and `languages` (via `extra_body`) for domain terms and multilingual audio
- **Streaming a completed file**: `stream=True` returns SSE transcript events; it is not live audio
- **Realtime**: Use a Realtime transcription session with `gpt-live-transcribe` and client-side VAD; see [realtime transcription docs](https://developers.openai.com/api/docs/guides/realtime-transcription)
- **Diarization/timestamps**: No current non-deprecated OpenAI model. `gpt-4o-transcribe-diarize` and `whisper-1` shut down 2027-02-26, so don't build on them

---

## 📚 Key Technologies & References

| Component | Link |
|-----------|------|
| **OpenAI Transcription** | [Speech to Text Docs](https://developers.openai.com/api/docs/guides/speech-to-text) |
| **GPT-6 Luna** | [Model Docs](https://developers.openai.com/api/docs/models/gpt-6-luna) |
| **TanStack Query** | [React Query Docs](https://tanstack.com/query/latest) |
| **SQLite FTS5** | [Full-Text Search](https://www.sqlite.org/fts5.html) |
| **Vite** | [Getting Started](https://vite.dev/guide/) |
| **Tailwind CSS** | [Vite Setup](https://tailwindcss.com/docs/guides/vite) |
| **Flask** | [Quickstart](https://flask.palletsprojects.com/en/stable/quickstart/) |
| **uv** | [Installation](https://docs.astral.sh/uv/getting-started/installation/) |

---

## 🎯 Acceptance Criteria ✅

- ✅ Vite frontend with Tailwind for recording/uploading audio
- ✅ OpenAI API transcription (gpt-transcribe)
- ✅ AI-powered categorization (GPT-6 Luna)
- ✅ Generated note titles and summaries, with revisions and restore
- ✅ Editable notes with source-audio playback
- ✅ Typed notes, todos, meals, and vinyl library
- ✅ Clerk authentication with per-user data isolation
- ✅ Sharing: friends, shared vinyl libraries, collaborative meal calendars
- ✅ SQLite (dev) / PostgreSQL (prod) with FTS and vector search
- ✅ REST API covering notes, folders, tags, search, todos, meals, vinyl, sharing, and admin
- ✅ Split-pane layout with folder navigation
- ✅ TanStack Query + TanStack Router
- ✅ Keyboard navigation and accessibility
- ✅ CORS configured for local and deployed origins
- ✅ Deployment-ready (no GPU required)

---

## 🚧 Future Enhancements

Tracked with exit criteria in the [roadmap](./docs/roadmap.md):

- [ ] Backups and a tested restore drill
- [ ] External uptime monitoring and error reporting (Sentry)
- [ ] Realtime transcription with WebSocket (`gpt-live-transcribe`)
- [ ] Speaker diarization (deferred: no non-deprecated OpenAI model as of Oct 2026)
- [ ] Bulk operations (move, delete, export)
- [ ] One-click export as Markdown/JSON/PDF
- [ ] Mobile/quick capture everywhere
- [ ] Real-time collaboration

---

## 📝 License

This is a proof-of-concept template.

---

**Built with ❤️ for easy deployment**

