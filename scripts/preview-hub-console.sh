#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONSOLE_DIR="${ROOT_DIR}/apps/hub-console"

HOST="${TEAMHUB_CONSOLE_HOST:-127.0.0.1}"
PORT="${TEAMHUB_CONSOLE_PORT:-5174}"
API_BASE="${TEAMHUB_API_BASE:-${VITE_API_BASE:-}}"
SKIP_BUILD="${TEAMHUB_CONSOLE_SKIP_BUILD:-0}"

require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required tool: $1" >&2
    exit 127
  fi
}

require_tool npm

cd "${ROOT_DIR}"

if [[ ! -d node_modules ]]; then
  echo "missing dependencies: run 'npm ci' at the repository root first" >&2
  exit 1
fi

if [[ -n "${API_BASE}" ]]; then
  export VITE_API_BASE="${API_BASE}"
  echo "Team Hub console preview: real API ${VITE_API_BASE}"
else
  unset VITE_API_BASE
  echo "Team Hub console preview: mock data"
fi

if [[ "${SKIP_BUILD}" != "1" ]]; then
  npm run build --workspace @teamhub/hub-console
fi

exec npm run preview --workspace @teamhub/hub-console -- --host "${HOST}" --port "${PORT}" --strictPort
