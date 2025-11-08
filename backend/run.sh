#!/usr/bin/env bash
set -euo pipefail

export FLASK_APP=wsgi:app
export FLASK_ENV=development

echo "Starting Flask backend on http://0.0.0.0:5001"
uv run flask run --host 0.0.0.0 --port 5001

