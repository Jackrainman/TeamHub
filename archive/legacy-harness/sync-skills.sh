#!/usr/bin/env bash
# PostToolUse hook: 把 .agents/skills/<rel> 镜像复制到 .claude/skills/<rel>
#
# 触发场景:Claude Code 通过 Edit / Write 工具命中 .agents/skills/** 子树时,
# Claude Code harness 在 sandbox 外调用本脚本,绕过 sandbox 对 .claude/skills 的
# write deny,把权威源镜像到 Claude Code 实际读取的目录。
#
# stdin: Claude Code hook 协议 JSON,含 tool_input.file_path
# 失败策略:静默不阻断 tool 调用,把错误追加到 sync-skills.log
set -u

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
LOG="$ROOT/.agents/hooks/sync-skills.log"

# 读 stdin payload
PAYLOAD=$(cat)

# 取 file_path;jq 缺失时退到一个粗糙的 grep
if command -v jq >/dev/null 2>&1; then
  FP=$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.file_path // empty')
else
  FP=$(printf '%s' "$PAYLOAD" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')
fi

# 不在 .agents/skills/ 子树就直接退出
case "$FP" in
  "$ROOT/.agents/skills/"*) ;;
  *) exit 0 ;;
esac

REL="${FP#$ROOT/.agents/skills/}"
DST="$ROOT/.claude/skills/$REL"

if [ ! -e "$FP" ]; then
  # 源被删了,无需镜像;删除场景需要人工同步,见 AGENTS.md
  exit 0
fi

if mkdir -p "$(dirname "$DST")" && cp -p "$FP" "$DST"; then
  exit 0
else
  echo "[$(date -Iseconds)] sync failed: $FP -> $DST" >> "$LOG" 2>/dev/null
  exit 0
fi
