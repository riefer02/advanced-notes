.PHONY: help dev backend frontend clean

help:
	@echo "Available targets:"
	@echo "  make dev       - Start both backend and frontend in parallel"
	@echo "  make backend   - Start only the backend (Flask)"
	@echo "  make frontend  - Start only the frontend (Vite)"
	@echo "  make clean     - Remove all generated files and caches"
	@echo "  make install   - Install all dependencies"

dev:
	@echo "Starting backend and frontend..."
	@(cd backend && ./run.sh) & \
	(cd frontend && npm run dev)

backend:
	@echo "Starting Flask backend on http://localhost:5001"
	@cd backend && ./run.sh

frontend:
	@echo "Starting Vite frontend on http://localhost:5173"
	@cd frontend && npm run dev

install:
	@echo "Installing backend dependencies..."
	@cd backend && uv sync
	@echo "Installing frontend dependencies..."
	@cd frontend && npm install
	@echo "✓ All dependencies installed"

clean:
	@echo "Cleaning build artifacts and caches..."
	@rm -rf backend/.venv backend/__pycache__ backend/**/__pycache__
	@rm -rf frontend/node_modules frontend/dist frontend/.vite
	@echo "✓ Cleaned"

