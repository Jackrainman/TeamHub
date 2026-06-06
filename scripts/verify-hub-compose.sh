#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${TEAMHUB_COMPOSE_PROJECT:-teamhub-smoke}"
HOST_PORT="${TEAMHUB_HOST_PORT:-4177}"
KEEP_RUNNING="${TEAMHUB_KEEP_COMPOSE:-0}"

require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required tool: $1" >&2
    exit 127
  fi
}

cleanup() {
  if [[ "${KEEP_RUNNING}" != "1" ]]; then
    docker compose --project-name "${PROJECT_NAME}" -f "${ROOT_DIR}/compose.yaml" down --volumes --remove-orphans
  fi
}

require_tool docker
require_tool curl
docker compose version >/dev/null

trap cleanup EXIT

docker compose --project-name "${PROJECT_NAME}" -f "${ROOT_DIR}/compose.yaml" up -d --build hub postgres

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${HOST_PORT}/health" | grep -q '"status":"ok"'; then
    curl -fsS "http://127.0.0.1:${HOST_PORT}/api/system/status" >/dev/null
    curl -fsS "http://127.0.0.1:${HOST_PORT}/" | grep -q '<div id="root"></div>'
    echo "Team Hub compose smoke passed on http://127.0.0.1:${HOST_PORT}"
    exit 0
  fi
  sleep 2
done

docker compose --project-name "${PROJECT_NAME}" -f "${ROOT_DIR}/compose.yaml" ps >&2
docker compose --project-name "${PROJECT_NAME}" -f "${ROOT_DIR}/compose.yaml" logs --no-color hub postgres >&2
exit 1
