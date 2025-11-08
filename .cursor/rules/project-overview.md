# Project Overview

## ASR Mono-Repo POC

This is a Proof-of-Concept (POC) application demonstrating Automatic Speech Recognition (ASR) using NVIDIA's Parakeet-TDT-0.6B-v3 model with Apple Silicon optimization.

## Tech Stack

### Frontend
- **Framework:** Vite + React + TypeScript
- **Styling:** Tailwind CSS
- **Features:**
  - Browser-based audio recording (MediaRecorder API)
  - File upload support (WAV, MP3, FLAC, OGG, WebM)
  - Real-time transcription display
  - Metadata visualization

### Backend
- **Framework:** Flask (Python 3.11)
- **Package Manager:** `uv` (modern Python package manager)
- **ASR Model:** NVIDIA Parakeet-TDT-0.6B-v3 (600M parameters)
- **ML Framework:** PyTorch with MPS acceleration (Apple Silicon)
- **Audio Processing:** `soundfile`, `pydub`, `ffmpeg`
- **Features:**
  - POST `/api/transcribe` - Transcribe audio to text
  - GET `/api/health` - Health check endpoint

## Directory Structure

```
advanced-notes/
├── .cursor/rules/          # Cursor IDE rules and guidelines
├── backend/                # Flask backend application
│   ├── app/
│   │   ├── __init__.py    # Flask app factory
│   │   ├── routes.py      # API endpoints
│   │   └── asr.py         # ASR model logic
│   ├── pyproject.toml     # uv package configuration
│   ├── run.sh             # Backend startup script
│   └── wsgi.py            # Flask WSGI entry point
├── frontend/              # React frontend application
│   ├── src/
│   │   ├── components/
│   │   │   └── AudioUploader.tsx  # Main audio UI component
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── Makefile               # Development convenience commands
└── README.md              # Setup and usage documentation
```

## Key Technical Details

### Model Information
- **Model:** NVIDIA Parakeet-TDT-0.6B-v3
- **Parameters:** 600 million
- **Cache Location:** `~/.cache/huggingface/hub/`
- **Acceleration:** Apple Silicon MPS (Metal Performance Shaders)
- **Average Transcription Time:** 1-2s per audio sample

### Audio Format Support
- **Native (soundfile):** WAV, FLAC, OGG
- **Fallback (pydub):** WebM, MP3, M4A, and other formats via ffmpeg

### Python Version Requirement
- **Required:** Python 3.11 or 3.12 (NOT 3.13)
- **Reason:** NeMo framework requires NumPy 1.x, which is incompatible with Python 3.13's NumPy 2.x

## Development Workflow

### First-Time Setup

1. **Backend:**
   ```bash
   cd backend
   uv sync
   ./run.sh
   ```

2. **Frontend (separate terminal):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Makefile Commands

From the project root:
- `make install` - Install all dependencies (backend + frontend)
- `make dev` - Run both backend and frontend concurrently
- `make clean` - Clean up virtual environments and caches

## Core Functionality

1. **Audio Recording:** Users can record audio directly in the browser
2. **File Upload:** Users can upload pre-recorded audio files
3. **Transcription:** Audio is sent to Flask backend, processed by Parakeet model
4. **Display:** Transcript and metadata (device, sample rate, duration) displayed in UI

## Known Limitations

- Development server only (Flask dev server)
- Model loads on first request (~5-10s initial load time)
- Model stays in memory after first load (MPS device caching)
- Browser audio recording produces WebM format (requires pydub fallback)

## External Dependencies

- **ffmpeg:** Required for pydub to decode WebM/MP3/M4A formats
  - Install: `brew install ffmpeg` (macOS)

