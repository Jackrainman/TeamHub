#!/usr/bin/env bash
#
# 版本号 bump 哨兵 + 自动自增（D-074）。
#
# feiyue 的 Tampermonkey「@version 不自增就不给用户更新」是个天然下游强制函数——忘了 bump
# 立刻被用户的「没更新」暴露。服务端 app 没有这个压力：版本停在 0.x 也照跑，于是悄悄漂移。
# 本反射替代它：暂存区改了 apps/hub-*/src 行为、却没动 VERSION，就**自动 bump 并把版本文件
# （VERSION + 根/三包 package.json + 根 package-lock.json）git add 进本次提交**——= feiyue
# 「改脚本必自增 @version」的服务端反射。靠 pre-commit 钩子触发（scripts/install-hooks.sh 安装）。
#
# 默认自增级别 = patch（exit 0，不卡 D-064 无人值守 commit）。
#   VERSION_BUMP_LEVEL=minor|major → 改自增级别（向下兼容新功能=minor，破坏对外接口=major）。
#   SKIP_VERSION_BUMP=1            → 单次豁免（纯 bugfix 串/确实不该 bump），跳过自增。
#   VERSION_BUMP_STRICT=1          → 自动 bump 失败时硬阻断（exit 1）；默认失败只 warn。
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

src_changed="$(git diff --cached --name-only -- \
  'apps/hub-contracts/src' 'apps/hub-server/src' 'apps/hub-console/src' 2>/dev/null || true)"
ver_changed="$(git diff --cached --name-only -- VERSION 2>/dev/null || true)"

if [[ -n "$src_changed" && -z "$ver_changed" && "${SKIP_VERSION_BUMP:-0}" != "1" ]]; then
  level="${VERSION_BUMP_LEVEL:-patch}"
  cur="$(tr -d ' \n' < VERSION)"
  echo "ℹ 改了 hub-* 源码但没 bump VERSION（当前 ${cur}）→ 自动 bump ${level}" >&2
  echo "  （= feiyue「改脚本必自增 @version」的服务端反射；改级别 VERSION_BUMP_LEVEL=minor|major；跳过 SKIP_VERSION_BUMP=1）" >&2
  if bash "$ROOT_DIR/scripts/bump-version.sh" "$level" >&2; then
    mapfile -t version_files < <(node -e '
      const root = require("./package.json");
      for (const file of ["VERSION", "package.json", "package-lock.json", ...root.workspaces.map((dir) => `${dir}/package.json`)]) {
        console.log(file);
      }
    ')
    if git add "${version_files[@]}"; then
      echo "✓ 已自动 bump ${cur} → $(tr -d ' \n' < VERSION)，版本文件已并入本次提交。" >&2
    else
      echo "⚠ bump 已改文件但 git add 失败，请手动 add 版本文件后再提交。" >&2
      if [[ "${VERSION_BUMP_STRICT:-0}" == "1" ]]; then exit 1; fi
    fi
  else
    echo "⚠ 自动 bump 失败，请手动：scripts/bump-version.sh ${level}" >&2
    if [[ "${VERSION_BUMP_STRICT:-0}" == "1" ]]; then exit 1; fi
  fi
fi

# 一致性哨兵：VERSION 与根/三包 package.json + 根 lock 的 workspace 自指版本漂移即报警（warn-only）。
# 历史 bug：版本脚本只覆盖部分 manifest/lock；现在从根 workspace 清单动态发现全部版本文件。
node -e '
  const fs = require("fs");
  const want = fs.readFileSync("VERSION", "utf8").trim();
  const root = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const manifests = ["package.json", ...root.workspaces.map((dir) => `${dir}/package.json`)];
  const drift = manifests.filter((file) => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")).version !== want; } catch { return true; }
  });
  try {
    const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
    if (lock.version !== want) drift.push("package-lock.json#version");
    for (const key of ["", ...root.workspaces]) {
      if (lock.packages?.[key]?.version !== want) drift.push(`package-lock.json#packages[${key || "<root>"}]`);
    }
  } catch {
    drift.push("package-lock.json");
  }
  if (drift.length) {
    console.error("⚠ 版本漂移（VERSION=" + want + " 但不一致）：" + drift.join(", "));
    console.error("  一键修：scripts/bump-version.sh " + want);
  }
' || true

exit 0
