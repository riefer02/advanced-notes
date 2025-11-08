# Railway Deployment Checklist

**Target Platform:** Railway.app  
**Services:** Flask Backend + Vite Frontend (Monorepo)  
**Database:** PostgreSQL (Railway-managed)  
**Status:** 🚧 In Progress

---

## 🎯 Deployment Overview

### Architecture

```
┌─────────────────────────────────────────────┐
│  Railway Project: advanced-notes            │
│                                             │
│  ┌─────────────────┐  ┌──────────────────┐ │
│  │ Service 1:      │  │ Service 2:       │ │
│  │ Backend (Flask) │  │ Frontend (Vite)  │ │
│  │ Port: $PORT     │  │ Static hosting   │ │
│  └────────┬────────┘  └────────┬─────────┘ │
│           │                    │           │
│           └──────┬─────────────┘           │
│                  │                         │
│         ┌────────▼────────┐                │
│         │ PostgreSQL DB   │                │
│         │ (Railway Plugin)│                │
│         └─────────────────┘                │
└─────────────────────────────────────────────┘
```

---

## ✅ Pre-Deployment Checklist

### Phase 1: Backend Production Setup

- [ ] **1.1 Add Gunicorn**

  - Add to `backend/pyproject.toml`
  - Run `uv sync`

