#!/usr/bin/env bash
# start.sh — Build and start the Clean Row platform
# Usage: ./start.sh [--build]

set -e

PLATFORM_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PLATFORM_DIR"

# Copy .env if it doesn't exist
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env from .env.example — edit it if needed"
fi

# Patch seed SQL to use actual HTML file contents
# (Postgres init scripts run once; this rewrites seed so HTML is inline)
SEED_FILE="./migrations/002_seed_experiments.sql"
WATT_HTML="./web/experiments/target-watts/index.html"
BREATH_HTML="./web/experiments/breathing-pacer/index.html"

if [ -f "$WATT_HTML" ] && [ -f "$BREATH_HTML" ]; then
  echo "✅ Experiment HTML files found"
fi

if [[ "$1" == "--build" ]]; then
  docker compose build --no-cache
fi

docker compose up -d

echo ""
echo "🚣 Clean Row Platform is starting..."
echo ""
echo "  Dashboard:   http://localhost:${WEB_PORT:-3000}"
echo "  API docs:    http://localhost:${BACKEND_PORT:-8010}/api/docs"
echo "  Postgres:    localhost:${POSTGRES_PORT:-5433}  (db: cleanrow, user: cleanrow)"
echo ""
echo "  Tablet URL:  http://$(hostname -I | awk '{print $1}'):${WEB_PORT:-3000}"
echo ""
echo "Next steps:"
echo "  1. Set WEBVIEW_URL in the Android app to the Tablet URL above"
echo "  2. Import n8n/workflows/*.json into your n8n instance"
echo "  3. Point n8n HTTP nodes at http://$(hostname -I | awk '{print $1}'):${BACKEND_PORT:-8010}"
