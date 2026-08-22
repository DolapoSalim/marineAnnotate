#!/bin/sh
set -e

# The celery_worker service uses this same image/entrypoint but sets
# RUN_MIGRATIONS=false — only one process should ever run migrations, and it
# shouldn't be a race between whichever of backend/celery_worker starts first.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running database migrations..."
  alembic upgrade head
fi

# Normal container start (no override command): run the app.
# Otherwise (e.g. `docker compose run backend alembic revision ...` for admin
# tasks): run the migrations above, then run whatever command was actually
# asked for instead of always starting uvicorn regardless of the argument.
if [ "$#" -eq 0 ]; then
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
else
  exec "$@"
fi
