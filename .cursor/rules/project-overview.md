# Project Overview

**Last Updated:** November 8, 2025  
**Status:** Production Ready - Deployment-Optimized

## ASR Mono-Repo with AI-Powered Semantic Organization

This is a production-ready Proof-of-Concept (POC) demonstrating:
1. **Automatic Speech Recognition** using OpenAI GPT-4o-mini-transcribe
2. **AI-Powered Categorization** using OpenAI GPT-4o-mini
3. **Intelligent Note Organization** with database storage and full-text search

## Tech Stack

### Frontend
- **Framework:** Vite + React 18 + TypeScript (strict mode)
- **Styling:** Tailwind CSS 3
- **State Management:** TanStack Query v5 (React Query)
- **Features:**
  - Split-pane layout (40% input / 60% notes)
  - Browser audio recording (MediaRecorder API)
  - Real-time transcription display
  - AI categorization results
  - Folder hierarchy navigation (keyboard support)
  - Full-text search with FTS5
  - Note CRUD operations
  - Mobile-responsive with tabs

### Backend
- **Framework:** Flask (Python 3.11+)
- **Package Manager:** `uv` (modern Python package manager)
- **Transcription:** OpenAI GPT-4o-mini-transcribe (API-based, no local model)
- **AI Model:** OpenAI GPT-4o-mini with structured outputs
- **Database:** SQLite with FTS5 (full-text search)
- **Features:**
  - 11 REST API endpoints
  - Automatic categorization on transcription
  - Database-only storage (no file system)
  - Folder hierarchy generation
  - Tag management
  - Full-text search
  - Lightweight: ~30 packages (vs 166 with local models)
  - No GPU required: Pure API calls

## Architecture

```
┌─────────────────────────────────────────────┐
│  Frontend (React + TanStack Query)         │
│  • AudioUploader (recording/upload)         │
│  • CategoryResult (AI results)              │
│  • FolderTree (hierarchical nav)            │
│  • NotesList (CRUD operations)              │
│  • SearchBar (full-text search)             │
└──────────────┬──────────────────────────────┘
               │ REST API
               ↓
┌─────────────────────────────────────────────┐
│  Backend (Flask)                            │
│  ┌──────────────┐  ┌───────────────────┐   │
│  │ AI           │  │ Storage           │   │
│  │ Categorizer  │→ │ Service           │   │
│  │ (OpenAI)     │  │ (SQLite + FTS5)   │   │
│  └──────────────┘  └───────────────────┘   │
│         ↓                                   │
│  ┌──────────────────────────────────────┐  │
│  │ Transcription (OpenAI API)          │  │
│  │ gpt-4o-mini-transcribe               │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Directory Structure

```
advanced-notes/
├── .cursor/rules/              # Cursor IDE rules
│   ├── project-overview.md     # This file
│   ├── coding-standards.md     # Code style guidelines
│   └── development-workflow.md # Dev procedures
├── docs/                       # Documentation
│   ├── README.md               # Documentation index
│   ├── api-reference.md        # REST API docs
│   ├── environment-setup.md    # OpenAI setup guide
│   └── semantic-organization-spec.md  # Implementation spec
├── backend/                    # Flask backend
│   ├── app/
│   │   ├── __init__.py         # Flask app factory
│   │   ├── routes.py           # 11 REST endpoints
│   │   ├── asr.py              # OpenAI transcription client
│   │   ├── config.py           # Configuration
│   │   └── services/
│   │       ├── ai_categorizer.py  # OpenAI integration
│   │       ├── storage.py         # SQLite storage
│   │       └── models.py          # Pydantic models
│   ├── tests/                  # Unit tests
│   │   └── services/
│   │       ├── test_categorizer.py
│   │       └── test_storage.py
│   ├── pyproject.toml          # uv package config
│   ├── run.sh                  # Backend startup script
│   └── .notes.db               # SQLite database (gitignored)
├── frontend/                   # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── AudioUploader.tsx      # Recording + upload
│   │   │   ├── NotesPanel.tsx         # Right pane container
│   │   │   ├── CategoryResult.tsx     # AI result display
│   │   │   ├── FolderTree.tsx         # Folder navigation
│   │   │   ├── NotesList.tsx          # Note cards + CRUD
│   │   │   └── SearchBar.tsx          # Search input
│   │   ├── hooks/
│   │   │   └── useNotes.ts            # TanStack Query hooks
│   │   ├── lib/
│   │   │   └── api.ts                 # Type-safe API client
│   │   ├── App.tsx                    # Main app with split layout
│   │   └── index.css                  # Animations + styles
│   ├── package.json
│   └── vite.config.ts
└── README.md                   # Project setup guide
```

## Key Technical Details

### AI Categorization
- **Model:** OpenAI GPT-4o-mini
- **Method:** Structured outputs with JSON schema
- **Confidence Threshold:** 0.7 (configurable)
- **Output:** folder_path, filename, tags, confidence, reasoning

### Storage
- **Database:** SQLite with WAL mode
- **Search Engine:** FTS5 (full-text search)
- **Storage Model:** Database-only (no file system)
- **Features:** CRUD, search, folder hierarchy, tags, statistics

### Transcription
- **Model:** OpenAI GPT-4o-mini-transcribe
- **Type:** API-based (no local model download)
- **Average Time:** 1-3s per audio sample (API dependent)
- **Supported Formats:** MP3, MP4, MPEG, MPGA, M4A, WAV, WebM (up to 25MB)
- **Cost:** Pay-per-use via OpenAI API

### Python Version Requirement
- **Required:** Python 3.11+
- **Reason:** Modern Python features, no NumPy 1.x constraints

## REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/transcribe` | Transcribe + categorize + save (integrated) |
| GET | `/api/notes` | List notes (with folder filter) |
| GET | `/api/notes/<id>` | Get specific note |
| PUT | `/api/notes/<id>` | Update note |
| DELETE | `/api/notes/<id>` | Delete note |
| GET | `/api/folders` | Get folder hierarchy tree |
| GET | `/api/folders/<path>/stats` | Get folder statistics |
| GET | `/api/tags` | List all tags |
| GET | `/api/tags/<tag>/notes` | Get notes by tag |
| GET | `/api/search?q=` | Full-text search (FTS5) |
| GET | `/api/health` | Health check |

