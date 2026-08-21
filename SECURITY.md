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

## Deployment Security Checklist

Since you run this yourself, some of your security posture depends on your
deployment, not just the code. Before exposing an instance beyond
`localhost`:

- **Put it behind TLS.** The bundled `docker-compose.yml`/`nginx.conf` serve
  plain HTTP. Terminate TLS in front of it (a reverse proxy like Caddy or
  nginx + Let's Encrypt, or a tunnel like Tailscale/Cloudflare Tunnel) before
  any credentials or research data cross a network you don't control.
- **Set a strong, unique `SECRET_KEY`** in `backend/.env` — generate one with
  `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Never reuse
  a value from `.env.example` or another deployment.
- **Change the seeded admin password immediately** after first login.
- **Don't expose Postgres or Redis ports** beyond the Docker network — the
  `docker-compose.yml` maps them to the host for local development
  convenience; remove those port mappings in any deployment reachable from
  outside your machine.
- **Back up regularly.** The Postgres volume and `storage/` directory are the
  entire product — there's no built-in backup mechanism yet.
