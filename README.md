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

This is the setup a new lab follows end-to-end, on their own server, the first time they deploy.
`.env` files hold real secrets and are never committed to git — each lab creates its own from the
`.env.example` templates below and fills in its own values locally.

```bash
git clone <this repo>
cd marineAnnotate

# Copy the two env templates:
cp backend/.env.example backend/.env       # app config (SECRET_KEY, SMTP, admin account, etc.)
cp .env.example .env                       # Postgres/Redis passwords (repo root)
```

Now edit both files:

**`backend/.env`** — at minimum, set:

- `SECRET_KEY` — generate one, never leave the placeholder: `python -c "import secrets; print(secrets.token_urlsafe(48))"`
- `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` — becomes the very first admin account, auto-created
  on first boot. Use a strong password here — there's currently no in-app "change my own password"
  option, only the email-based forgot/reset flow, so whatever you set here (or later reset it to) is
  what sticks.
- `APP_URL` — the real address your team will reach it at (e.g. `http://192.168.1.50:5173`), **not**
  `localhost` if this is a shared server. This gets embedded in every invite/reset email link.
- `SMTP_*` — optional, but without it invite/reset links only print to `docker compose logs backend`
  instead of emailing. Worth configuring before onboarding real people (see the SMTP note in
  [SECURITY.md](SECURITY.md) for the Gmail App Password setup used during development).

**`.env`** (repo root) — generate strong values for `POSTGRES_PASSWORD` and `REDIS_PASSWORD`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(24))"
```

Then build and start:

```bash
docker compose up --build -d
open http://localhost:5173   # or your server's address
```

Log in with the `FIRST_ADMIN_EMAIL`/`FIRST_ADMIN_PASSWORD` you set above — see
[Inviting Lab Members](#inviting-lab-members) below for onboarding the rest of the team.

Images and models persist in `./storage/` on the host. Postgres and Redis are not exposed to the
host network — only the `backend` container can reach them — so `POSTGRES_PASSWORD`/`REDIS_PASSWORD`
only need to be strong, not memorable. For admin access to the database directly, use
`docker compose exec db psql -U marine marine_annotate` rather than exposing the port.

---

## API Docs

Auto-generated OpenAPI docs available at **http://localhost:8000/docs** — only when `DEBUG=true` in
`backend/.env` (disabled by default, since exposing them is a minor information leak on a real
deployment). Set `DEBUG=true` locally if you want to browse them.

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

---

## Inviting Lab Members

There's no public sign-up page — accounts are always admin-invited. This is deliberate: nothing
about this app should be reachable by someone who wasn't given access on purpose.

1. Log in as an admin and open the **Admin Console**.
2. Click **Invite member**, fill in their name, email, and role, and send.
3. They receive an email with a link (or, if SMTP isn't configured yet, an admin fetches the link
   from `docker compose logs backend` — it's printed there as a fallback).
4. They open the link, set **their own password** (the admin never sees or sets it), and can log in
   immediately.
5. Platform account access and project access are separate steps. To get them working on a specific
   project, open that **Project → Members** and add them from the member list — they need an
   account first (steps 1–4) before they can be added to any project.

Every invite sent, and every account created, role change, or disable/enable, is recorded in the
**Activity log** in the Admin Console — see [SECURITY.md](SECURITY.md) for what else is logged.

---

## Data & Privacy

MarineAnnotate is self-hosted — everything below lives on **your own server**, under **your own
control**. Nothing is sent to the project's maintainers or any third party.

**Personal data stored about your team:**

- Name, email address, and role for each user account
- Login timestamps (`last_login`)
- Who created/edited/reviewed each annotation, and a full edit history per annotation

**Where it lives:** the Postgres database and the `storage/` directory on whichever machine you
deploy this to. If you configure SMTP for invite/reset emails, those emails (containing a name and
email address) pass through whatever mail server you point `SMTP_HOST` at.

**Your responsibility as the operator:** if your team includes people in the EU/UK, running this
app for them makes your lab a data controller under GDPR for the account data above — you're the
one who decides how long it's retained and who can delete it (an admin can deactivate an account
via the Admin console; there's no self-service "delete my account" flow yet). See
[SECURITY.md](SECURITY.md) for hardening a deployment beyond `localhost`.

---

## Backups

Nothing is backed up automatically — set this up before you have real project data on it.

```bash
# One-off backup (dumps the database + archives storage/ into ./backups/)
./scripts/backup.sh

# Restore from a backup (DESTRUCTIVE — overwrites current data)
./scripts/restore.sh backups/db_20260821_020000.sql.gz backups/storage_20260821_020000.tar.gz
```

Schedule `backup.sh` to run nightly with cron (Linux/Mac) or Windows Task Scheduler. It keeps the
last 14 backups of each kind and deletes older ones — adjust `KEEP` in the script if you want more
history. Copy the `backups/` directory offsite periodically (a local backup on the same disk as the
database doesn't protect you from disk failure).

---

## License & Citation

MIT licensed — see [LICENSE](LICENSE). Free to use, fork, and self-host, including for other labs.

If MarineAnnotate is used in published research, please cite it — see [CITATION.cff](CITATION.cff)
(GitHub renders a ready-to-copy citation for this automatically via the "Cite this repository"
button on the repo page).
