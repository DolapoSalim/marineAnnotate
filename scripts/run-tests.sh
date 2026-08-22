#!/bin/sh
# Runs the backend test suite locally against disposable Postgres/Redis
# containers (docker-compose.test.yml) — never touches the real dev stack's
# database. Requires backend/requirements-test.txt installed locally
# (pip install -r backend/requirements-test.txt), or run inside any Python
# env with those packages available.
set -eu

cd "$(dirname "$0")/.."

docker compose -f docker-compose.test.yml up -d
cleanup() { docker compose -f docker-compose.test.yml down; }
trap cleanup EXIT

echo "Waiting for test database..."
until docker compose -f docker-compose.test.yml exec -T test-db pg_isready -U test -d marine_test >/dev/null 2>&1; do
  sleep 1
done

cd backend
DATABASE_URL="postgresql+asyncpg://test:test@localhost:5433/marine_test" \
REDIS_URL="redis://localhost:6380/0" \
SECRET_KEY="test-only-secret-not-used-anywhere-real-0123456789" \
FIRST_ADMIN_EMAIL="admin@test.local" \
FIRST_ADMIN_PASSWORD="TestAdminPassword123" \
ALLOWED_ORIGINS='["http://testserver"]' \
pytest "$@"
