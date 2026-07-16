#!/usr/bin/env bash
#
# TeamHub 数据备份：把五个落盘数据域（知识库 kb / 治理 gov / 库存 inv / 基准线 baseline / 检查单 checklist）
# 做带时间戳快照，并**读回校验**（默认复用启动加载器做严格 schema 校验——"备份能读回" ⟺ "启动能加载"；
# server dist 缺失时回落"可解析+非空对象"并显著告警）后才 exit 0。
# 模型 = feiyue `deploy/deploy-bank.sh`（重建前先确认数据卷）+ AGENTS §10「归档后读回验证」。
# 2026-07-16 文档轮扩展：原只备 kb/gov 两域，补齐 inv/baseline/checklist（漏备则升级损坏时救不回）。
# 注意：归档物目录（TEAMHUB_ARTIFACT_FILES_DIR，二进制文件）**不在本脚本内**，需自行 tar/rsync。
#
# 铁律（AGENTS §2）：跑 start-teamhub.sh 重启、docker compose 重建、或 verify-hub-compose.sh smoke 之前，
# **先跑本脚本**。kb.json 是不可再生的永久语料（历史 bug 召回实证），gov.json 是真实 PM 录入 / 图纸日志。
#
# 用法：
#   ./scripts/backup-teamhub-data.sh                              # 备份默认五域文件到 ~/teamhub-data/backups/
#   TEAMHUB_BACKUP_DIR=/mnt/x ./scripts/backup-teamhub-data.sh    # 改备份落点
#   TEAMHUB_KB_DATA_FILE=... TEAMHUB_GOV_DATA_FILE=... ./scripts/backup-teamhub-data.sh  # 其余三域同理
#
# 退出码：任一**存在**的源文件读回校验失败（空 / 损坏 / schema 不符 / 启动会加载失败）→ 非零退出
#         （备份无效，别继续重建）。源文件不存在（尚无数据）→ skip、不算失败。
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIST="${ROOT_DIR}/apps/hub-server/dist/store"
KB_FILE="${TEAMHUB_KB_DATA_FILE:-${HOME}/teamhub-data/kb.json}"
GOV_FILE="${TEAMHUB_GOV_DATA_FILE:-${HOME}/teamhub-data/gov.json}"
INV_FILE="${TEAMHUB_INV_DATA_FILE:-${HOME}/teamhub-data/inventory.json}"
BASELINE_FILE="${TEAMHUB_BASELINE_DATA_FILE:-${HOME}/teamhub-data/baseline.json}"
CHECKLIST_FILE="${TEAMHUB_CHECKLIST_DATA_FILE:-${HOME}/teamhub-data/checklist.json}"
BACKUP_DIR="${TEAMHUB_BACKUP_DIR:-${HOME}/teamhub-data/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"

command -v node >/dev/null 2>&1 || { echo "缺少 node（读回校验需要）" >&2; exit 127; }
mkdir -p "$BACKUP_DIR"

# 弱校验（仅 dist 缺失时回落）：能 JSON.parse 且顶层形状对（多数域=非空对象；baseline 域顶层是数组、
# 且真实态空板下合法为 []）。**比启动加载弱**——放得过缺字段 / 字段类型错（如 tasks 非数组）的快照，
# 这类快照备份「通过」却让 FileXStore.create 启动即崩，故仅兜底。
verify_json_weak() {
  node -e '
    const fs = require("fs");
    const [file, shape] = [process.argv[1], process.argv[2]];
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) { console.error("空文件"); process.exit(1); }
    const o = JSON.parse(raw);
    if (shape === "array") {
      if (!Array.isArray(o)) { console.error("非数组 JSON（该域顶层应为数组）"); process.exit(1); }
    } else {
      if (o === null || typeof o !== "object" || Array.isArray(o)) { console.error("非对象 JSON"); process.exit(1); }
      if (Object.keys(o).length === 0) { console.error("空对象"); process.exit(1); }
    }
  ' "$1" "$2"
}