- [ ] **1.2 Generate requirements.txt**

  - Railway needs this file (doesn't use uv directly)
  - Command: `uv pip compile pyproject.toml -o requirements.txt`

- [ ] **1.3 Create Procfile**

  - File: `backend/Procfile`
  - Content: `web: gunicorn -w 4 -b 0.0.0.0:$PORT wsgi:app`
  - Alternative: Use nixpacks.toml if Procfile doesn't work

- [ ] **1.4 Update CORS configuration**

  - File: `backend/app/__init__.py`
  - Add Railway frontend URL to allowed origins
  - Keep localhost for local dev

- [ ] **1.5 Test Gunicorn locally**

  - Command: `gunicorn -w 4 -b 0.0.0.0:5001 wsgi:app`
  - Verify all endpoints work
  - Test transcription + categorization

- [ ] **1.6 Update config for production**
  - File: `backend/app/config.py`
  - Add DATABASE_URL parsing for PostgreSQL
  - Keep SQLite fallback for local dev

### Phase 2: Database Migration (SQLite → PostgreSQL)

- [ ] **2.1 Install PostgreSQL adapter**

  - Add `psycopg2-binary` to dependencies
  - Update requirements.txt

- [ ] **2.2 Update storage layer**

  - File: `backend/app/services/storage.py`
  - Add PostgreSQL connection logic
  - Detect DATABASE_URL env var
  - Keep SQLite for local development

- [ ] **2.3 Create migration strategy**

  - Option A: Fresh start (lose local data)
  - Option B: Export/import existing notes
  - Decision: Fresh start for POC

- [ ] **2.4 Test PostgreSQL locally (optional)**
  - Use Docker PostgreSQL container
  - Test connection string format
  - Verify FTS5 → PostgreSQL full-text search

### Phase 3: Frontend Production Setup

- [ ] **3.1 Verify build script**

  - File: `frontend/package.json`
  - Check `build` script exists ✅ (already has it)
  - Test build locally: `npm run build`

- [ ] **3.2 Create Railway config**

  - File: `frontend/nixpacks.toml`
  - Specify build + serve commands
  - Use serve or Railway's static hosting

- [ ] **3.3 Update API URL handling**

  - File: `frontend/src/lib/api.ts`
  - Ensure `VITE_API_URL` works for production
  - Test with different URLs

- [ ] **3.4 Test production build locally**
  - Build: `npm run build`
  - Preview: `npm run preview`
  - Verify all features work

### Phase 4: Railway Setup

- [ ] **4.1 Create Railway account**

  - Sign up at https://railway.app
  - Connect GitHub account
  - Verify email

- [ ] **4.2 Install Railway CLI (optional)**

  - Command: `curl -fsSL https://railway.app/install.sh | sh`
  - Login: `railway login`
  - Test: `railway whoami`

- [ ] **4.3 Create new Railway project**

  - Method: GitHub integration (recommended)
  - Project name: `advanced-notes`
  - Link to GitHub repo

- [ ] **4.4 Add PostgreSQL database**
  - Click "New" → "Database" → "PostgreSQL"
  - Railway auto-provisions
  - Note: Sets `DATABASE_URL` env var automatically

### Phase 5: Backend Deployment

- [ ] **5.1 Create backend service**

  - Service name: `backend`
  - Root directory: `/backend`
  - Build provider: Nixpacks (auto-detected)

- [ ] **5.2 Configure backend environment variables**

  ```bash
  OPENAI_API_KEY=sk-...        # Your OpenAI key
  OPENAI_MODEL=gpt-4o-mini
  FLASK_ENV=production
  CONFIDENCE_THRESHOLD=0.7
  DATABASE_URL=...              # Auto-set by Railway
  ```

- [ ] **5.3 Deploy backend**

  - Push to GitHub (auto-deploys) OR
  - Railway CLI: `railway up`
  - Monitor build logs

- [ ] **5.4 Verify backend deployment**

  - Check deployment logs for errors
  - Get Railway-provided URL
  - Test: `curl https://your-backend.railway.app/api/health`
  - Test: `/api/folders`, `/api/tags`

- [ ] **5.5 Test transcription on Railway**
  - Upload audio via Postman/curl
  - Verify OpenAI API key works
  - Check database saves notes
  - Verify PostgreSQL connection

### Phase 6: Frontend Deployment

- [ ] **6.1 Create frontend service**

  - Service name: `frontend`
  - Root directory: `/frontend`
  - Build provider: Nixpacks (auto-detected)

- [ ] **6.2 Configure frontend environment variables**

  ```bash
  VITE_API_URL=https://your-backend.railway.app
  ```

- [ ] **6.3 Deploy frontend**

  - Push to GitHub (auto-deploys) OR
  - Railway CLI: `railway up`
  - Monitor build logs

- [ ] **6.4 Verify frontend deployment**
  - Get Railway-provided URL
  - Visit URL in browser
  - Check console for CORS errors
  - Test all features end-to-end

### Phase 7: Integration Testing

- [ ] **7.1 Test audio recording**

  - Record audio in browser
  - Verify transcription works
  - Check AI categorization

- [ ] **7.2 Test audio upload**

  - Upload various formats (MP3, WAV, WebM)
  - Verify 25MB limit enforced
  - Check error handling

- [ ] **7.3 Test note organization**

  - Verify folder hierarchy displays
  - Test folder navigation
  - Check note counts accurate

- [ ] **7.4 Test search functionality**

  - Full-text search with FTS
  - Verify results relevance
  - Check search performance

- [ ] **7.5 Test CRUD operations**

  - Create notes (via transcription)
  - Read notes (view details)
  - Update notes (edit tags, etc.)
  - Delete notes

- [ ] **7.6 Mobile responsiveness**
  - Test on mobile viewport
  - Verify tabs work correctly
  - Check touch interactions

### Phase 8: Production Hardening

- [ ] **8.1 Set up custom domain (optional)**

  - Configure DNS
  - Add domain in Railway
  - Enable SSL/TLS (automatic)

- [ ] **8.2 Configure logging**

  - Review Railway logs
  - Set up error alerts
  - Monitor API usage

- [ ] **8.3 Set up monitoring**

  - Monitor OpenAI API costs
  - Track Railway resource usage
  - Set up uptime monitoring (UptimeRobot)

- [ ] **8.4 Security review**

  - Verify env vars are not logged
  - Check CORS is restrictive
  - Review API rate limiting needs
  - Confirm no secrets in codebase

- [ ] **8.5 Backup strategy**

  - Set up PostgreSQL backups
  - Export notes functionality (future)
  - Document recovery process

- [ ] **8.6 Update documentation**
  - Add deployment URLs to README
  - Document deployment process
  - Update Cursor rules with prod info

---

## 📋 Environment Variables Reference

### Backend (`backend/.env` local, Railway dashboard for prod)

```bash
# Required
OPENAI_API_KEY=sk-...                    # OpenAI API key
DATABASE_URL=postgresql://...            # Auto-set by Railway

# Optional (with defaults)
OPENAI_MODEL=gpt-4o-mini                 # AI model for categorization
FLASK_ENV=production                     # Flask environment
CONFIDENCE_THRESHOLD=0.7                 # AI categorization threshold
```

### Frontend (`frontend/.env` local, Railway dashboard for prod)

```bash
# Required
VITE_API_URL=https://backend.railway.app # Backend API URL
```

---

## 🐛 Common Issues & Solutions

### Issue: Build fails with "requirements.txt not found"

**Solution:** Generate from pyproject.toml: `uv pip compile pyproject.toml -o requirements.txt`

### Issue: CORS errors in browser console

**Solution:** Add Railway frontend URL to CORS origins in `backend/app/__init__.py`

### Issue: Database connection fails

**Solution:** Verify `DATABASE_URL` env var is set, check PostgreSQL plugin status

### Issue: Frontend can't reach backend API

**Solution:** Double-check `VITE_API_URL` points to Railway backend URL (with https://)

### Issue: SQLite file not found in production

**Solution:** Expected! Use PostgreSQL instead (DATABASE_URL auto-configured)

### Issue: OpenAI API key invalid

**Solution:** Verify key in Railway dashboard env vars, check for typos/extra spaces

### Issue: Port binding error

**Solution:** Ensure Procfile uses `$PORT` variable, not hardcoded port

---

## 🚀 Deployment Commands Quick Reference

### Local Testing

```bash
# Backend with Gunicorn
cd backend
gunicorn -w 4 -b 0.0.0.0:5001 wsgi:app

# Frontend production build
cd frontend
npm run build
npm run preview
```

### Railway CLI

```bash
# Install
curl -fsSL https://railway.app/install.sh | sh

# Login
railway login

# Initialize project
railway init

# Deploy
railway up

# View logs
railway logs

# Set env var
railway variables set OPENAI_API_KEY=sk-...

# Open dashboard
railway open
```

### Git-based Deployment

```bash
# Commit changes
git add .
git commit -m "deploy: production configuration"

# Push to GitHub (triggers auto-deploy)
git push origin main
```

---

## 📊 Cost Estimation

### Railway Free Tier

- **$5/month credit** (no credit card required)
- **500 hours execution time**
- **100GB outbound bandwidth**
- **Good for:** POC testing, low traffic

### Expected Costs (with traffic)

- **Backend service:** ~$5-10/month
- **Frontend service:** ~$3-5/month (static)
- **PostgreSQL:** ~$5/month (1GB storage)
- **Total:** ~$13-20/month for production

### OpenAI API Costs

- **gpt-4o-mini-transcribe:** ~$0.10 per hour of audio
- **gpt-4o-mini (categorization):** ~$0.10 per 1M tokens
- **Estimated:** $5-10/month for moderate use

**Total monthly cost:** ~$20-30/month

---

## 🎯 Success Criteria

Deployment is complete when:

- ✅ Backend responds at Railway URL
- ✅ Frontend loads at Railway URL
- ✅ Audio recording/upload works end-to-end
- ✅ OpenAI transcription successful
- ✅ AI categorization saves to PostgreSQL
- ✅ Folder hierarchy displays correctly
- ✅ Search returns results
- ✅ No CORS errors in console
- ✅ Mobile layout works correctly
- ✅ SSL/HTTPS enabled (automatic)

---

## 🔗 Useful Links

- **Railway Dashboard:** https://railway.app/dashboard
- **Railway Docs:** https://docs.railway.app/
- **PostgreSQL Connection:** Railway dashboard → Database → Connection
- **Build Logs:** Railway dashboard → Service → Deployments
- **OpenAI Dashboard:** https://platform.openai.com/usage

---

**Next Step:** Begin Phase 1 - Backend Production Setup

**Estimated Time to Complete:** 2-3 hours (first time), 30 minutes (subsequent deploys)

**Last Updated:** November 8, 2025
