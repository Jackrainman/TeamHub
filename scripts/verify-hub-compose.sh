#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${TEAMHUB_COMPOSE_PROJECT:-teamhub-smoke}"
HOST_PORT="${TEAMHUB_HOST_PORT:-4177}"
KEEP_RUNNING="${TEAMHUB_KEEP_COMPOSE:-0}"
SMOKE_TOKEN="${TEAMHUB_WRITE_TOKEN:-change-me-before-exposing}"
BASE_URL="http://127.0.0.1:${HOST_PORT}"
EXPECTED_DB_PATH="/var/lib/teamhub/data/teamhub.sqlite"

# 本脚本会在退出时删除项目卷，只允许一次性 smoke project。Compose 卷名受 project name 隔离；
# 真项目、空 project name 或不带 smoke 的名字一律 fail-closed。
case "${PROJECT_NAME}" in
  *smoke*) ;;
  *)
    echo "拒绝运行：本脚本会 down --volumes，只能对名称含 smoke 的一次性项目执行。" >&2
    echo "当前 TEAMHUB_COMPOSE_PROJECT='${PROJECT_NAME}'；真实数据请使用 backup-teamhub-data.sh。" >&2
    exit 2
    ;;
esac

require_tool() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing required tool: $1" >&2; exit 127; }
}

compose() {
  docker compose --project-name "${PROJECT_NAME}" -f "${ROOT_DIR}/compose.yaml" "$@"
}

cleanup() {
  if [[ "${KEEP_RUNNING}" != "1" ]]; then
    # 只删除上方护栏确认过的一次性 smoke project；禁止复制到真实部署流程。
    compose down --volumes --remove-orphans
  fi
}

wait_for_health() {
  for _ in $(seq 1 60); do
    if node -e '
      fetch(process.argv[1] + "/health")
        .then(async (response) => {
          if (!response.ok) process.exit(1);
          const body = await response.json();
          if (body.status !== "ok" || typeof body.buildId !== "string" || !body.buildId) process.exit(1);
        })
        .catch(() => process.exit(1));
    ' "${BASE_URL}"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

assert_runtime_shape() {
  node -e '
    const [baseUrl, expectedPath] = process.argv.slice(1);
    Promise.all([
      fetch(baseUrl + "/health").then((response) => response.json()),
      fetch(baseUrl + "/api/system/status").then(async (response) => {
        if (!response.ok) throw new Error(`status HTTP ${response.status}`);
        return response.json();
      }),
    ]).then(([health, status]) => {
      if (health.status !== "ok" || !health.buildId || health.setupPending) throw new Error("normal health/buildId missing");
      const storage = status.deployment?.storage;
      const expectedDomains = ["baseline", "checklist", "gov", "inv", "kb", "reimburse"];
      if (!Array.isArray(storage) || storage.length !== expectedDomains.length) throw new Error("storage entry count != 6");
      const domains = storage.map((entry) => entry.domain).sort();
      if (JSON.stringify(domains) !== JSON.stringify(expectedDomains)) throw new Error(`storage domains mismatch: ${domains}`);
      if (!storage.every((entry) => entry.backend === "sqlite" && entry.path === expectedPath)) {
        throw new Error("six domains do not share the unified SQLite path");
      }
    }).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
  ' "${BASE_URL}" "${EXPECTED_DB_PATH}"
}

wait_for_runtime() {
  for _ in $(seq 1 60); do
    if assert_runtime_shape >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

require_tool docker
require_tool curl
require_tool node
docker compose version >/dev/null

trap cleanup EXIT
compose up -d --build hub

if ! wait_for_health; then
  echo "compose 服务未在期限内健康" >&2
  compose ps >&2
  compose logs --no-color hub >&2
  exit 1
fi

# 新 smoke 卷第一次进入 setup 模式；初始化写入临时 config 卷，容器按 exit 42 自动重启。
if node -e '
  fetch(process.argv[1] + "/health")
    .then((response) => response.json())
    .then((body) => process.exit(body.setupPending ? 0 : 1))
    .catch(() => process.exit(1));
' "${BASE_URL}"; then
  curl -fsS -X POST "${BASE_URL}/api/setup/init" \
    -H 'content-type: application/json' \
    -d '{"dataMode":"real","identityMode":"anonymous"}' >/dev/null
fi

if ! wait_for_runtime; then
  echo "正常模式未就绪，或 buildId/统一 SQLite 部署事实不符合预期" >&2
  compose ps >&2
  compose logs --no-color hub >&2
  exit 1
fi

TASK_ID="$(curl -fsS -X POST "${BASE_URL}/api/tasks" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer ${SMOKE_TOKEN}" \
  -d '{"projectId":"prj-robots","groupId":"grp-compose-smoke","title":"Compose SQLite persistence probe","rawSummary":"Compose SQLite persistence probe","ownerId":null,"collaboratorIds":[],"robotTarget":"R1","intrinsicComplexity":"normal"}' \
  | node -e '
      let raw = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { raw += chunk; });
      process.stdin.on("end", () => {
        const id = JSON.parse(raw).task?.id;
        if (typeof id !== "string" || !id) process.exit(1);
        process.stdout.write(id);
      });
    ')"

compose restart hub >/dev/null
if ! wait_for_runtime; then
  echo "重启后正常模式未就绪" >&2
  compose logs --no-color hub >&2
  exit 1
fi

node -e '
  const [baseUrl, taskId] = process.argv.slice(1);
  fetch(baseUrl + "/api/tasks")
    .then(async (response) => {
      if (!response.ok) throw new Error(`tasks HTTP ${response.status}`);
      return response.json();
    })
    .then((body) => {
      if (!body.tasks?.some((task) => task.id === taskId)) throw new Error("probe task missing after restart");
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
' "${BASE_URL}" "${TASK_ID}"

curl -fsS "${BASE_URL}/" | grep -q '<div id="root"></div>'
echo "TeamHub compose smoke passed：buildId + 六域统一 SQLite + 写入/重启/读回（${BASE_URL}）"