# 强校验（默认）：复用**启动加载器本身**当 oracle。FileXStore.create() 对**已存在**文件 = 严格 zod 解析
# （KbSnapshotSchema / GovernanceSnapshotSchema，与 main.ts 启动同一条加载路径），且对已存在文件**绝不回写**
# （实测 mtime 不变）。于是「备份能读回」严格等价「启动能加载」，不再放过弱校验会漏的开机即崩快照。
# dist 未构建（裸 checkout）时回落弱校验并**显著告警**：此次未做强 schema 校验。
verify_snapshot() {
  local file="$1" kind="$2" mod cls shape=object
  case "$kind" in
    gov)       mod="${SERVER_DIST}/file-gov-store.js";       cls="FileGovStore"       ;;
    kb)        mod="${SERVER_DIST}/file-kb-store.js";        cls="FileKbStore"        ;;
    inv)       mod="${SERVER_DIST}/file-inv-store.js";       cls="FileInvStore"       ;;
    baseline)  mod="${SERVER_DIST}/file-baseline-store.js";  cls="FileBaselineStore"; shape=array ;;
    checklist) mod="${SERVER_DIST}/file-checklist-store.js"; cls="FileChecklistStore" ;;
    *)   echo "verify_snapshot: 未知类型 $kind" >&2; return 1 ;;
  esac
  if [[ -f "$mod" ]]; then
    MOD_URL="file://$mod" CLS="$cls" node -e '
      const url = process.env.MOD_URL, cls = process.env.CLS, file = process.argv[1];
      import(url)
        .then((m) => m[cls].create(file))   // 文件已存在 → 仅严格解析，绝不写
        .then(() => process.exit(0))
        .catch((e) => {
          const msg = String((e && e.message) || e).replace(/\s+/g, " ").slice(0, 300);
          console.error("启动加载校验失败（启动会以同样原因崩，故拒绝此备份）：" + msg);
          process.exit(1);
        });
    ' "$file"
  else
    echo "  ⚠ 未构建 server dist（${mod} 缺失）→ 跳过强 schema 校验，仅弱校验（可解析+顶层形状对）。" >&2
    echo "    重部署前应先 build，使备份读回与启动加载严格同口径（否则坏快照可能放行却开机即崩）。" >&2
    verify_json_weak "$file" "$shape"
  fi
}

backed=0
backup_one() {
  local src="$1" label="$2" kind="$3"
  if [[ ! -f "$src" ]]; then
    echo "  [skip] $label 不存在（$src）——尚无数据，无需备份"
    return 0
  fi
  local dst="$BACKUP_DIR/$(basename "$src").$STAMP"
  cp "$src" "$dst"
  if verify_snapshot "$dst" "$kind"; then
    echo "  [ok]   $label → $dst（读回校验通过）"
    backed=$((backed + 1))
  else
    echo "  [FAIL] $label 备份读回校验失败，已删除无效备份：$dst" >&2
    rm -f "$dst"
    exit 1
  fi
}

echo "== TeamHub 数据备份 @ $STAMP → $BACKUP_DIR"
backup_one "$KB_FILE" "知识库 kb" kb
backup_one "$GOV_FILE" "治理 gov" gov
backup_one "$INV_FILE" "库存 inv" inv
backup_one "$BASELINE_FILE" "基准线 baseline" baseline
backup_one "$CHECKLIST_FILE" "检查单 checklist" checklist
echo "完成：$backed 份已备份并读回校验。"
echo "提醒：归档物目录（图纸文件，默认 ~/teamhub-data/artifacts）不在本脚本内，需要时自行 tar/rsync。"

cat <<EOF

—— Docker 卷等价（compose 部署时数据在六个命名卷里，非主机文件，本脚本的文件路径备份不到它们）——
  for vol in hub_kb hub_gov hub_inv hub_baseline hub_checklist hub_artifacts; do
    docker run --rm -v "\$vol":/d -v "$BACKUP_DIR":/b alpine \\
      tar czf "/b/\$vol.$STAMP.tar.gz" -C /d .
  done
EOF
