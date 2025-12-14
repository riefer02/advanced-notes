.PHONY: help dev backend frontend clean install test-backend test-backend-fast test-frontend-build

help:
	@echo "Available targets:"
	@echo "  make dev       - Start both backend and frontend in parallel"
	@echo "  make backend   - Start only the backend (Flask)"
	@echo "  make frontend  - Start only the frontend (Vite)"
	@echo "  make clean     - Remove all generated files and caches"
	@echo "  make install   - Install all dependencies"
	@echo "  make test-backend       - Run backend pytest suite"
	@echo "  make test-backend-fast  - Run backend pytest suite (stop on first failure)"
	@echo "  make test-frontend-build - Run frontend production build"

dev:
	@echo "Starting backend and frontend..."
	@(cd backend && ./run.sh) & \
	(cd frontend && pnpm run dev)

backend:
	@echo "Starting Flask backend on http://localhost:5001"
	@cd backend && ./run.sh

frontend:
	@echo "Starting Vite frontend on http://localhost:5173"
	@cd frontend && pnpm run dev

install:
	@echo "Installing backend dependencies..."
	@cd backend && uv sync
	@echo "Installing frontend dependencies..."
	@cd frontend && pnpm install
	@echo "✓ All dependencies installed"

test-backend:
	@echo "Running backend tests..."
	@cd backend && uv run python -m pytest tests/

test-backend-fast:
	@echo "Running backend tests (fast fail)..."
	@cd backend && uv run python -m pytest -x tests/

test-frontend-build:
	@echo "Running frontend build..."
	@cd frontend && pnpm run build

clean:
	@echo "Cleaning build artifacts and caches..."
	@rm -rf backend/.venv backend/__pycache__ backend/**/__pycache__
	@rm -rf frontend/node_modules frontend/dist frontend/.vite
	@echo "✓ Cleaned"

