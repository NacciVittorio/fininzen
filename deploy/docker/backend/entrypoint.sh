#!/bin/sh
# Backend container entrypoint: bring the database schema and static assets in
# line with the image, then exec the real command (gunicorn). Idempotent, so it
# is safe to run on every container (re)start.
set -e

echo "[entrypoint] applying database migrations..."
python manage.py migrate --noinput

echo "[entrypoint] collecting static files..."
python manage.py collectstatic --noinput

echo "[entrypoint] starting: $*"
exec "$@"
