#!/bin/zsh
set -euo pipefail

if [[ "${1:-}" != "--confirm-reset" ]]; then
  echo "This creates a recoverable backup, then resets the local Mandate database."
  echo "Run: ./scripts/reset-local-instance.sh --confirm-reset"
  exit 2
fi

mandate_data_dir="${MANDATE_DATA_DIR:-${HOME}/Library/Application Support/Mandate}"
backup_root="${HOME}/Library/Application Support/Mandate Backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${backup_root}/${timestamp}"

if [[ ! -d "${mandate_data_dir}" ]]; then
  echo "No local Mandate instance exists at ${mandate_data_dir}."
  exit 0
fi

mkdir -p "${backup_root}" "${backup_dir}"
daemon_pid="$(lsof -nP -tiTCP:7741 -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "${daemon_pid}" ]]; then
  daemon_command="$(ps -p "${daemon_pid}" -o command= 2>/dev/null || true)"
  if [[ "${daemon_command}" != *mandated* ]]; then
    echo "Port 7741 is owned by an unexpected process; stop it manually before resetting."
    exit 1
  fi
  kill "${daemon_pid}"
  wait "${daemon_pid}" 2>/dev/null || true
fi

mv "${mandate_data_dir}" "${backup_dir}/Mandate"
mkdir -p "${mandate_data_dir}"
chmod 700 "${mandate_data_dir}"
security delete-generic-password -s com.mandate.admin -a "${USER}" >/dev/null 2>&1 || true

echo "Mandate was reset to an uninitialized local instance."
echo "Recoverable backup: ${backup_dir}/Mandate"
echo "The database encryption key remains in Keychain so this backup can still be restored."
echo "Start with: cargo run -p mandated"
