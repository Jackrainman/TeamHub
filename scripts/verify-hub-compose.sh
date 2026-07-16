#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${TEAMHUB_COMPOSE_PROJECT:-teamhub-smoke}"
HOST_PORT="${TEAMHUB_HOST_PORT:-4177}"
KEEP_RUNNING="${TEAMHUB_KEEP_COMPOSE:-0}"

# 抹卷护栏（feiyue 铁律 #6「绝不删数据卷」）：下方 cleanup 会 `down --volumes` 抹掉
# hub_kb/hub_gov/hub_artifacts。故**只允许**对一次性 smoke 项目运行——PROJECT_NAME 必须含 "smoke"，
# 否则硬拒，杜绝误把 TEAMHUB_COMPOSE_PROJECT 指到真项目（如 teamhub）一把抹光真实语料 + PM 录入。
case "${PROJECT_NAME}" in
  *smoke*) ;;
  *)
    echo "拒绝运行：本 smoke 脚本会 'down --volumes' 抹卷，只能对 *smoke* 项目跑。" >&2
    echo "当前 TEAMHUB_COMPOSE_PROJECT='${PROJECT_NAME}' 不含 'smoke'。真要 smoke 请用默认或带 'smoke' 的项目名；" >&2
    echo "要备份真实数据用 scripts/backup-teamhub-data.sh。" >&2
    exit 2
    ;;
esac

require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required tool: $1" >&2
    exit 127
  fi
}

cleanup() {
  if [[ "${KEEP_RUNNING}" != "1" ]]; then
    # 仅 smoke：--volumes 抹掉一次性 smoke 项目的卷（上方护栏已确保 PROJECT_NAME 含 'smoke'）。
    # 切勿把这一行复制到操作真项目的脚本里——会抹光 hub_kb/hub_gov 真实数据。
    docker compose --project-name "${PROJECT_NAME}" -f "${ROOT_DIR}/compose.yaml" down --volumes --remove-orphans
  fi
}

require_tool docker
require_tool curl
docker compose version >/dev/null

trap cleanup EXIT

docker compose --project-name "${PROJECT_NAME}" -f "${ROOT_DIR}/compose.yaml" up -d --build hub

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
docker compose --project-name "${PROJECT_NAME}" -f "${ROOT_DIR}/compose.yaml" logs --no-color hub >&2
exit 1
