# ASR Mono-repo POC: Vite + Tailwind + Flask + NVIDIA Parakeet-TDT-0.6B-v3

**Production-ready proof-of-concept** for audio transcription using:

- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Backend**: Flask + NVIDIA Parakeet-TDT-0.6B-v3 ASR model
- **Python tooling**: `uv` (fast package manager from Astral)
- **Apple Silicon optimized**: Automatic MPS (Metal Performance Shaders) acceleration

---

## 📚 Documentation

**Complete documentation**: See [`docs/`](./docs/) folder

- **[Environment Setup](./docs/environment-setup.md)** - OpenAI API keys, configuration
- **[Technical Specification](./docs/semantic-organization-spec.md)** - AI categorization architecture  
- **[Documentation Index](./docs/README.md)** - Full documentation catalog

## 🚀 Quick Start

### Prerequisites

- **Node.js 20.19+ or 22.12+** ([Vite requirements](https://vite.dev/guide/))
- **Python 3.10–3.12**
- **uv** (install with: `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **OpenAI API key** (for AI categorization) - See [environment setup](./docs/environment-setup.md)
- **(Optional)** `ffmpeg` and `sox`: `brew install ffmpeg sox`
- **Xcode Command Line Tools**: `xcode-select --install`

### Backend Setup

```bash
cd backend

# Install dependencies (creates .venv and installs from pyproject.toml)
uv sync

# Start Flask server on http://localhost:5001
./run.sh
```

**First run:** The Parakeet model (~600MB) downloads automatically from HuggingFace. Subsequent runs use the cached model.

### Frontend Setup

Open a **new terminal**:

```bash
cd frontend

# Install Node dependencies
npm install

# Start Vite dev server on http://localhost:5173
npm run dev
```

Visit **http://localhost:5173** and upload an audio file (WAV, FLAC, OGG, MP3) to see the transcription.

---

## 📁 Project Structure

```
asr-monorepo/
├─ README.md              # This file
├─ .gitignore
├─ Makefile               # Optional: run both servers with 'make dev'
│
├─ backend/               # Flask + NeMo (Parakeet TDT)
│  ├─ pyproject.toml      # uv project definition
│  ├─ uv.lock             # Dependency lock file (auto-generated)
│  ├─ run.sh              # Dev server launcher
│  ├─ wsgi.py             # WSGI entry point
│  └─ app/
│     ├─ __init__.py      # Flask app factory with CORS
│     ├─ asr.py           # Model loading & transcription logic
│     └─ routes.py        # /api/transcribe endpoint
│
└─ frontend/              # Vite + React + TS + Tailwind
   ├─ package.json
   ├─ vite.config.ts
   ├─ tailwind.config.ts
   ├─ postcss.config.js
   ├─ tsconfig.json
   ├─ index.html
   ├─ .env.local          # API URL: VITE_API_URL=http://localhost:5001
   └─ src/
      ├─ main.tsx
      ├─ App.tsx
      ├─ index.css        # Tailwind directives
      └─ components/
         └─ AudioUploader.tsx  # Upload UI + transcription display
```

---

## 🔧 How It Works

### Backend (`backend/`)

1. **Model Loading** (`app/asr.py`):
   - Uses **NVIDIA NeMo Toolkit** to load `nvidia/parakeet-tdt-0.6b-v3`
   - Auto-detects **Apple Silicon MPS** for GPU acceleration (falls back to CPU)
   - Model is cached in memory after first load

2. **API Endpoint** (`app/routes.py`):
   - `POST /api/transcribe` accepts audio as:
     - Multipart form-data (`file` field)
     - Raw bytes in request body
   - Returns JSON: `{"text": "...", "meta": {...}}`

3. **CORS**: Enabled via `flask-cors` so Vite dev server (`:5173`) can call Flask (`:5001`)

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
    "device": "mps",
    "sample_rate": 16000,
    "model": "nvidia/parakeet-tdt-0.6b-v3",
    "duration_sec": 3.45
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

## 🍎 Apple Silicon Notes

- **PyTorch MPS**: Automatically used if available (macOS 12.3+, Apple Silicon)
- **Fallback**: CPU if MPS unavailable
- **First-run download**: Parakeet model (~600MB) downloads once, then cached
- **No OpenVINO needed**: OpenVINO is Intel-specific; not required on Apple Silicon

Check device in use via the `meta.device` field in API responses.

---

## 🔍 Troubleshooting

### Backend

**"No module named 'nemo'"**
- Run `uv sync` in `backend/` directory

**Model download fails**
- Ensure network access to HuggingFace
- Check `~/.cache/huggingface/` for downloaded models

**"MPS not available"**
- Normal on Intel Macs or older macOS → falls back to CPU
- Verify PyTorch version: `uv run python -c "import torch; print(torch.backends.mps.is_available())"`

**Slow transcription**
- First run includes model download + JIT compilation
- Subsequent runs are faster (model cached in memory)

### Frontend

**CORS errors**
- Ensure backend is running on `:5001`
- Check `frontend/.env.local` has `VITE_API_URL=http://localhost:5001`

**Build errors**
- Delete `node_modules/` and run `npm install` again
- Verify Node version: `node -v` (should be 20.19+ or 22.12+)

**Audio upload fails**
- Check browser console for errors
- Try converting audio to WAV: `ffmpeg -i input.mp3 output.wav`

---

## 📦 Production Considerations

### Backend

- **CORS**: Restrict origins in production (edit `app/__init__.py`)
- **File size limits**: Add max file size checks in `routes.py`
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

### Model

- **Warm-up**: Pre-load model on server startup (add to `wsgi.py`)
- **Model swap**: Replace `MODEL_NAME` in `asr.py` to use different Parakeet sizes
- **Quantization**: Explore PyTorch quantization for faster inference
- **Timestamps**: Add word-level timing if needed (check NeMo docs)

---

## 📚 Key Technologies & References

| Component | Link |
|-----------|------|
| **Parakeet-TDT-0.6B-v3** | [HuggingFace Model Card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) |
| **NVIDIA NeMo** | [NeMo ASR Docs](https://docs.nvidia.com/deeplearning/nemo/user-guide/docs/en/stable/asr/intro.html) |
| **Vite** | [Getting Started](https://vite.dev/guide/) |
| **Tailwind CSS** | [Vite Setup](https://tailwindcss.com/docs/guides/vite) |
| **Flask** | [Quickstart](https://flask.palletsprojects.com/en/stable/quickstart/) |
| **uv** | [Installation](https://docs.astral.sh/uv/getting-started/installation/) |
| **PyTorch MPS** | [Apple Developer](https://developer.apple.com/metal/pytorch/) |

---

## 🎯 Acceptance Criteria ✅

- ✅ Vite frontend with Tailwind renders and accepts audio uploads
- ✅ Backend accepts uploads and returns transcripts
- ✅ Model stays loaded in memory (no re-download between requests)
- ✅ Apple Silicon MPS acceleration when available
- ✅ CORS configured for local dev
- ✅ Clean separation of frontend/backend concerns

---

## 🚧 Future Enhancements

- [ ] Real-time audio recording in browser (MediaRecorder API)
- [ ] WebSocket streaming for live transcription
- [ ] Word-level timestamps and confidence scores
- [ ] Multi-language support (swap ASR models)
- [ ] Transcript editing & export (TXT, SRT, VTT)
- [ ] User authentication & transcript history
- [ ] Database persistence (SQLite/PostgreSQL)
- [ ] Docker Compose setup
- [ ] CI/CD pipeline (GitHub Actions)

---

## 📝 License

This is a proof-of-concept template. Model license follows NVIDIA NeMo/Parakeet terms.

---

**Built with ❤️ for Apple Silicon**

