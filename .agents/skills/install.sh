#!/usr/bin/env bash
# 把 .agents/skills/ 下每个 skill 软链进本地 Claude Code 技能目录。
# .claude/ 已 gitignore（本地状态、各机器自装），故新克隆 / 改完 skill 后跑一次。
#
# 用法：
#   bash .agents/skills/install.sh            # 链进 <repo>/.claude/skills/（仅本仓库生效）
#   bash .agents/skills/install.sh --global   # 链进 ~/.claude/skills/（全局生效）
#
# 取代旧的 PostToolUse `sync-skills.sh` 钩子 + `verify-skills-sync.sh` 哨兵
# （D-066 后随串行轨退役、从未在任何 settings.json 注册、已造成 .claude/skills 漂移）。
# 单一真源 = 本目录 .agents/skills/；软链零拷贝，改 SKILL.md 后无需重装。
# 其它工具（Codex 等）按各自约定把 skills/<name>/SKILL.md 复制或引用过去即可。
set -euo pipefail

cd "$(dirname "$0")"                       # .agents/skills
SRC="$(pwd)"

DEST="$(git -C "$SRC" rev-parse --show-toplevel)/.claude/skills"
[ "${1:-}" = "--global" ] && DEST="$HOME/.claude/skills"

mkdir -p "$DEST"
n=0
for d in "$SRC"/*/; do
  [ -f "${d}SKILL.md" ] || continue       # 只链真正的 skill 目录（含 SKILL.md）
  name="$(basename "$d")"
  rm -rf "$DEST/$name"                     # 清掉旧的实拷贝 / 漂移副本，换成软链
  ln -sfn "${d%/}" "$DEST/$name"
  echo "linked  $name  ->  $DEST/$name"
  n=$((n + 1))
done
# PROTOCOL-v1.0.md 是格式规范、不是可触发 skill，本地副本若残留一并清掉
[ "$DEST" != "$HOME/.claude/skills" ] && rm -f "$DEST/PROTOCOL-v1.0.md"
echo "done: $n skill(s) -> $DEST"
