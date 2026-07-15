# MarineAnnotate

In-house annotation platform for underwater marine imagery — seagrasses, macroalgae, and fish species.

## Features

- **Bounding box, polygon, keypoint & classification** annotation tools
- **AI-assisted labelling** — upload any YOLO model, run inference on unannotated images, review/edit/accept/reject suggestions
- **Editable AI predictions** — drag handles directly on canvas to correct slightly off predictions before accepting
- **Real-time collaboration** — WebSocket-based live sync; multiple lab members can work simultaneously
- **Admin console** — create/manage lab accounts, assign roles (admin / reviewer / annotator)
- **Project & batch management** — organise images into projects and batches, assign images to team members
- **Export** — COCO JSON, YOLO TXT (zip), Pascal VOC (zip), CSV
- **Annotation history** — every change is tracked with full rollback capability
- **Image enhancement** — brightness/contrast controls (Phase 2)

---

## Quick Start (Local Dev)

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL 14+ running locally (`marine` user, `marine_annotate` database)

### 1. Start PostgreSQL

```bash
createuser -s marine
createdb -O marine marine_annotate
```

Or with Docker:
```bash
docker run -d --name marine-pg \
  -e POSTGRES_USER=marine -e POSTGRES_PASSWORD=marine -e POSTGRES_DB=marine_annotate \
  -p 5432:5432 postgres:16-alpine
```

### 2. Launch everything

```bash
chmod +x start.sh
./start.sh
```

Open **http://localhost:5173** — default login: `admin@lab.local` / `changeme123`

---

## Docker Compose (Recommended for Lab Server)

```bash
# Copy and edit env
cp backend/.env.example backend/.env

# Build and start
docker compose up --build

# Open
open http://localhost:5173
```

Images and models persist in `./storage/` on the host.

---

## API Docs

Auto-generated OpenAPI docs available at **http://localhost:8000/docs** when the backend is running.

---

## Project Structure

```
marineAnnotate/
├── backend/
│   ├── app/
│   │   ├── core/          # Config, DB, security
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── schemas/       # Pydantic V2 schemas
│   │   ├── crud/          # Database operations
│   │   ├── routers/       # FastAPI route handlers
│   │   │   ├── auth.py
│   │   │   ├── users.py
│   │   │   ├── projects.py
│   │   │   ├── images.py
│   │   │   ├── annotations.py
│   │   │   ├── ai.py       # Model upload + inference jobs
│   │   │   ├── export.py   # COCO/YOLO/VOC/CSV export
│   │   │   └── websocket.py
│   │   ├── services/
│   │   │   ├── inference.py  # YOLO inference pipeline
│   │   │   └── websocket.py  # WS connection manager
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── api/           # Axios API client
│   │   ├── components/
│   │   │   ├── canvas/    # Konva annotation canvas
│   │   │   └── sidebar/   # AI review panel
│   │   ├── hooks/         # useWebSocket
│   │   ├── pages/         # Login, Dashboard, Project, Annotate, Admin
│   │   ├── store/         # Zustand stores (auth, canvas, project)
│   │   └── types/         # TypeScript types
│   └── Dockerfile
│
├── docker-compose.yml
├── start.sh
└── README.md
```

---

## AI-Assisted Labelling Workflow

1. **Annotate** a subset of images manually (e.g. 50 of 200)
2. **Export** as YOLO format and train your model externally (YOLOv9/v11)
3. **Upload** the trained `.pt` model in Project → Models tab
4. **Map** YOLO class IDs to your label classes (JSON mapping)
5. **Run AI assist** on a batch — inference runs in the background
6. **Review** — each prediction shown with confidence; drag handles to correct, then accept/reject
7. **Retrain** on the growing confirmed set to improve the model iteratively

---

## Keyboard Shortcuts (Annotation Editor)

| Key | Action |
|-----|--------|
| `B` | Bounding box tool |
| `P` | Polygon tool (double-click to close) |
| `K` | Keypoint tool |
| `V` | Select tool |
| `H` | Pan tool |
| `←` / `→` | Previous / next image |
| `+` / `-` | Zoom in / out |
| `Del` / `Backspace` | Delete selected annotation |
| `A` | Accept AI suggestion (in review panel) |
| `R` | Reject AI suggestion |

---

## Roles

| Role | Can do |
|------|--------|
| **Admin** | Everything + create/manage users |
| **Reviewer** | Annotate + approve/reject annotations |
| **Annotator** | Annotate images in assigned projects |
