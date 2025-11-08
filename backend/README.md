# ASR Backend

Flask API server with OpenAI GPT-4o-mini-transcribe for speech-to-text.

## Features

- **Transcription**: OpenAI GPT-4o-mini-transcribe API
- **AI Categorization**: GPT-4o-mini with structured outputs
- **Storage**: SQLite with FTS5 full-text search
- **11 REST API Endpoints**: Complete CRUD for notes, folders, tags, search

## Setup

```bash
# Install dependencies
uv sync

# Create .env file
echo "OPENAI_API_KEY=sk-your-key-here" > .env

# Start development server
./run.sh
```

## API Endpoints

- `POST /api/transcribe` - Transcribe audio + categorize + save
- `GET /api/notes` - List notes
- `GET /api/notes/<id>` - Get specific note
- `PUT /api/notes/<id>` - Update note
- `DELETE /api/notes/<id>` - Delete note
- `GET /api/folders` - Get folder hierarchy
- `GET /api/folders/<path>/stats` - Folder statistics
- `GET /api/tags` - List all tags
- `GET /api/tags/<tag>/notes` - Get notes by tag
- `GET /api/search?q=` - Full-text search
- `GET /api/health` - Health check

Server runs on **http://localhost:5001**

## Deployment Benefits

- ✅ No GPU required (API-based transcription)
- ✅ No model downloads (no HuggingFace cache)
- ✅ Lightweight (only ~30 packages)
- ✅ Platform-agnostic (works on any OS)
