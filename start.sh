#!/usr/bin/env bash
set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

echo -e "${BLUE}🐠 MarineAnnotate — Local Dev Setup${NC}\n"

# ── Backend ──────────────────────────────────────────────────────────────────
echo -e "${YELLOW}Setting up backend…${NC}"
cd backend

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate

pip install -q -r requirements.txt

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "${GREEN}  Created .env from .env.example — edit it to set your DB URL${NC}"
fi

mkdir -p storage/images storage/models

echo -e "${GREEN}  Starting FastAPI on http://localhost:8000${NC}"
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

deactivate
cd ..

# ── Frontend ─────────────────────────────────────────────────────────────────
echo -e "\n${YELLOW}Setting up frontend…${NC}"
cd frontend

if [ ! -d "node_modules" ]; then
  npm install
fi

echo -e "${GREEN}  Starting Vite on http://localhost:5173${NC}"
npm run dev &
FRONTEND_PID=$!

cd ..

echo -e "\n${GREEN}✅ MarineAnnotate is running!${NC}"
echo -e "   Frontend  → ${BLUE}http://localhost:5173${NC}"
echo -e "   API       → ${BLUE}http://localhost:8000${NC}"
echo -e "   API docs  → ${BLUE}http://localhost:8000/docs${NC}"
echo -e "\n   Default admin: admin@lab.local / changeme123"
echo -e "\n   Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
