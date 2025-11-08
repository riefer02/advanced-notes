# ASR Backend

Flask API server with NVIDIA Parakeet-TDT-0.6B-v3 ASR model.

## Setup

```bash
# Install dependencies
uv sync

# Start development server
./run.sh
```

## API Endpoints

- `POST /api/transcribe` - Transcribe audio file
- `GET /api/health` - Health check

Server runs on http://localhost:5001

