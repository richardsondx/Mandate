#!/bin/sh
# Mandate dev launcher — one command from a fresh clone.
# Builds what is missing, starts the daemon, opens the dashboard.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# --- Rust daemon + CLI (release) ---
if [ ! -x "$ROOT/target/release/mandated" ] || [ ! -x "$ROOT/target/release/mandate" ]; then
  echo "› Building mandated + mandate (first run can take a few minutes)…"
  cargo build --release -p mandated -p mandate
fi

# --- Dashboard assets ---
if [ ! -f "$ROOT/web/dist/index.html" ]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "› pnpm not found. Run ./scripts/bootstrap-macos.sh first." >&2
    exit 1
  fi
  echo "› Installing dependencies and building dashboard…"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm --dir web build
fi

export MANDATE_WEB_DIR="$ROOT/web/dist"
if [ -d "$ROOT/providers/coinbase-cdp-wallet/dist" ]; then
  export MANDATE_PROVIDERS_DIR="$ROOT/providers"
fi

URL="http://127.0.0.1:7741/"
if curl -sf "$URL" >/dev/null 2>&1; then
  echo "› Daemon already running. Opening dashboard."
  open "$URL"
  exit 0
fi

echo "› Starting mandated on 127.0.0.1:7741 …"
echo "  Dashboard: $URL"
echo "  Quit this process to stop the daemon."
( sleep 1; open "$URL" ) 2>/dev/null &
exec "$ROOT/target/release/mandated"
