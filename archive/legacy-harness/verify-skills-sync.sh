#!/usr/bin/env bash
# 漂移哨兵:对比 .agents/skills/ 与 .claude/skills/,内容不一致时 exit 非零
#
# 期望情景:hook 一直成功跑过 → diff 输出为空、exit 0
# 失败情景:hook 静默挂、用户绕过 hook 直接编辑某一边、文件被删而镜像未删
#
# 用法:.agents/scripts/verify-skills-sync.sh
# 集成:作为 verify:skills-sync npm script 挂入 verify:all
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/.agents/skills"
DST="$ROOT/.claude/skills"

if [ ! -d "$SRC" ]; then
  echo "FATAL: skills source missing at $SRC" >&2
  exit 2
fi

if [ ! -d "$DST" ]; then
  echo "FATAL: skills mirror missing at $DST (run: cp -rp .agents/skills/. .claude/skills/)" >&2
  exit 2
fi

# diff -rq 列出所有不同的文件 / 一边缺失的文件;无差异时输出为空
if diff -rq "$SRC" "$DST"; then
  exit 0
else
  echo "" >&2
  echo "skills mirror drift detected." >&2
  echo "  source:  $SRC" >&2
  echo "  mirror:  $DST" >&2
  echo "  fix:     cp -rp .agents/skills/. .claude/skills/" >&2
  echo "  also:    rm -rf .claude/skills/<name> for any deleted skill" >&2
  exit 1
fi
