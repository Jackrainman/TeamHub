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

# package-lock.json 同步（历史漂移根因：旧脚本只同步 package.json，lock 顶层/工作区自指版本仍停在 0.0.1）。
# 只改 @teamhub 自身/跨链工作区条目的 version（按 name 前缀 @teamhub/ + 顶层 + packages[""] 精准命中，
# 绝不碰第三方依赖版本）。JSON 往返已实测保留 npm 格式（零无关 diff）。node 失败则 set -e 中止。
node -e '
  const fs = require("fs");
  const v = process.argv[1];
  for (const f of process.argv.slice(2)) {
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    if (typeof j.version === "string") j.version = v;
    if (j.packages) {
      for (const [k, p] of Object.entries(j.packages)) {
        if (!p || typeof p.version !== "string") continue;
        if (k === "" || (typeof p.name === "string" && p.name.startsWith("@teamhub/"))) {
          p.version = v;
        }
      }
    }
    fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
    console.log("  " + f + " -> " + v);
  }
' "$next" apps/hub-contracts/package-lock.json apps/hub-server/package-lock.json apps/hub-console/package-lock.json

echo "产品版本 $cur -> $next（VERSION + 三包 package.json + 三包 package-lock.json 已同步）"
echo "下一步：git add VERSION apps/hub-*/package.json apps/hub-*/package-lock.json，并入本次 commit；commit message 体现版本（如 'feat(x): … v$next'）。"
