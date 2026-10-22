#!/usr/bin/env bash
# Render Build Script - runs once at deploy time
set -o errexit

echo "=== Installing Python dependencies ==="
pip install --upgrade pip
pip install -r requirements.txt

echo "=== Collecting static files ==="
cd source/djangoserver
python manage.py collectstatic --noinput

echo "=== Running migrations (build-time, best-effort) ==="
python manage.py migrate --noinput || echo "WARNING: migrate failed at build time (DB may not exist yet -- start.sh will retry)"

echo "=== Build complete ==="
