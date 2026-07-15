#!/usr/bin/env bash
#
# TeamHub 一键启动：hub-server 单端口同时托管 console 静态站 + API。
#
# 用法：
#   ./start-teamhub.sh                              # 构建 console+server 后前台启动
#   TEAMHUB_SKIP_BUILD=1 ./start-teamhub.sh         # 已构建过、只重启
#   HUB_HOST=0.0.0.0 ./start-teamhub.sh             # 暴露到内网/Tailscale 演示
#   nohup ./start-teamhub.sh >teamhub.log 2>&1 &    # 后台常驻
#
# 可调环境变量：
#   HUB_HOST              监听地址（默认 127.0.0.1；内网演示用 0.0.0.0）
#   HUB_PORT              端口（默认 4177）
#   TEAMHUB_KB_DATA_FILE  知识库语料落盘文件（默认 ~/teamhub-data/kb.json，重启不丢、closeout 累积）
#   TEAMHUB_GOV_DATA_FILE 治理快照落盘文件（默认 ~/teamhub-data/gov.json，重启不丢；PM 任务/依赖/图纸提交日志/
#                         结案知识节点）。**漏设则 main.ts 回落 InMemoryGovStore、每次重启清回演示 fixture**——
#                         D-061 治理落盘在真实启动路径上失效。本脚本默认接好，与 KB 落盘同纪律。
#   TEAMHUB_GOV_BACKEND   治理后端（SS3 SQLite 增量迁移）。**默认空 = JSON（现状零变化，走 TEAMHUB_GOV_DATA_FILE）**；
#                         设 sqlite → 走 SqliteGovStore（node24 内置 node:sqlite，零原生依赖），须同时设
#                         TEAMHUB_GOV_SQLITE_FILE。迁移既有 gov.json：scripts/migrate-gov-to-sqlite.mjs。
#   TEAMHUB_GOV_SQLITE_FILE  SQLite 库文件（仅 TEAMHUB_GOV_BACKEND=sqlite 时生效，默认 ~/teamhub-data/gov.sqlite）。
#                         库不存在按 demoSeed 落种子；已迁移/既有库原样打开（schema 版本过高即 fail-closed 拒开）。
#   TEAMHUB_ARTIFACT_FILES_DIR  归档物（图纸）文件落盘目录（默认 ~/teamhub-data/artifacts，重启不丢）。
#                         漏设则上传/下载端点恒 404「未配置归档物文件目录」。字节不进 git（D-025）、只在此卷。
#   TEAMHUB_INV_DATA_FILE 库存/BOM 落盘文件（默认 ~/teamhub-data/inventory.json，重启不丢；盘点/拆装/
#                         一句话快记累积）。漏设则 main.ts 回落 InMemoryInvStore、每次重启清回演示 fixture。
#                         本脚本默认接好，与 KB/Gov 落盘同纪律。
#   TEAMHUB_BASELINE_DATA_FILE  倒排基准线落盘文件（默认 ~/teamhub-data/baseline.json，重启不丢；队长
#                         手写覆盖/验证门过门留痕累积）。独立文件、不进 TEAMHUB_GOV_DATA_FILE（红线3：
#                         基准线本体不塞 GovernanceSnapshot）。漏设则 main.ts 回落 InMemoryBaselineStore、
#                         每次重启清空。本脚本默认接好，与 KB/Gov/Inv 落盘同纪律。
#   TEAMHUB_CHECKLIST_DATA_FILE  门检查单/欠条落盘文件（默认 ~/teamhub-data/checklist.json，重启不丢；现场
#                         快记欠条/清偿/豁免留痕累积，GATE-CHECKLIST-IOU D-087）。独立文件、不进
#                         TEAMHUB_GOV_DATA_FILE（轻量域不塞 GovernanceSnapshot，照 baseline.json 先例）。
#                         漏设则 main.ts 回落 InMemoryChecklistStore、每次重启清空。本脚本默认接好。
#   TEAMHUB_WRITE_TOKEN   写端点鉴权密钥（AUDIT H3）。绑非 loopback（0.0.0.0）时必填，未填则本脚本自动生成并打印；
#                         写端点 POST /api/* 须带 `Authorization: Bearer <token>`，读端点不受影响。
#   TEAMHUB_IDENTITY_MODE 轻身份登录模式（IDENTITY-LITE，D-083 §4.2）。缺省 anonymous = 现状零变化
#                         （身份模块不启用、共享写口令）。设 identity → 匿名可读一切 + 登录才能写：session
#                         端点启用（POST /api/session 选人+可选 PIN），写路由须携有效会话（httpOnly cookie）、
#                         actor 服务端注入。会话存内存、重启全员重登（家庭影院级）。身份模式下非 loopback
#                         暴露即便无 TEAMHUB_WRITE_TOKEN 也放行（写由会话把关）。
#   TEAMHUB_SKIP_BUILD=1  跳过构建（只重启时用）
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONSOLE_DIR="${ROOT_DIR}/apps/hub-console"
SERVER_DIR="${ROOT_DIR}/apps/hub-server"

