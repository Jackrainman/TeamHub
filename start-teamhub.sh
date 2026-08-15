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
#   TEAMHUB_DB_FILE       六个结构化数据域的唯一 SQLite 文件（默认 ~/teamhub-data/teamhub.sqlite）。
#   TEAMHUB_ARTIFACT_FILES_DIR  归档物（图纸）文件落盘目录（默认 ~/teamhub-data/artifacts，重启不丢）。
#                         漏设则上传/下载端点恒 404「未配置归档物文件目录」。字节不进 git（D-025）、只在此卷。
#   TEAMHUB_WRITE_TOKEN   写端点鉴权密钥（AUDIT H3）。绑非 loopback（0.0.0.0）时必填，未填则本脚本自动生成并打印；
#                         写端点 POST /api/* 须带 `Authorization: Bearer <token>`，读端点不受影响。
#   TEAMHUB_TRUST_PROXY   反代信任（默认 false）。反代 / SSH 隧道部署后面**必须**设 true，否则写端点
#                         限流塌成全队共用一个桶（任一客户端可耗尽、DoS 全队写入，见 server.ts）；
#                         直连暴露（无反代）保持 false（否则 X-Forwarded-For 可伪造）。本脚本原样
#                         透传给 node 进程（不额外处理），设置方式同其余变量：前缀赋值后跑本脚本。
#   TEAMHUB_SKIP_BUILD=1  跳过构建（只重启时用）
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONSOLE_DIR="${ROOT_DIR}/apps/hub-console"
SERVER_DIR="${ROOT_DIR}/apps/hub-server"

HUB_HOST="${HUB_HOST:-127.0.0.1}"
HUB_PORT="${HUB_PORT:-4177}"
TEAMHUB_DB_FILE="${TEAMHUB_DB_FILE:-${HOME}/teamhub-data/teamhub.sqlite}"
TEAMHUB_ARTIFACT_FILES_DIR="${TEAMHUB_ARTIFACT_FILES_DIR:-${HOME}/teamhub-data/artifacts}"
TEAMHUB_WRITE_TOKEN="${TEAMHUB_WRITE_TOKEN:-}"
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

# npm workspace 依赖统一安装在仓库根目录；禁止在子包各自维护 node_modules/lock。
if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
  echo "缺少依赖：先在仓库根目录跑 npm ci" >&2
  exit 1
fi

# 唯一数据库与 artifact 两个持久化落点就位。
mkdir -p "$(dirname "${TEAMHUB_DB_FILE}")" "${TEAMHUB_ARTIFACT_FILES_DIR}"

if [[ "${SKIP_BUILD}" != "1" ]]; then
  echo "构建 TeamHub workspaces（contracts → console → server）…"
  npm --prefix "${ROOT_DIR}" run build
fi

# console 静态产物交给 server 单端口托管
export TEAMHUB_CONSOLE_DIST_DIR="${CONSOLE_DIR}/dist"
export TEAMHUB_DB_FILE TEAMHUB_ARTIFACT_FILES_DIR HUB_HOST HUB_PORT TEAMHUB_WRITE_TOKEN TEAMHUB_BUILD_ID

echo "──────────────────────────────────────────────"
echo " Team Hub v${TEAMHUB_VERSION} 启动 → http://${HUB_HOST}:${HUB_PORT}  (console + API 同端口)"
echo " 统一 SQLite：${TEAMHUB_DB_FILE}（六域共库，node:sqlite，重启不丢）"
echo " 归档物目录：${TEAMHUB_ARTIFACT_FILES_DIR}（图纸文件上传下载，重启不丢）"
echo " 版本：v${TEAMHUB_VERSION}（/api/system/status.version 同源）　构建戳：${TEAMHUB_BUILD_ID}（/health.buildId）"
echo " 产品设置：SQLite app_settings（未初始化时打开浏览器完成向导）"
if [[ "${HUB_HOST}" != "127.0.0.1" && "${HUB_HOST}" != "localhost" && "${HUB_HOST}" != "::1" ]]; then
  echo " 已绑 ${HUB_HOST}：写端点 POST /api/* 须带 Authorization: Bearer <token>（读端点不限）。"
  if [[ "${AUTO_TOKEN:-0}" == "1" ]]; then
    echo "   ⚠ 自动生成的写鉴权 token（仅本进程，重启会变；要固定就预设 TEAMHUB_WRITE_TOKEN）："
    echo "   TEAMHUB_WRITE_TOKEN=${TEAMHUB_WRITE_TOKEN}"
  fi
fi
echo "──────────────────────────────────────────────"

# SETUP-WIZARD 刀①：自动重启循环。约定 exit code 42 = 请求重启（向导 / 设置页更新
# SQLite app_settings 后由新进程重读）。非 42（含正常崩溃）原样退出——不引入「崩了就无限拉起」的新行为。
# 用 if 承接退出码，避免 set -e 在 node 非零退出时先中止（拿不到 $? 就重启不了）。
while :; do
  if node "${SERVER_DIR}/dist/main.js"; then
    code=0
  else
    code=$?
  fi
  if [[ "${code}" -eq 42 ]]; then
    echo "配置已更新，自动重启…"
    continue
  fi
  exit "${code}"
done
