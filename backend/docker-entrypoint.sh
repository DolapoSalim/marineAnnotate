#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade head

# Normal container start (no override command): run the app.
# Otherwise (e.g. `docker compose run backend alembic revision ...` for admin
# tasks): run the migrations above, then run whatever command was actually
# asked for instead of always starting uvicorn regardless of the argument.
if [ "$#" -eq 0 ]; then
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
else
  exec "$@"
fi
