/**
 * 由结案时刻 + issue.id 确定性派生 `DBG-YYYYMMDD-NNN` 错误码（不引入 Math.random，可单测复现）。
 * NNN = issue.id 简单哈希 mod 1000；同一 issue 同一天稳定。
 *
 * 单一源（D-052 重复真相收口）：hub-server 结案路由 / ProbeFlash 导入 CLI / hub-console mock
 * 三处此前各复刻一份逐字相同的派生逻辑（跨包无法 import，DRY 谎称单源）；现下沉至此，三端 import
 * 同一函数。导入路径传入**历史时戳**（归档 frontmatter date / 文件名日期）而非当前钟，
 * 故 errorCode 的日期段反映 bug 当年发生时间（KB-IMPORT-PROBEFLASH 要求）。
 */
export function deriveErrorCode(now: string, issueId: string): string {
  const datePart = now.slice(0, 10).replace(/-/g, '');
  let hash = 0;
  for (const ch of issueId) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
  return `DBG-${datePart}-${String(hash).padStart(3, '0')}`;
}
