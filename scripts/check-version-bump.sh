#!/usr/bin/env bash
#
# 版本号 bump 哨兵（D-074）。
#
# feiyue 的 Tampermonkey「@version 不自增就不给用户更新」是个天然下游强制函数——忘了 bump
# 立刻被用户的「没更新」暴露。服务端 app 没有这个压力：版本停在 0.x 也照跑，于是悄悄漂移。
# 本哨兵替代它：暂存区改了 apps/hub-*/src 行为、却没动 VERSION，就报警。
#
# 默认 warn（exit 0，只打印提醒，不卡 D-064 无人值守 commit）。
#   VERSION_BUMP_STRICT=1 → 升为硬门（exit 1）。
#   SKIP_VERSION_BUMP=1   → 单次豁免（纯 bugfix 串/确实不该 bump）。
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

src_changed="$(git diff --cached --name-only -- \
  'apps/hub-contracts/src' 'apps/hub-server/src' 'apps/hub-console/src' 2>/dev/null || true)"
ver_changed="$(git diff --cached --name-only -- VERSION 2>/dev/null || true)"

if [[ -n "$src_changed" && -z "$ver_changed" && "${SKIP_VERSION_BUMP:-0}" != "1" ]]; then
  echo "⚠ 改了 hub-* 源码但没 bump VERSION（当前 $(tr -d ' \n' < VERSION)）。" >&2
  echo "  按 D-074：fix→patch / 向下兼容新功能→minor / 破坏对外接口→major。" >&2
  echo "  一键：scripts/bump-version.sh <patch|minor|major>" >&2
  echo "  确实不该 bump：本次 commit 设 SKIP_VERSION_BUMP=1 跳过。" >&2
  if [[ "${VERSION_BUMP_STRICT:-0}" == "1" ]]; then
    exit 1
  fi
fi

# 一致性哨兵：VERSION 与三包 package.json + 三包 package-lock(自指 version) 漂移即报警（warn-only）。
# 历史 bug：bump 只同步 package.json，lock 顶层 version 停在 0.0.1（已修 + bump-version.sh 现一并同步）。
node -e '
  const fs = require("fs");
  const want = fs.readFileSync("VERSION", "utf8").trim();
  const files = [
    "apps/hub-contracts/package.json", "apps/hub-server/package.json", "apps/hub-console/package.json",
    "apps/hub-contracts/package-lock.json", "apps/hub-server/package-lock.json", "apps/hub-console/package-lock.json",
  ];
  const drift = files.filter((f) => {
    try { return JSON.parse(fs.readFileSync(f, "utf8")).version !== want; } catch { return true; }
  });
  if (drift.length) {
    console.error("⚠ 版本漂移（VERSION=" + want + " 但不一致）：" + drift.join(", "));
    console.error("  一键修：scripts/bump-version.sh " + want);
  }
' || true

exit 0
