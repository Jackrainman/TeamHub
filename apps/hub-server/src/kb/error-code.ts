/**
 * 由结案时刻 + issue.id 确定性派生 `DBG-YYYYMMDD-NNN` 错误码（不引入 Math.random，可单测复现）。
 * NNN = issue.id 简单哈希 mod 1000；同一 issue 同一天稳定。
 *
 * 共享单一源：`POST /api/kb/closeout` 路由（server.ts）与 ProbeFlash `.debug-archive`
 * 一次性导入（import/import-debug-archive.ts）都用本函数，避免两处复刻派生逻辑（§10 / DRY）。
 * 导入路径传入**历史时戳**（归档 frontmatter date / 文件名日期）而非 server 当前钟，
 * 故 errorCode 的日期段反映 bug 当年发生时间（KB-IMPORT-PROBEFLASH backlog 要求）。
 */
export function deriveErrorCode(now: string, issueId: string): string {
  const datePart = now.slice(0, 10).replace(/-/g, '');
  let hash = 0;
  for (const ch of issueId) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
  return `DBG-${datePart}-${String(hash).padStart(3, '0')}`;
}
