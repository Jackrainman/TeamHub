#!/usr/bin/env bash
#
# 产品版本号一键 bump（D-074 版本号纪律）。
#
# 单一真相 = 根 VERSION 文件（SemVer MAJOR.MINOR.PATCH）。三支柱同端口 4177 同发布 =
# 一个产品一个版本号。本脚本把 VERSION 同步进 hub-* 三包 package.json，使
# /api/system/status·/health 立刻报告新版本（status.ts 读 hub-server/package.json）。
# **只用本脚本改版本，别手改 package.json**——手改会让 VERSION 与三包漂移（正是历史 bug 根因）。
#
# 用法: scripts/bump-version.sh <patch|minor|major|X.Y.Z>
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

arg="${1:-}"
if [[ -z "$arg" ]]; then
  echo "用法: scripts/bump-version.sh <patch|minor|major|X.Y.Z>" >&2
  echo "  patch=修 bug/性能  minor=向下兼容新功能  major=破坏对外接口（1.0 前破坏性仍走 minor）" >&2
  exit 1
fi

cur="$(tr -d ' \n' < VERSION)"
IFS='.' read -r MA MI PA <<< "$cur"

case "$arg" in
  patch) PA=$((PA + 1)) ;;
  minor) MI=$((MI + 1)); PA=0 ;;
  major) MA=$((MA + 1)); MI=0; PA=0 ;;
  [0-9]*.[0-9]*.[0-9]*) MA="${arg%%.*}"; rest="${arg#*.}"; MI="${rest%%.*}"; PA="${rest##*.}" ;;
  *) echo "非法参数: $arg（要 patch|minor|major 或 X.Y.Z）" >&2; exit 1 ;;
esac

next="${MA}.${MI}.${PA}"
printf '%s\n' "$next" > VERSION

# 只替换顶层 "version" 字段那一行（依赖项的键是包名、不是 "version"，不会误伤）。
for pkg in hub-contracts hub-server hub-console; do
  f="apps/$pkg/package.json"
  sed -i -E 's/("version"[[:space:]]*:[[:space:]]*")[^"]+(")/\1'"$next"'\2/' "$f"
  echo "  $f -> $next"
done

echo "产品版本 $cur -> $next（VERSION + 三包 package.json 已同步）"
echo "下一步：git add VERSION apps/hub-*/package.json，并入本次 commit；commit message 体现版本（如 'feat(x): … v$next'）。"
