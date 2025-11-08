#!/bin/bash
# Railway CLI Helper Commands
# Quick reference for common Railway CLI operations

echo "🚂 Railway CLI Helper Commands"
echo "================================"
echo ""

show_help() {
    echo "Usage: ./railway-helpers.sh [command]"
    echo ""
    echo "Commands:"
    echo "  status        - Show current Railway project status"
    echo "  logs          - Stream logs (backend by default)"
    echo "  logs-fe       - Stream frontend logs"
    echo "  logs-be       - Stream backend logs"
    echo "  env           - List environment variables"
    echo "  env-set       - Set a new environment variable"
    echo "  domain        - Show deployed URLs"
    echo "  open          - Open Railway dashboard"
    echo "  ssh           - SSH into backend service"
    echo "  restart       - Restart services"
    echo "  link          - Link to a different project"
    echo "  whoami        - Show current user info"
    echo ""
}

case "$1" in
    status)
        railway status
        ;;
    logs)
        echo "📋 Streaming backend logs (Ctrl+C to stop)..."
        railway logs
        ;;
    logs-fe)
        echo "📋 Streaming frontend logs (Ctrl+C to stop)..."
        railway logs --service frontend
        ;;
    logs-be)
        echo "📋 Streaming backend logs (Ctrl+C to stop)..."
        railway logs --service backend
        ;;
    env)
        echo "🔐 Environment variables:"
        railway variables
        ;;
    env-set)
        if [ -z "$2" ] || [ -z "$3" ]; then
            echo "Usage: ./railway-helpers.sh env-set KEY VALUE"
            exit 1
        fi
        railway variables set "$2"="$3"
        echo "✅ Set $2=$3"
        ;;
    domain)
        echo "🌐 Deployed URLs:"
        railway domain
        ;;
    open)
        echo "🌐 Opening Railway dashboard..."
        railway open
        ;;
    ssh)
        echo "🔌 Connecting to backend service..."
        railway ssh
        ;;
    restart)
        echo "🔄 Restarting services..."
        railway restart
        ;;
    link)
        echo "🔗 Linking to Railway project..."
        railway link
        ;;
    whoami)
        railway whoami
        ;;
    *)
        show_help
        ;;
esac