HUB_HOST="${HUB_HOST:-127.0.0.1}"
HUB_PORT="${HUB_PORT:-4177}"
TEAMHUB_KB_DATA_FILE="${TEAMHUB_KB_DATA_FILE:-${HOME}/teamhub-data/kb.json}"
TEAMHUB_GOV_DATA_FILE="${TEAMHUB_GOV_DATA_FILE:-${HOME}/teamhub-data/gov.json}"
# SS3 SQLite（增量迁移）：默认空 = JSON 现状零变化；设 sqlite 才切 SqliteGovStore（须配 TEAMHUB_GOV_SQLITE_FILE）。
TEAMHUB_GOV_BACKEND="${TEAMHUB_GOV_BACKEND:-}"
TEAMHUB_GOV_SQLITE_FILE="${TEAMHUB_GOV_SQLITE_FILE:-${HOME}/teamhub-data/gov.sqlite}"
TEAMHUB_INV_DATA_FILE="${TEAMHUB_INV_DATA_FILE:-${HOME}/teamhub-data/inventory.json}"
TEAMHUB_BASELINE_DATA_FILE="${TEAMHUB_BASELINE_DATA_FILE:-${HOME}/teamhub-data/baseline.json}"
TEAMHUB_CHECKLIST_DATA_FILE="${TEAMHUB_CHECKLIST_DATA_FILE:-${HOME}/teamhub-data/checklist.json}"
TEAMHUB_ARTIFACT_FILES_DIR="${TEAMHUB_ARTIFACT_FILES_DIR:-${HOME}/teamhub-data/artifacts}"
TEAMHUB_WRITE_TOKEN="${TEAMHUB_WRITE_TOKEN:-}"
# IDENTITY-LITE（D-083 §4.2）：缺省 anonymous = 现状零变化；设 identity 启用轻身份登录（见文件头注释）。
TEAMHUB_IDENTITY_MODE="${TEAMHUB_IDENTITY_MODE:-anonymous}"
# 活体戳：注入 git short SHA 进 /health.buildId，重启后一行 curl 即知在服哪个构建（feiyue ?v= 校验等价）。
TEAMHUB_BUILD_ID="${TEAMHUB_BUILD_ID:-$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || echo nogit)}"
# 产品版本号（D-074 单一真相 = 根 VERSION，bump-version.sh 同步进三包 package.json）。
# 每次启动现读当前值并在 banner 显示——与 /api/system/status.version（status.ts 读 package.json）同源、人眼一致核对。
TEAMHUB_VERSION="$(cat "${ROOT_DIR}/VERSION" 2>/dev/null || echo unknown)"
SKIP_BUILD="${TEAMHUB_SKIP_BUILD:-0}"

# AUDIT H3：绑非 loopback 暴露写端点必须配 token，否则 server 拒启动。未配则自动生成并打印（演示便利 + 安全）。
case "${HUB_HOST}" in
  127.0.0.1 | localhost | ::1) ;;
  *)
    if [[ -z "${TEAMHUB_WRITE_TOKEN}" ]]; then
      TEAMHUB_WRITE_TOKEN="$(openssl rand -hex 16 2>/dev/null \
        || node -e 'process.stdout.write(require("crypto").randomBytes(16).toString("hex"))')"
      AUTO_TOKEN=1
    fi
    ;;
esac

require_tool() {
  command -v "$1" >/dev/null 2>&1 || { echo "缺少必需工具：$1" >&2; exit 127; }
}
require_tool node
require_tool npm

