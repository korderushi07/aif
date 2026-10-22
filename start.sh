#!/usr/bin/env bash
# Render Start Script - runs every time the container boots
set -o errexit

cd source/djangoserver

echo "=== Running database migrations ==="
python manage.py migrate --noinput

echo "=== Ensuring superuser exists ==="
python manage.py shell << 'EOF'
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(is_superuser=True).exists():
    User.objects.create_superuser(
        username='admin',
        email='admin@example.com',
        password='admin123'
    )
    print("Superuser created.")
else:
    print("Superuser already exists.")
EOF

echo "=== Starting gunicorn ==="
exec gunicorn ragchatbot.wsgi:application \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers 1 \
    --timeout 120 \
    --log-level info
