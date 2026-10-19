# Chisos

**Production-ready advanced notes application** with audio transcription using:

- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Backend**: Flask + OpenAI GPT-4o-mini-transcribe (API-based)
- **Python tooling**: `uv` (fast package manager from Astral)
- **Deployment-friendly**: No GPU required, pure API calls

---

## 📚 Documentation

**Complete documentation**: See [`docs/`](./docs/) folder

- **[Environment Setup](./docs/environment-setup.md)** - OpenAI API keys, configuration
- **[Audio clips (S3)](./docs/audio-clips-s3.md)** - Optional audio storage + upload/playback flow
- **[Technical Specification](./docs/semantic-organization-spec.md)** - AI categorization architecture  
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
npm install

# Start Vite dev server on http://localhost:5173
npm run dev
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
   - Uses **OpenAI GPT-4o-mini-transcribe** API
   - Supports: MP3, WAV, WebM, M4A, MP4, MPEG, MPGA (up to 25MB)
   - No local model download required
   - Fast, reliable, API-based transcription

2. **AI Categorization** (`app/services/ai_categorizer.py`):
   - Uses **OpenAI GPT-4o-mini** for semantic analysis
   - Generates folder paths, filenames, tags automatically
   - Structured JSON outputs for reliability

3. **Storage** (`app/services/storage/`):
   - **SQLite** database with FTS5 full-text search
   - Database-only storage (no file system)
   - CRUD operations, folder hierarchy, tag management
   - Split into per-feature mixins (`notes.py`, `todos.py`, `meals.py`, `vinyl.py`, `sharing.py`, …)

4. **REST API** (`app/routes/`):
   - Endpoints for transcription, notes, folders, tags, search, and **Ask Notes**
   - Returns JSON responses with comprehensive metadata

5. **CORS**: Enabled via `flask-cors` so Vite dev server (`:5173`) can call Flask (`:5001`)

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
    "model": "gpt-4o-mini-transcribe",
    "language": "en",
    "duration": 3.45
  },
  "categorization": {
    "note_id": "abc123",
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
npm install

# Dev server (http://localhost:5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Lint
npm run lint
```

### Both (Optional Makefile)

```bash
# Start both backend and frontend
make dev
```

---

## ☁️ Deployment Notes

- **No GPU required**: Pure API-based transcription
- **No model downloads**: Everything runs via OpenAI API
- **Lightweight**: Only ~30 Python packages (vs 166 with local models)
- **Platform-agnostic**: Works on any OS with Python 3.11+
- **Easy scaling**: API handles all compute, just scale your Flask app

Check API usage via the `meta.model` field in responses.

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
  - `OPENAI_MODEL` (default: `gpt-4o-mini`)
  - `OPENAI_EMBEDDING_MODEL` (default: `text-embedding-3-small`)

**Transcription fails with 401 error**
- Check your API key is valid
- Ensure you have credits/billing set up on OpenAI

**Transcription too slow**
- OpenAI API typically responds in 1-3 seconds
- Check your internet connection
- Verify API status: https://status.openai.com/

### Frontend

**CORS errors**
- Ensure backend is running on `:5001`
- Check `frontend/.env.local` has `VITE_API_URL=http://localhost:5001`

**Build errors**
- Delete `node_modules/` and run `npm install` again
- Verify Node version: `node -v` (should be 20.19+ or 22.12+)

**Audio recording/upload fails**
- Check browser console for errors
- Ensure microphone permissions are granted
- OpenAI supports: MP3, MP4, MPEG, MPGA, M4A, WAV, WebM (max 25MB)

---

## 📦 Production Considerations

### Backend

- **CORS**: Restrict origins in production (edit `app/__init__.py`)
- **File size limits**: Use the caps in `app/config.py` (`MAX_AUDIO_BYTES`, `MAX_IMAGE_BYTES`, `MAX_AVATAR_BYTES`) and read with a bounded `file.read(limit + 1)`
- **Rate limiting**: Use `flask-limiter`
- **Authentication**: Add API keys or OAuth
- **Streaming**: Implement chunked upload + streaming ASR (if NeMo supports)
- **Deployment**: Use Gunicorn/uWSGI instead of Flask dev server
  ```bash
  uv add gunicorn
  uv run gunicorn -w 4 -b 0.0.0.0:5001 wsgi:app
  ```

### Frontend

- **Build for production**:
  ```bash
  npm run build
  # Output in frontend/dist/
  ```
- **Environment variables**: Set `VITE_API_URL` to production backend URL
- **Static hosting**: Deploy `dist/` to Vercel, Netlify, or Cloudflare Pages
- **API proxy**: Configure Vite proxy in production or use Nginx

### Transcription

- **Cost monitoring**: Track OpenAI API usage on dashboard
- **Model upgrade**: Switch to `gpt-4o-transcribe` for higher quality (more expensive)
- **Diarization**: Use `gpt-4o-transcribe-diarize` for speaker labels
- **Streaming**: Enable `stream=True` for real-time transcription
- **Prompting**: Add custom prompts to improve accuracy for specific domains

---

## 📚 Key Technologies & References

| Component | Link |
|-----------|------|
| **OpenAI Transcription** | [Speech to Text Docs](https://platform.openai.com/docs/guides/speech-to-text) |
| **GPT-4o-mini** | [Model Docs](https://platform.openai.com/docs/models/gpt-4o-mini) |
| **TanStack Query** | [React Query Docs](https://tanstack.com/query/latest) |
| **SQLite FTS5** | [Full-Text Search](https://www.sqlite.org/fts5.html) |
| **Vite** | [Getting Started](https://vite.dev/guide/) |
| **Tailwind CSS** | [Vite Setup](https://tailwindcss.com/docs/guides/vite) |
| **Flask** | [Quickstart](https://flask.palletsprojects.com/en/stable/quickstart/) |
| **uv** | [Installation](https://docs.astral.sh/uv/getting-started/installation/) |

---

## 🎯 Acceptance Criteria ✅

- ✅ Vite frontend with Tailwind for recording/uploading audio
- ✅ OpenAI API transcription (gpt-4o-mini-transcribe)
- ✅ AI-powered categorization (GPT-4o-mini)
- ✅ SQLite database storage with FTS5 search
- ✅ 11 REST API endpoints for full CRUD
- ✅ Split-pane layout with folder navigation
- ✅ TanStack Query for state management
- ✅ Keyboard navigation and accessibility
- ✅ CORS configured for local dev
- ✅ Deployment-ready (no GPU required)

---

## 🚧 Future Enhancements

- [ ] Speaker diarization (gpt-4o-transcribe-diarize)
- [ ] Streaming transcription with WebSocket
- [ ] Note editing UI with inline updates
- [ ] Bulk operations (move, delete, export)
- [ ] Export as Markdown/PDF
- [ ] User authentication & multi-user support
- [ ] PostgreSQL for production
- [ ] Docker Compose setup
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Real-time collaboration

---

## 📝 License

This is a proof-of-concept template.

---

**Built with ❤️ for easy deployment**