# 非 npm workspaces：console / server 各自 node_modules，缺则提示安装
for dir in "${CONSOLE_DIR}" "${SERVER_DIR}"; do
  if [[ ! -d "${dir}/node_modules" ]]; then
    echo "缺少依赖：先在 ${dir#"${ROOT_DIR}/"} 跑 npm install" >&2
    exit 1
  fi
done

# 语料 / 治理 / 库存 / 基准线 / 归档物落盘目录就位（server 启动即读：KB 召回 + PM 录入 + 库存盘点 +
# 倒排基准线 + 图纸文件上传下载，重启不丢）
mkdir -p "$(dirname "${TEAMHUB_KB_DATA_FILE}")" "$(dirname "${TEAMHUB_GOV_DATA_FILE}")" "$(dirname "${TEAMHUB_GOV_SQLITE_FILE}")" "$(dirname "${TEAMHUB_INV_DATA_FILE}")" "$(dirname "${TEAMHUB_BASELINE_DATA_FILE}")" "$(dirname "${TEAMHUB_CHECKLIST_DATA_FILE}")" "${TEAMHUB_ARTIFACT_FILES_DIR}"

if [[ "${SKIP_BUILD}" != "1" ]]; then
  echo "[1/2] 构建 console（产出静态站 dist/）…"
  npm --prefix "${CONSOLE_DIR}" run build
  echo "[2/2] 构建 server…"
  npm --prefix "${SERVER_DIR}" run build
fi

# console 静态产物交给 server 单端口托管
export TEAMHUB_CONSOLE_DIST_DIR="${CONSOLE_DIR}/dist"
export TEAMHUB_KB_DATA_FILE TEAMHUB_GOV_DATA_FILE TEAMHUB_INV_DATA_FILE TEAMHUB_BASELINE_DATA_FILE TEAMHUB_CHECKLIST_DATA_FILE TEAMHUB_ARTIFACT_FILES_DIR HUB_HOST HUB_PORT TEAMHUB_WRITE_TOKEN TEAMHUB_BUILD_ID TEAMHUB_IDENTITY_MODE TEAMHUB_GOV_BACKEND TEAMHUB_GOV_SQLITE_FILE

echo "──────────────────────────────────────────────"
echo " Team Hub v${TEAMHUB_VERSION} 启动 → http://${HUB_HOST}:${HUB_PORT}  (console + API 同端口)"
echo " 语料文件：${TEAMHUB_KB_DATA_FILE}"
if [[ "${TEAMHUB_GOV_BACKEND}" == "sqlite" ]]; then
  echo " 治理后端：SQLite → ${TEAMHUB_GOV_SQLITE_FILE}（node:sqlite，PM/图纸/结案重启不丢）"
else
  echo " 治理文件：${TEAMHUB_GOV_DATA_FILE}（PM/图纸/结案重启不丢；JSON 后端，默认）"
fi
echo " 库存文件：${TEAMHUB_INV_DATA_FILE}（盘点/拆装/快记重启不丢）"
echo " 基准线文件：${TEAMHUB_BASELINE_DATA_FILE}（队长手写覆盖/验证门过门重启不丢）"
echo " 检查单文件：${TEAMHUB_CHECKLIST_DATA_FILE}（现场快记欠条/清偿/豁免重启不丢）"
echo " 归档物目录：${TEAMHUB_ARTIFACT_FILES_DIR}（图纸文件上传下载，重启不丢）"
echo " 版本：v${TEAMHUB_VERSION}（/api/system/status.version 同源）　构建戳：${TEAMHUB_BUILD_ID}（/health.buildId）"
echo " 身份模式：${TEAMHUB_IDENTITY_MODE}（anonymous=现状零变化；identity=匿名可读+登录才写，GET /api/session 探测）"
if [[ "${HUB_HOST}" != "127.0.0.1" && "${HUB_HOST}" != "localhost" && "${HUB_HOST}" != "::1" ]]; then
  echo " 已绑 ${HUB_HOST}：写端点 POST /api/* 须带 Authorization: Bearer <token>（读端点不限）。"
  if [[ "${AUTO_TOKEN:-0}" == "1" ]]; then
    echo "   ⚠ 自动生成的写鉴权 token（仅本进程，重启会变；要固定就预设 TEAMHUB_WRITE_TOKEN）："
    echo "   TEAMHUB_WRITE_TOKEN=${TEAMHUB_WRITE_TOKEN}"
  fi
fi
echo "──────────────────────────────────────────────"

exec node "${SERVER_DIR}/dist/main.js"
