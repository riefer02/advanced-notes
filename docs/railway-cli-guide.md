# Railway CLI Deployment Guide

**Reference:** [Railway CLI Documentation](https://docs.railway.com/guides/cli)

---

## 📦 What's Been Created

I've created 4 helper scripts to streamline your Railway deployment:

1. **`scripts/railway-setup.sh`** - Initial Railway project setup
2. **`scripts/deploy-backend.sh`** - Deploy backend service
3. **`scripts/deploy-frontend.sh`** - Deploy frontend service
4. **`scripts/railway-helpers.sh`** - Common Railway CLI commands

All scripts are executable and ready to use! ✅

---

## 🚀 Step-by-Step Deployment Process

### Phase 1: Initial Setup (One-time)

```bash
# 1. Run the setup script
./scripts/railway-setup.sh
```

**This script will:**
- ✅ Authenticate with Railway (`railway login`)
- ✅ Create a new project (`railway init`)
- ✅ Provision PostgreSQL database (`railway add`)
- ✅ Set environment variables (`railway variables set`)
- ⚠️ **Prompts you for:** OpenAI API key

**Estimated time:** 5 minutes

---

### Phase 2: Deploy Backend

```bash
# 2. Deploy the Flask backend
./scripts/deploy-backend.sh
```

**This script will:**
- ✅ Navigate to `backend/` directory
- ✅ Deploy to Railway (`railway up`)
- ✅ Return immediately (uses `--detach`)

**After deployment:**
```bash
# Get your backend URL
railway domain

# Watch logs
railway logs

# Test the API
curl https://your-backend.railway.app/api/health
```

**Estimated time:** 3-5 minutes (first deploy)

---

### Phase 3: Deploy Frontend

```bash
# 3. Deploy the Vite frontend
./scripts/deploy-frontend.sh
```

**This script will:**
- ✅ Prompt for backend URL (from Phase 2)
- ✅ Set `VITE_API_URL` environment variable
- ✅ Deploy to Railway (`railway up`)

**After deployment:**
```bash
# Get your frontend URL
railway domain

# Visit in browser
open https://your-frontend.railway.app
```

**Estimated time:** 2-3 minutes

---

## 🛠️ Helper Commands

Use the helper script for common operations:

```bash
# Show status
./scripts/railway-helpers.sh status

# Stream logs
./scripts/railway-helpers.sh logs          # Backend logs
./scripts/railway-helpers.sh logs-fe       # Frontend logs

# View environment variables
./scripts/railway-helpers.sh env

# Set new environment variable
./scripts/railway-helpers.sh env-set KEY VALUE

# Get deployed URLs
./scripts/railway-helpers.sh domain

# Open Railway dashboard
./scripts/railway-helpers.sh open

# SSH into backend
./scripts/railway-helpers.sh ssh

# Restart services
./scripts/railway-helpers.sh restart
```

---

## 📋 Manual CLI Commands (If Needed)

If you prefer to run commands manually instead of using scripts:

### Setup Commands

```bash
# 1. Login to Railway
railway login

# 2. Create new project
railway init
# Prompts: project name, team selection

# 3. Add PostgreSQL
railway add
# Select: PostgreSQL from list

# 4. Set environment variables
railway variables set OPENAI_API_KEY="sk-..."
railway variables set OPENAI_MODEL="gpt-4o-mini"
railway variables set FLASK_ENV="production"
railway variables set CONFIDENCE_THRESHOLD="0.7"

# 5. Select production environment
railway environment
```

### Deployment Commands

```bash
# Deploy backend
cd backend
railway up

# Deploy frontend
cd frontend
railway variables set VITE_API_URL="https://your-backend.railway.app"
railway up
```

### Monitoring Commands

```bash
# View logs
railway logs                      # Follow logs
railway logs --service backend    # Specific service

# Check status
railway status

# Get URLs
railway domain

# Open dashboard
railway open

# SSH into service
railway ssh
```

### Management Commands

```bash
# List environment variables
railway variables

# Set variable
railway variables set KEY=value

# Delete variable
railway variables delete KEY

# Link to different project
railway link

# Show current user
railway whoami

# Restart service
railway restart
```

---

## 🔧 Pre-Deployment Requirements

Before running the scripts, ensure you have:

### Backend Production Files

**1. Add Gunicorn to dependencies:**
```bash
cd backend
uv add gunicorn
uv pip compile pyproject.toml -o requirements.txt
```

**2. Create `backend/Procfile`:**
```
web: gunicorn -w 4 -b 0.0.0.0:$PORT wsgi:app
```

**3. Update CORS in `backend/app/__init__.py`:**
```python
CORS(app, origins=[
    "http://localhost:5173",  # Local
    os.getenv("FRONTEND_URL", "*")  # Railway (set via env var)
])
```

### Frontend Production Check

**Verify build script in `frontend/package.json`:**
```json
{
  "scripts": {
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

---

## 🗺️ Railway Project Structure

After setup, your Railway project will have:

```
Railway Project: advanced-notes
├── Service: backend
│   ├── Root Directory: /backend
│   ├── Environment Variables:
│   │   ├── OPENAI_API_KEY
│   │   ├── OPENAI_MODEL
│   │   ├── FLASK_ENV
│   │   ├── CONFIDENCE_THRESHOLD
│   │   └── DATABASE_URL (auto-set)
│   └── Build: Detected via Nixpacks
│
├── Service: frontend
│   ├── Root Directory: /frontend
│   ├── Environment Variables:
│   │   └── VITE_API_URL
│   └── Build: Detected via Nixpacks
│
└── Database: PostgreSQL
    └── Provides: DATABASE_URL to services
```

---

## 🐛 Troubleshooting

### "railway: command not found"
```bash
# Install Railway CLI
brew install railway
```

### "Not authenticated"
```bash
railway login
# Opens browser for authentication
```

### "No project linked"
```bash
railway link
# Select your project
```

### Build fails
```bash
# Check logs
railway logs

# Common fixes:
# - Ensure requirements.txt exists (backend)
# - Ensure Procfile exists (backend)
# - Verify package.json has build script (frontend)
```

### Database connection fails
```bash
# Verify DATABASE_URL is set
railway variables | grep DATABASE_URL

# Check PostgreSQL status in dashboard
railway open
```

### CORS errors
```bash
# Update backend CORS origins
# Add Railway frontend URL to allowed origins
railway variables set FRONTEND_URL="https://your-frontend.railway.app"
```

---

## 📊 Expected Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Initial setup (railway-setup.sh) | 5 min |
| 2 | Deploy backend (deploy-backend.sh) | 5 min |
| 3 | Deploy frontend (deploy-frontend.sh) | 3 min |
| 4 | Testing & verification | 5 min |
| **Total** | **First deployment** | **~20 min** |

**Subsequent deploys:** Just run `railway up` (2-3 minutes)

---

## 🎯 Success Checklist

After running all scripts, verify:

- [ ] Backend responds: `curl https://backend-url/api/health`
- [ ] Frontend loads in browser
- [ ] Can record/upload audio
- [ ] Transcription works (OpenAI API)
- [ ] Notes save to PostgreSQL
- [ ] Folder hierarchy displays
- [ ] Search returns results
- [ ] No CORS errors in console

---

## 🔗 Useful Railway CLI References

- **CLI Installation:** [docs.railway.com/guides/cli](https://docs.railway.com/guides/cli)
- **CLI API Reference:** [docs.railway.com/reference/cli-api](https://docs.railway.com/reference/cli-api)
- **Environments:** [docs.railway.com/guides/environments](https://docs.railway.com/guides/environments)
- **Databases:** [docs.railway.com/guides/databases](https://docs.railway.com/guides/databases)

---

## 🚦 Next Steps

1. **Run setup:** `./scripts/railway-setup.sh`
2. **Deploy backend:** `./scripts/deploy-backend.sh`
3. **Deploy frontend:** `./scripts/deploy-frontend.sh`
4. **Test everything:** Use the success checklist above
5. **Monitor:** `./scripts/railway-helpers.sh logs`

**Questions or issues?** Check the troubleshooting section or run:
```bash
railway --help
```

---

**Last Updated:** November 8, 2025  
**Railway CLI Version:** Latest (via Homebrew)

