#!/usr/bin/env bash
# Render Build Script
# This script is run by Render during deployment.

set -o errexit

echo "=== Installing Python dependencies ==="
pip install --upgrade pip
pip install -r requirements.txt

echo "=== Collecting static files ==="
cd source/djangoserver
python manage.py collectstatic --noinput

echo "=== Applying database migrations ==="
python manage.py migrate --noinput

if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
    echo "=== Setting up admin user ==="
    python manage.py createsuperuser --noinput || true
fi

echo "=== Build complete ==="
