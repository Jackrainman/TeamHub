#!/usr/bin/env bash
#
# TeamHub 结构化数据备份：对唯一生产 SQLite 执行 VACUUM INTO，并从备份文件读回校验。
# artifact 字节不在 SQLite 中，本脚本不会复制它们；必须按末尾提示单独备份。
#
# 用法：
#   ./scripts/backup-teamhub-data.sh
#   TEAMHUB_DB_FILE=/srv/teamhub/teamhub.sqlite TEAMHUB_BACKUP_DIR=/mnt/backup ./scripts/backup-teamhub-data.sh
#
set -euo pipefail

DB_FILE="${TEAMHUB_DB_FILE:-${HOME}/teamhub-data/teamhub.sqlite}"
ARTIFACT_DIR="${TEAMHUB_ARTIFACT_FILES_DIR:-${HOME}/teamhub-data/artifacts}"
BACKUP_DIR="${TEAMHUB_BACKUP_DIR:-${HOME}/teamhub-data/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DST="${BACKUP_DIR}/teamhub.sqlite.${STAMP}"

command -v node >/dev/null 2>&1 || { echo "缺少 node（SQLite 备份与读回校验需要）" >&2; exit 127; }

if [[ ! -f "${DB_FILE}" ]]; then
  echo "[FAIL] 统一 SQLite 不存在：${DB_FILE}" >&2
  echo "请确认 TEAMHUB_DB_FILE；备份路径不明时禁止继续重启、重建或卷操作。" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
if [[ -e "${DST}" ]]; then
  echo "拒绝覆盖同名备份：${DST}" >&2
  exit 1
fi

echo "== TeamHub 统一 SQLite 备份 @ ${STAMP}"
echo "   source: ${DB_FILE}"
echo "   target: ${DST}"

if ! node -e '
  const { DatabaseSync } = require("node:sqlite");
  const [source, target] = process.argv.slice(1);
  const quote = String.fromCharCode(39);
  const escapedTarget = target.replaceAll(quote, quote + quote);
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    db.exec(`VACUUM INTO ${quote}${escapedTarget}${quote}`);
  } finally {
    db.close();
  }
' "${DB_FILE}" "${DST}"; then
  if [[ -e "${DST}" ]]; then
    INVALID="${DST}.invalid"
    [[ -e "${INVALID}" ]] && INVALID="${DST}.invalid.${BASHPID}"
    mv "${DST}" "${INVALID}"
    echo "[FAIL] VACUUM INTO 失败，问题副本已保留为 ${INVALID}" >&2
  else
    echo "[FAIL] VACUUM INTO 失败，未生成备份文件" >&2
  fi
  exit 1
fi

if node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").get();
    const version = Number(db.prepare("PRAGMA user_version").get().user_version);
    const kind = db.prepare("SELECT value FROM meta WHERE key = ?").get("schema_kind");
    if (integrity.integrity_check !== "ok") throw new Error(`integrity_check=${integrity.integrity_check}`);
    if (version < 1) throw new Error(`user_version=${version}（期望 >= 1）`);
    if (kind?.value !== "unified") throw new Error("schema_kind 非 unified");
  } finally {
    db.close();
  }
' "${DST}"; then
  echo "[ok] SQLite 备份读回通过：${DST}"
else
  INVALID="${DST}.invalid"
  [[ -e "${INVALID}" ]] && INVALID="${DST}.invalid.${BASHPID}"
  mv "${DST}" "${INVALID}"
  echo "[FAIL] 备份读回失败，问题副本已保留为 ${INVALID}" >&2
  exit 1
fi

cat <<EOF

结构化数据备份完成。
artifact 不包含在上述 SQLite 备份中：${ARTIFACT_DIR}
请单独使用 tar/rsync 备份 artifact，并对归档执行列表或解包校验。

Compose 部署对应卷：
  - hub_data：SQLite（含 app_settings 与全部结构化业务事实；应用运行时应使用 VACUUM INTO）
  - hub_artifacts：artifact 字节（需单独归档）
EOF
