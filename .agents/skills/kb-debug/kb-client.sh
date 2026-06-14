#!/usr/bin/env sh
# kb-client.sh — TeamHub 战队知识库闭环 skill 的瘦客户端（查相似 / 推结案）。
#
# 单一真相在服务器：本脚本**不写任何本地归档文件**，只 curl TeamHub hub-server 的 /api/kb/*。
# curl 是 CLI → 服务器，无 CORS 问题。
#
# 配置（环境变量）：
#   KB_BASE_URL   hub-server 地址。默认 Tailscale；LAN teamhub.local 部署好后改这一处。
#   KB_MIN_SCORE  相似检索最低分（可选；默认走服务器默认 4，越低越宽松）。
#
# 用法：
#   kb-client.sh ping
#   kb-client.sh similar "<症状>" "[标签,逗号分隔]"
#   kb-client.sh closeout <payload.json>
set -eu

KB_BASE_URL="${KB_BASE_URL:-http://100.78.202.84:4177}"

die() { echo "kb-client: $*" >&2; exit 2; }
command -v curl >/dev/null 2>&1 || die "需要 curl"

cmd="${1:-}"
case "$cmd" in
  ping)
    curl -fsS --max-time 8 "$KB_BASE_URL/health" \
      || die "连不上 $KB_BASE_URL（检查 KB_BASE_URL / 网络 / Tailscale）"
    echo
    ;;
  similar)
    [ "$#" -ge 2 ] || die "用法: kb-client.sh similar \"<症状>\" \"[标签,逗号]\""
    symptom="$2"
    tags="${3:-}"
    set -- --get "$KB_BASE_URL/api/kb/similar" --data-urlencode "symptom=$symptom"
    [ -n "$tags" ] && set -- "$@" --data-urlencode "tags=$tags"
    [ -n "${KB_MIN_SCORE:-}" ] && set -- "$@" --data-urlencode "minScore=$KB_MIN_SCORE"
    curl -fsS --max-time 15 "$@" \
      || die "相似检索失败（KB_BASE_URL=$KB_BASE_URL）"
    echo
    ;;
  closeout)
    [ "$#" -ge 2 ] || die "用法: kb-client.sh closeout <payload.json>"
    file="$2"
    [ -f "$file" ] || die "找不到 payload 文件: $file"
    curl -fsS --max-time 20 -X POST "$KB_BASE_URL/api/kb/closeout" \
      -H 'Content-Type: application/json' --data-binary "@$file" \
      || die "结案上传失败（422=缺 rootCause/resolution 或卡已归档；400=body 不合法）"
    echo
    ;;
  *)
    die "未知子命令: ${cmd:-（空）}；用 ping | similar | closeout"
    ;;
esac
