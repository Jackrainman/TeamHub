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
#   TEAMHUB_SKIP_BUILD=1  跳过构建（只重启时用）
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONSOLE_DIR="${ROOT_DIR}/apps/hub-console"
SERVER_DIR="${ROOT_DIR}/apps/hub-server"

HUB_HOST="${HUB_HOST:-127.0.0.1}"
HUB_PORT="${HUB_PORT:-4177}"
TEAMHUB_KB_DATA_FILE="${TEAMHUB_KB_DATA_FILE:-${HOME}/teamhub-data/kb.json}"
SKIP_BUILD="${TEAMHUB_SKIP_BUILD:-0}"

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

# 语料目录就位（落盘文件，server 启动即读、/api/kb/similar 可召回）
mkdir -p "$(dirname "${TEAMHUB_KB_DATA_FILE}")"

if [[ "${SKIP_BUILD}" != "1" ]]; then
  echo "[1/2] 构建 console（产出静态站 dist/）…"
  npm --prefix "${CONSOLE_DIR}" run build
  echo "[2/2] 构建 server…"
  npm --prefix "${SERVER_DIR}" run build
fi

# console 静态产物交给 server 单端口托管
export TEAMHUB_CONSOLE_DIST_DIR="${CONSOLE_DIR}/dist"
export TEAMHUB_KB_DATA_FILE HUB_HOST HUB_PORT

echo "──────────────────────────────────────────────"
echo " Team Hub 启动 → http://${HUB_HOST}:${HUB_PORT}  (console + API 同端口)"
echo " 语料文件：${TEAMHUB_KB_DATA_FILE}"
if [[ "${HUB_HOST}" == "0.0.0.0" ]]; then
  echo " ⚠ 已绑 0.0.0.0：写端点当前零鉴权（AUDIT H3），仅限可信内网/Tailscale"
fi
echo "──────────────────────────────────────────────"

exec node "${SERVER_DIR}/dist/main.js"
