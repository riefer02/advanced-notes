# Railway Deployment

**Platform:** Railway.app  
**Services:** Flask Backend + Vite Frontend + PostgreSQL  
**Status:** ✅ Deployed

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Railway Project: advanced-notes            │
│                                             │
│  ┌─────────────────┐  ┌──────────────────┐ │
│  │ Backend         │  │ Frontend         │ │
│  │ (Flask/Python)  │  │ (Vite/React)     │ │
│  │ Gunicorn        │  │ Static Site      │ │
│  └────────┬────────┘  └────────┬─────────┘ │
│           │                    │           │
│           └──────┬─────────────┘           │
│                  │                         │
│         ┌────────▼────────┐                │
│         │ PostgreSQL      │                │
│         │ (Managed DB)    │                │
│         └─────────────────┘                │
└─────────────────────────────────────────────┘
```

**How it works:**

- Frontend calls Backend API
- Backend uses OpenAI for transcription + categorization
- All notes stored in PostgreSQL
- Auto-deploys on git push to `main`

---

## Services

### 1. Backend Service

- **Root Directory:** `/backend`
- **Start Command:** `gunicorn -w 4 -b 0.0.0.0:$PORT wsgi:app` (via `Procfile`)
- **Build:** Nixpacks auto-detects Python + `requirements.txt`
- **Language:** Python 3.13+

### 2. Frontend Service

- **Root Directory:** `/frontend`
- **Build:** `npm run build` (outputs to `dist/`)
- **Serve:** Caddy static server (Railway default)
- **Language:** TypeScript + React

### 3. PostgreSQL Database

- **Type:** Railway Plugin (managed)
- **Version:** Latest PostgreSQL
- **Connection:** Auto-injected via `DATABASE_URL` reference

---

## Environment Variables

### Backend

| Variable               | Value                              | Description                               |
| ---------------------- | ---------------------------------- | ----------------------------------------- |
| `OPENAI_API_KEY`       | `sk-proj-...`                      | OpenAI API key (required)                 |
| `OPENAI_MODEL`         | `gpt-4o-mini`                      | Model for categorization                  |
| `FLASK_ENV`            | `production`                       | Flask environment                         |
| `CONFIDENCE_THRESHOLD` | `0.7`                              | AI confidence threshold                   |
| `FRONTEND_URL`         | `https://your-frontend-domain.com` | For CORS (your custom domain)             |
| `DATABASE_URL`         | (auto-set)                         | PostgreSQL connection (reference from DB) |

### Frontend

| Variable       | Value                             | Description                                             |
| -------------- | --------------------------------- | ------------------------------------------------------- |
| `VITE_API_URL` | `https://your-backend-domain.com` | Backend API URL (your custom domain, no trailing slash) |

**Note:** `VITE_API_URL` is baked into the build at compile time - redeploy frontend after changing it.

---

## Key Files

### Backend Production Files

- **`backend/Procfile`** - Runs migrations then starts Gunicorn
- **`backend/migrate.py`** - Migration runner script for deployments
- **`backend/requirements.txt`** - Python dependencies (generated from `pyproject.toml`)
- **`backend/app/services/storage.py`** - Multi-database adapter (SQLite local, PostgreSQL prod)
- **`backend/alembic/`** - Database migration files

### Frontend Production Files

- **`frontend/src/vite-env.d.ts`** - TypeScript types for `VITE_API_URL`
- **`frontend/package.json`** - Build script: `tsc && vite build`

---

## Database

### Local Development

- **Type:** SQLite
- **Location:** `backend/.notes.db`
- **Search:** FTS5 full-text search
- **Auto-selected** when `DATABASE_URL` not set
- **Migrations:** Run with `uv run alembic upgrade head`

### Production (Railway)

- **Type:** PostgreSQL
- **Connection:** Via `DATABASE_URL` environment variable
- **Search:** `tsvector` + `ts_rank` full-text search
- **Auto-selected** when `DATABASE_URL` is set
- **Migrations:** Auto-run on deployment via `Procfile` release command

The storage layer (`backend/app/services/storage.py`) automatically detects which database to use.

