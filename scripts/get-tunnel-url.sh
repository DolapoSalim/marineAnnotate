#!/bin/sh
# Prints the current quick-tunnel address (only relevant when the
# cloudflared service is running WITHOUT TUNNEL_TOKEN set — a named tunnel
# uses your own domain, which you already know). The address is generated
# fresh by Cloudflare on each `cloudflared` start and only ever appears in
# its logs, not anywhere queryable — this just greps it out for you.
set -eu

cd "$(dirname "$0")/.."

URL="$(docker compose logs cloudflared 2>/dev/null | grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' | tail -1)"

if [ -z "$URL" ]; then
  echo "No tunnel URL found yet. Is it running? Try: docker compose --profile tunnel up -d" >&2
  exit 1
fi

echo "$URL"
echo
echo "Next: set APP_URL=$URL in backend/.env, then:" >&2
echo "  docker compose up -d --force-recreate backend" >&2
