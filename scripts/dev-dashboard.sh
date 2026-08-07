#!/bin/sh
# Dev dashboard: run the mandated daemon (:7741) and the Vite dev server (:5173) together.
# Vite proxies /v1 to the daemon, so open http://127.0.0.1:5173/ for hot-reloading frontend work.
# Ctrl-C stops both and all of their child processes (cargo, mandated, vite, esbuild).

set -eu
set -m   # job control: each background job gets its own process group we can kill wholesale.

pids=""
cleanup() {
  for pid in $pids; do
    # Negative PID kills the whole process group of that job (cargo -> mandated, pnpm -> vite -> esbuild).
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  for pid in $pids; do wait "$pid" 2>/dev/null || true; done
  pids=""
}
trap 'cleanup; exit 130' INT
trap 'cleanup' EXIT TERM HUP

printf '\n  Mandate dev dashboard\n  - daemon : http://127.0.0.1:7741  (API + static fallback)\n  - vite   : http://127.0.0.1:5173  (HMR, proxies /v1 -> daemon)\n  Open http://127.0.0.1:5173/. Run `cargo run -p mandate -- dashboard` for an authenticated session.\n\n'

# Daemon first so the Vite proxy target exists before the browser loads.
cargo run -p mandated &
pids="$pids $!"

pnpm --dir web dev &
pids="$pids $!"

wait
