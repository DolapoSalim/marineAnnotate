#!/bin/sh
# Combines the three manual steps needed after every restart of the quick
# Cloudflare Tunnel (docker compose --profile tunnel): the address is
# regenerated on each start and only ever appears in the container's logs.
# Run this once after starting/restarting the tunnel, instead of fetching
# the URL, editing backend/.env, and recreating backend by hand.
#
# Not needed at all with the stable named tunnel (--profile tunnel-named)
# — that address never changes.
set -eu

cd "$(dirname "$0")/.."

URL="$(docker compose logs cloudflared 2>/dev/null | grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' | tail -1)"

if [ -z "$URL" ]; then
  echo "No tunnel URL found. Is it running? Try: docker compose --profile tunnel up -d" >&2
  exit 1
fi

echo "Tunnel address: $URL"

ENV_FILE="backend/.env"
if grep -q "^APP_URL=" "$ENV_FILE"; then
  # Write to a temp file then move — portable across sed variants (macOS/BSD
  # sed needs `-i ''`, GNU sed needs bare `-i`; this sidesteps the difference).
  sed "s|^APP_URL=.*|APP_URL=$URL|" "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
else
  echo "APP_URL=$URL" >> "$ENV_FILE"
fi
echo "Updated APP_URL in $ENV_FILE"

docker compose up -d --force-recreate backend
echo "Done — invite links will now use: $URL"
