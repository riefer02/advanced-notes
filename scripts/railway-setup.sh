#!/bin/bash
# Railway Deployment Script
# Based on: https://docs.railway.com/guides/cli

set -e  # Exit on error

echo "🚂 Railway Deployment Script"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found${NC}"
    echo "Install with: brew install railway"
    exit 1
fi

echo -e "${GREEN}✅ Railway CLI installed${NC}"
echo ""

# Step 1: Login to Railway
echo -e "${BLUE}Step 1: Authenticating with Railway...${NC}"
railway login
echo -e "${GREEN}✅ Authenticated${NC}"
echo ""

# Step 2: Create new project
echo -e "${BLUE}Step 2: Creating new Railway project...${NC}"
echo -e "${YELLOW}You'll be prompted to:${NC}"
echo "  - Enter project name (suggestion: advanced-notes)"
echo "  - Select team/workspace"
railway init
echo -e "${GREEN}✅ Project created${NC}"
echo ""

# Step 3: Add PostgreSQL database
echo -e "${BLUE}Step 3: Adding PostgreSQL database...${NC}"
railway add --database postgres
echo -e "${GREEN}✅ PostgreSQL provisioned${NC}"
echo -e "${YELLOW}Note: DATABASE_URL will be automatically set${NC}"
echo ""

# Step 4: Set environment variables for backend
echo -e "${BLUE}Step 4: Setting backend environment variables...${NC}"
echo ""
echo -e "${YELLOW}⚠️  MANUAL INPUT REQUIRED${NC}"
read -p "Enter your OpenAI API Key: " OPENAI_KEY

railway variables set OPENAI_API_KEY="$OPENAI_KEY"
railway variables set OPENAI_MODEL="gpt-4o-mini"
railway variables set FLASK_ENV="production"
railway variables set CONFIDENCE_THRESHOLD="0.7"

echo -e "${GREEN}✅ Environment variables set${NC}"
echo ""

# Step 5: Link to production environment
echo -e "${BLUE}Step 5: Linking to production environment...${NC}"
railway environment
echo -e "${GREEN}✅ Environment linked${NC}"
echo ""

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✅ Railway Setup Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Deploy backend: cd backend && railway up"
echo "2. Get backend URL: railway domain"
echo "3. Set VITE_API_URL for frontend"
echo "4. Deploy frontend: cd frontend && railway up"
echo ""
echo -e "${BLUE}View project: railway open${NC}"

