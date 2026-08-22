# Security Policy

MarineAnnotate is self-hosted lab software — you run it on your own server,
and your own admin controls who has access. That said, if you find a
vulnerability in the code itself (not a misconfiguration of your own
deployment), please report it responsibly.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report it privately via GitHub's [private vulnerability reporting](../../security/advisories/new)
feature on this repository, or by emailing the maintainer directly (see the
repository's commit history / GitHub profile for contact details).

Include:
- A description of the vulnerability and its impact
- Steps to reproduce it
- Affected version/commit

We'll acknowledge reports within a few days and aim to ship a fix before any
public disclosure.

## Supported Versions

This project does not yet have tagged releases with a formal support
window — until it does, only the `main` branch is supported. Please make
sure you're running the latest commit before reporting an issue.

## What's Already Handled

- **Postgres and Redis credentials are required, not defaulted.** `docker
  compose up` refuses to start without `POSTGRES_PASSWORD`/`REDIS_PASSWORD`
  set in the root `.env` (see `.env.example`) — there's no `marine`/`marine`
  fallback to forget about.
- **Neither Postgres nor Redis is exposed to the host network.**
  `docker-compose.yml` no longer publishes ports 5432/6379 — only the
  `backend` container can reach them. Use `docker compose exec db psql ...`
  for direct DB access instead of a published port.
- **Sessions die immediately on password reset or account disable**, not
  just at natural token expiry (per-user `token_version` checked on every
  request).
- **An audit trail** (`AuditLog` table, viewable in Admin Console → Activity
  log) records logins (success and failure), password resets, invites,
  account/role changes, and project deletions, each with actor and IP.
- **Dependabot** is configured (`.github/dependabot.yml`) for weekly
  pip/npm/Docker-base-image/GitHub-Actions vulnerability scanning once this
  repo is on GitHub.
- **Backups are scripted** — `scripts/backup.sh` / `scripts/restore.sh`, see
  the README's Backups section. Not automatic; still needs to be scheduled
  (cron/Task Scheduler) per deployment.
- Security headers (CSP, X-Frame-Options, etc.) are set on both the API
  responses and the frontend's nginx-served static content.
- **TLS is built in and one flag away**: `docker compose --profile tls up -d
  --build` starts a [Caddy](https://caddyserver.com/) reverse proxy that
  automatically gets a real Let's Encrypt certificate (if `DOMAIN` in the
  root `.env` is a real public domain) or a locally-trusted self-signed one
  (if it's `localhost`/an IP). Enabling it also binds `backend`/`frontend`'s
  ports to `127.0.0.1` only, so Caddy becomes the sole network-facing
  entrance — see the README's HTTPS / TLS section. Not enabled by default,
  since a fresh `git clone` should work with zero certificate setup for
  local testing.

## Deployment Security Checklist

The above is handled by the code itself. What's still left to you as the
operator, before exposing an instance beyond `localhost`:

- **Actually enable the `tls` profile** (see above) or put a tunnel like
  Tailscale/Cloudflare Tunnel in front instead — don't expose the default
  plain-HTTP setup beyond your own machine. This is the single biggest thing
  to not skip; everything else here assumes it's already true.
- **Set a strong, unique `SECRET_KEY`** in `backend/.env` — generate one with
  `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Never reuse
  a value from `.env.example` or another deployment.
- **Set a strong `FIRST_ADMIN_PASSWORD`** in `backend/.env` before first
  boot — there's no in-app "change my own password" yet, only the
  email-based forgot/reset flow, so this is effectively permanent until you
  use that flow.
- **Actually schedule `scripts/backup.sh`** (cron or Task Scheduler) and copy
  the `backups/` directory offsite periodically — a backup script that never
  runs isn't a backup.