## Development Workflow

### First-Time Setup

1. **Backend:**
   ```bash
   cd backend
   uv sync
   # Create .env file with OPENAI_API_KEY
   ./run.sh
   ```

2. **Frontend (separate terminal):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Environment Variables

**Backend (.env):**
```bash
OPENAI_API_KEY=sk-...  # Required for transcription + categorization
OPENAI_MODEL=gpt-4o-mini
CONFIDENCE_THRESHOLD=0.7
FLASK_ENV=development
```

**Frontend (.env):**
```bash
VITE_API_URL=http://localhost:5001
```

See `docs/environment-setup.md` for detailed setup instructions.

## User Flow

1. **Record/Upload Audio** → User records or uploads audio file
2. **Transcription** → OpenAI API converts speech to text (~1-3s)
3. **AI Categorization** → GPT-4o-mini analyzes and categorizes
4. **Storage** → Note saved to SQLite with metadata
5. **Display** → UI shows result, folder tree updates automatically
6. **Organization** → Notes organized in hierarchical folders
7. **Search** → Full-text search across all notes

## Key Features

### Frontend
- ✅ Split-pane layout (40/60) with mobile tabs
- ✅ Real-time audio recording
- ✅ AI categorization result display
- ✅ Folder tree with keyboard navigation (Arrow keys)
- ✅ Full-text search with FTS5
- ✅ Note CRUD operations
- ✅ Auto-refresh (5s polling)
- ✅ Responsive design (mobile/tablet/desktop)
- ✅ Accessibility (ARIA labels, keyboard nav)

### Backend
- ✅ Integrated transcription + categorization + storage
- ✅ OpenAI structured outputs
- ✅ Database-only storage (SQLite + FTS5)
- ✅ Folder hierarchy generation
- ✅ Tag management
- ✅ Comprehensive REST API
- ✅ No GPU required (API-based)
- ✅ Lightweight deployment (30 packages)

## Performance

- **Transcription:** 1-3s per audio sample (API latency)
- **Categorization:** ~500ms (OpenAI API)
- **Total Time to Save:** 2-4s end-to-end
- **Auto-refresh:** 5s polling interval
- **Search:** <100ms (FTS5 indexed)

## Deployment Benefits

- ✅ **No GPU required**: Pure API-based transcription
- ✅ **No model downloads**: No HuggingFace cache management
- ✅ **Lightweight**: Only ~30 Python packages
- ✅ **Platform-agnostic**: Works on any OS with Python 3.11+
- ✅ **Easy scaling**: API handles compute, just scale Flask
- ✅ **Cost predictable**: OpenAI pay-per-use pricing

## Known Limitations

- Development server only (Flask dev server)
- Browser audio recording produces WebM format
- Requires OpenAI API key (paid service)
- 25MB file size limit (OpenAI API constraint)
- API latency depends on internet connection

## External Dependencies

- **OpenAI API:** Required for transcription + categorization
  - Get key: https://platform.openai.com/api-keys
  - Pricing: https://openai.com/pricing

## Testing

### Backend
- ✅ Unit tests for AI categorization
- ✅ Unit tests for storage layer
- ✅ Manual API testing
- ⏳ Integration tests (TODO)

### Frontend
- ✅ No linter errors
- ✅ TypeScript strict mode
- ✅ Manual UI testing
- ⏳ Automated tests (TODO)

## Next Steps

1. **Deployment** - Deploy to production (Vercel + Render/Railway)
2. **Integration Tests** - Add comprehensive integration tests
3. **Note Editing** - Add inline note editing in UI
4. **Bulk Operations** - Batch note operations
5. **Export** - Export notes as Markdown/PDF

## Project Statistics

- **Total Lines of Code:** ~3,500
- **Frontend:** 1,330 lines (React/TypeScript)
- **Backend:** 2,000+ lines (Python/Flask)
- **Components:** 6 React components + 6 backend services
- **API Endpoints:** 11 REST endpoints
- **Dependencies:** TanStack Query, OpenAI, SQLite, Parakeet

---

**Status:** ✅ Deployment-Ready  
**Version:** v0.2.0  
**Last Updated:** November 8, 2025
