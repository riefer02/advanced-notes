#!/bin/bash
# Railway Backend Deployment Script
# Deploys the Flask backend to Railway

set -e

echo "🚀 Deploying Backend to Railway..."
echo "===================================="
echo ""

# Navigate to backend directory
cd "$(dirname "$0")/../backend"

# Check if we're in a Railway project
if ! railway status &> /dev/null; then
    echo "❌ Not linked to a Railway project"
    echo "Run railway link first, or run the setup script"
    exit 1
fi

echo "✅ Linked to Railway project"
echo ""

# Deploy backend
echo "📦 Deploying backend service..."
echo "   (This will take a few minutes on first deploy)"
railway up --detach

echo ""
echo "✅ Backend deployment initiated!"
echo ""
echo "Next steps:"
echo "1. Check logs: railway logs"
echo "2. Get URL: railway domain"
echo "3. Test health: curl https://your-backend.railway.app/api/health"
echo ""
echo "View in dashboard: railway open"

