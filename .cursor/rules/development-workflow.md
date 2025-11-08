# Development Workflow

## Daily Development

### Starting the Development Environment

1. **Backend (Terminal 1):**
   ```bash
   cd backend
   ./run.sh
   ```
   - Flask server starts on `http://0.0.0.0:5001`
   - Model loads on first transcription request (~5-10s)
   - Subsequent requests are fast (model cached in memory)

2. **Frontend (Terminal 2):**
   ```bash
   cd frontend
   npm run dev
   ```
   - Vite dev server starts on `http://localhost:5173` (or 5174 if 5173 is in use)
   - Hot Module Replacement (HMR) enabled

### Quick Start (Both Services)
```bash
make dev
```

## Making Changes

### Backend Changes

1. **Code Changes:**
   - Most Python changes require server restart
   - Stop server with `Ctrl+C`
   - Restart with `./run.sh`

2. **Dependency Changes:**
   ```bash
   cd backend
   # Add dependency
   uv add <package-name>
   # or edit pyproject.toml and run
   uv sync
   ```

3. **Testing Changes:**
   - Use `/api/health` endpoint to verify server is running
   - Check terminal output for errors/tracebacks
   - Review NeMo loading messages for model issues

### Frontend Changes

1. **Code Changes:**
   - Changes auto-reload via HMR
   - No restart needed for most changes

2. **Dependency Changes:**
   ```bash
   cd frontend
   npm install <package-name>
   ```

3. **Testing Changes:**
   - Open browser DevTools console
   - Monitor network tab for API calls
   - Check for React warnings/errors

## Debugging

### Backend Debugging

**Common Issues:**

1. **Module Import Errors:**
   - Verify `uv sync` was run
   - Check Python version: `python --version` (should be 3.11 or 3.12)

2. **Model Loading Failures:**
   - Check disk space (~2GB needed for model cache)
   - Verify internet connection for first-time download
   - Check `~/.cache/huggingface/hub/` directory

3. **Audio Format Errors:**
   - Ensure `ffmpeg` is installed: `brew install ffmpeg`
   - Check file format is supported (WAV, MP3, FLAC, OGG, WebM)

4. **MPS Acceleration Issues:**
   - Verify Apple Silicon Mac
   - PyTorch should auto-detect MPS
   - Fallback to CPU if MPS unavailable

**Debug Logging:**
- Flask prints requests to terminal
- NeMo outputs detailed model loading info
- Check for Python tracebacks in terminal

### Frontend Debugging

**Common Issues:**

1. **CORS Errors:**
   - Verify backend is running
   - Check Flask-CORS is configured (in `backend/app/__init__.py`)

2. **Audio Recording Fails:**
   - Browser must have microphone permissions
   - HTTPS required in production (localhost OK for dev)
   - Check browser console for MediaRecorder errors

3. **API Call Failures:**
   - Verify backend URL in fetch calls
   - Check network tab in DevTools
   - Inspect request/response bodies

**Debug Tools:**
- React DevTools extension
- Browser console (`console.log`)
- Network tab for API debugging

## Testing Workflow

### Manual Testing Checklist

**Backend:**
- [ ] Health check: `curl http://localhost:5001/api/health`
- [ ] Upload transcription: Test with sample audio file
- [ ] Error handling: Test with invalid file format
- [ ] MPS acceleration: Check terminal output for "mps" device

**Frontend:**
- [ ] Recording: Start/stop recording, verify timer
- [ ] Upload: Select audio file, verify transcription
- [ ] Error display: Test with backend offline
- [ ] Loading states: Verify spinner during transcription
- [ ] Metadata display: Check device, sample rate, duration

## Troubleshooting Guide

### Python Version Issues

**Symptom:** NumPy 2.x errors, NeMo import failures

**Solution:**
```bash
pyenv install 3.11.11
pyenv local 3.11.11
cd backend
uv sync
```

### Port Conflicts

**Backend:**
```bash
lsof -ti:5001 | xargs kill -9  # Kill process on port 5001
```

**Frontend:**
Vite automatically tries alternative ports (5174, 5175, etc.)

### Model Cache Issues

**Clear model cache:**
```bash
rm -rf ~/.cache/huggingface/hub/models--nvidia--parakeet-tdt-0.6b-v3
```
Model will re-download on next request (~1.5GB)

## Git Workflow

### Before Committing

1. **Review changes:**
   ```bash
   git status
   git diff
   ```

2. **Stage files:**
   ```bash
   git add <files>
   ```

3. **Verify .gitignore:**
   - No `node_modules/`, `.venv/`, `__pycache__/`
   - No `.env` or sensitive files

### Commit Guidelines

**DO:**
- Write descriptive commit messages
- Commit logical units of work
- Test before committing

**DON'T:**
- Commit unless explicitly requested by user
- Force push to main/master
- Skip hooks (--no-verify)
- Commit sensitive data or large binary files

### Branch Strategy

- `main`: Stable, production-ready code
- Feature branches: Create for new features
- Bug fix branches: Create for specific fixes

## Performance Monitoring

### Backend Performance
- Monitor model load time (first request only)
- Track transcription time (~1-2s per file)
- Watch memory usage (model ~2GB in memory)

### Frontend Performance
- Monitor bundle size (`npm run build`)
- Check for unnecessary re-renders
- Optimize large file uploads

## Production Considerations

**Not Implemented (Development Only):**
- Production WSGI server (use Gunicorn/uWSGI)
- HTTPS/SSL certificates
- Authentication/authorization
- Rate limiting
- Error tracking (Sentry, etc.)
- Logging infrastructure
- Database persistence
- Model serving optimization

