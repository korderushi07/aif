#!/bin/sh
set -e

cd /app/source/djangoserver

mkdir -p /app/source/djangoserver/dbdata

FERNET_FILE="/app/source/djangoserver/dbdata/fernet.key"

if [ -z "$RAGCHATBOT_FERNET_KEY" ]; then
  if [ -f "$FERNET_FILE" ]; then
    export RAGCHATBOT_FERNET_KEY="$(cat "$FERNET_FILE" | tr -d '\r\n')"
    echo "Loaded Fernet key from $FERNET_FILE"
  else
    export RAGCHATBOT_FERNET_KEY="$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")"
    echo "$RAGCHATBOT_FERNET_KEY" > "$FERNET_FILE"
    chmod 600 "$FERNET_FILE" || true
    echo "Generated Fernet key and saved to $FERNET_FILE"
  fi
else
  echo "Using Fernet key from environment"
fi

if [ ! -e "db.sqlite3" ]; then
  ln -s /app/source/djangoserver/dbdata/db.sqlite3 db.sqlite3
fi

python manage.py migrate --noinput
python manage.py collectstatic --noinput

if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ] && [ -n "$DJANGO_SUPERUSER_EMAIL" ]; then
  python manage.py createsuperuser --noinput || true
fi


exec gunicorn ragchatbot.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 120
