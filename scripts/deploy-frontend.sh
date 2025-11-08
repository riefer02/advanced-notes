#!/bin/bash
# Railway Frontend Deployment Script
# Deploys the Vite frontend to Railway

set -e

echo "🚀 Deploying Frontend to Railway..."
echo "===================================="
echo ""

# Navigate to frontend directory
cd "$(dirname "$0")/../frontend"

# Check for VITE_API_URL
if [ -z "$VITE_API_URL" ]; then
    echo "⚠️  VITE_API_URL not set"
    echo ""
    read -p "Enter your backend Railway URL: " BACKEND_URL
    railway variables set VITE_API_URL="$BACKEND_URL"
    echo "✅ VITE_API_URL set to: $BACKEND_URL"
    echo ""
fi

# Deploy frontend
echo "📦 Deploying frontend service..."
echo "   (Building production assets...)"
railway up --detach

echo ""
echo "✅ Frontend deployment initiated!"
echo ""
echo "Next steps:"
echo "1. Check logs: railway logs"
echo "2. Get URL: railway domain"
echo "3. Visit your app in browser"
echo ""
echo "View in dashboard: railway open"

