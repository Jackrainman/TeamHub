#!/usr/bin/env bash
#
# 产品版本号一键 bump（D-074 版本号纪律）。
#
# 单一真相 = 根 VERSION 文件（SemVer MAJOR.MINOR.PATCH）。三支柱同端口 4177 同发布 =
# 一个产品一个版本号。本脚本从根 workspace 清单发现三包，并把 VERSION 同步进根/三包 package.json，使
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

# 根 package.json 是 workspace 清单的唯一来源；只同步根 package-lock.json 中对应的自指版本，
# 绝不碰第三方依赖版本。node 失败则由 set -e 中止，不留下半套版本文件。
node -e '
  const fs = require("fs");
  const v = process.argv[1];
  const rootPath = "package.json";
  const root = JSON.parse(fs.readFileSync(rootPath, "utf8"));
  const workspaces = root.workspaces;
  if (!Array.isArray(workspaces) || workspaces.length === 0) {
    throw new Error("根 package.json 缺少 workspaces 清单");
  }
  for (const file of [rootPath, ...workspaces.map((dir) => `${dir}/package.json`)]) {
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    pkg.version = v;
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
    console.log("  " + file + " -> " + v);
  }

  const lockPath = "package-lock.json";
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.version = v;
  for (const key of ["", ...workspaces]) {
    if (!lock.packages?.[key]) throw new Error(`根 lock 缺少 workspace 条目：${key || "<root>"}`);
    lock.packages[key].version = v;
  }
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
  console.log("  " + lockPath + " -> " + v);
' "$next"

echo "产品版本 $cur -> $next（VERSION + 根/三包 package.json + 根 package-lock.json 已同步）"
echo "下一步：将 VERSION、根/三包 package.json 与根 package-lock.json 并入本次 commit；commit message 体现版本（如 'feat(x): … v$next'）。"
