#!/usr/bin/env bash
#
# TeamHub 数据备份：把知识库 + 治理落盘文件做带时间戳快照，并**读回校验**（可解析 + 非空对象）后才 exit 0。
# 模型 = feiyue `deploy/deploy-bank.sh`（重建前先确认数据卷）+ AGENTS §10「归档后读回验证」。
#
# 铁律（AGENTS §2）：跑 start-teamhub.sh 重启、docker compose 重建、或 verify-hub-compose.sh smoke 之前，
# **先跑本脚本**。kb.json 是不可再生的永久语料（历史 bug 召回实证），gov.json 是真实 PM 录入 / 图纸日志。
#
# 用法：
#   ./scripts/backup-teamhub-data.sh                              # 备份默认两文件到 ~/teamhub-data/backups/
#   TEAMHUB_BACKUP_DIR=/mnt/x ./scripts/backup-teamhub-data.sh    # 改备份落点
#   TEAMHUB_KB_DATA_FILE=... TEAMHUB_GOV_DATA_FILE=... ./scripts/backup-teamhub-data.sh
#
# 退出码：任一**存在**的源文件读回校验失败（空 / 损坏 / 非对象）→ 非零退出（备份无效，别继续重建）。
#         源文件不存在（尚无数据）→ skip、不算失败。
#
set -euo pipefail

KB_FILE="${TEAMHUB_KB_DATA_FILE:-${HOME}/teamhub-data/kb.json}"
GOV_FILE="${TEAMHUB_GOV_DATA_FILE:-${HOME}/teamhub-data/gov.json}"
BACKUP_DIR="${TEAMHUB_BACKUP_DIR:-${HOME}/teamhub-data/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"

command -v node >/dev/null 2>&1 || { echo "缺少 node（读回校验需要）" >&2; exit 127; }
mkdir -p "$BACKUP_DIR"

# 读回：必须能 JSON.parse 且顶层是非空对象，否则备份无效（feiyue「归档后读回」）。
verify_json() {
  node -e '
    const fs = require("fs");
    const raw = fs.readFileSync(process.argv[1], "utf8");
    if (!raw.trim()) { console.error("空文件"); process.exit(1); }
    const o = JSON.parse(raw);
    if (o === null || typeof o !== "object" || Array.isArray(o)) { console.error("非对象 JSON"); process.exit(1); }
    if (Object.keys(o).length === 0) { console.error("空对象"); process.exit(1); }
  ' "$1"
}

backed=0
backup_one() {
  local src="$1" label="$2"
  if [[ ! -f "$src" ]]; then
    echo "  [skip] $label 不存在（$src）——尚无数据，无需备份"
    return 0
  fi
  local dst="$BACKUP_DIR/$(basename "$src").$STAMP"
  cp "$src" "$dst"
  if verify_json "$dst"; then
    echo "  [ok]   $label → $dst（读回校验通过）"
    backed=$((backed + 1))
  else
    echo "  [FAIL] $label 备份读回校验失败，已删除无效备份：$dst" >&2
    rm -f "$dst"
    exit 1
  fi
}

echo "== TeamHub 数据备份 @ $STAMP → $BACKUP_DIR"
backup_one "$KB_FILE" "知识库 kb"
backup_one "$GOV_FILE" "治理 gov"
echo "完成：$backed 份已备份并读回校验。"

cat <<EOF

—— Docker 卷等价（compose 部署时数据在命名卷 hub_kb/hub_gov，非主机文件，本脚本的文件路径备份不到它们）——
  docker run --rm -v hub_kb:/d -v "$BACKUP_DIR":/b alpine \\
    tar czf "/b/hub_kb.$STAMP.tar.gz" -C /d .
  docker run --rm -v hub_gov:/d -v "$BACKUP_DIR":/b alpine \\
    tar czf "/b/hub_gov.$STAMP.tar.gz" -C /d .
EOF