### Database Migrations

The app uses **Alembic** for database migrations (Django-style autogenerate):

```bash
# Create new migration (autogenerate from models)
cd backend
uv run alembic revision --autogenerate -m "description"

# Apply migrations locally
uv run alembic upgrade head

# View migration history
uv run alembic history
```

**Production:** Migrations run automatically on Railway deployment via the `release` command in `Procfile`.

---

## Deployment Process

### Automatic (Recommended)

1. Commit changes to `main` branch
2. Push to GitHub: `git push origin main`
3. Railway auto-deploys both services
4. Monitor in Railway dashboard

### Manual (if needed)

```bash
# Backend
cd backend
railway link  # Select backend service
railway up

# Frontend
cd frontend
railway link  # Select frontend service
railway up
```

---

## Testing Locally

### Backend with Gunicorn

```bash
cd backend
uv run gunicorn -w 4 -b 0.0.0.0:5001 wsgi:app
```

### Frontend Production Build

```bash
cd frontend
npm run build
npm run preview
```

---

## Updating Dependencies

### Backend

```bash
cd backend

# Add new package
uv add package-name

# Regenerate requirements.txt for Railway
uv pip compile pyproject.toml -o requirements.txt

# Commit and push
git add pyproject.toml requirements.txt
git commit -m "deps: add package-name"
git push
```

### Frontend

```bash
cd frontend

# Add new package
npm install package-name

# Commit and push (package.json and package-lock.json)
git add package.json package-lock.json
git commit -m "deps: add package-name"
git push
```

---

## Common Issues

### Frontend build fails with TypeScript error

- **Cause:** Missing type definitions for environment variables
- **Solution:** Check `frontend/src/vite-env.d.ts` exists and includes `VITE_API_URL`

### Backend crashes with "OpenAI API key required"

- **Cause:** `OPENAI_API_KEY` not set or has whitespace/newlines
- **Solution:** Re-set in Railway dashboard as single line, no quotes, redeploy

### CORS errors in browser console

- **Cause:** `FRONTEND_URL` not set on backend or doesn't match frontend domain
- **Solution:** Set `FRONTEND_URL` to exact frontend domain (with https://, no trailing slash)

### Database connection fails

- **Cause:** `DATABASE_URL` reference not added to backend service
- **Solution:** In backend Variables → Add Reference → Select Postgres → DATABASE_URL

### Migration fails on deployment

- **Cause:** Missing dependencies, syntax error, or database connection issue
- **Solution:** Check Railway logs with `railway logs`, test migration locally first with `uv run alembic upgrade head`

### Frontend can't reach backend API

- **Cause:** `VITE_API_URL` incorrect or has trailing slash
- **Solution:** Set to backend domain without trailing slash, redeploy frontend

---

## Monitoring

### Railway Dashboard

- **Deployments:** View build/deploy logs for each service
- **Metrics:** CPU, memory, network usage
- **Logs:** Real-time application logs (click service → Logs tab)

### OpenAI Usage

- Dashboard: https://platform.openai.com/usage
- Monitor API costs and rate limits

### Custom Domains

- Railway handles SSL/TLS automatically
- DNS propagation takes 5-60 minutes

---

## Cost Estimate

### Railway

- Backend: ~$5-10/month
- Frontend: ~$3-5/month
- PostgreSQL: ~$5/month
- **Total:** ~$13-20/month

### OpenAI API

- Transcription: ~$0.10 per hour of audio
- Categorization: ~$0.10 per 1M tokens
- **Estimated:** $5-10/month moderate use

**Total monthly:** ~$20-30

---

## Useful Commands

```bash
# View logs
railway logs

# Get service URL
railway domain

# Check current environment variables
railway variables

# Set new variable
railway variables --set "KEY=value"

# Open Railway dashboard
open https://railway.app/project/ef02499f-01ab-4da9-91b8-2d0bd26c399a
```

---

## Links

- **Railway Dashboard:** https://railway.app/dashboard
- **Railway Docs:** https://docs.railway.app/
- **OpenAI Platform:** https://platform.openai.com/

---

**Last Updated:** November 10, 2025
