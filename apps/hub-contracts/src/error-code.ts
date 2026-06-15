/**
 * 由结案时刻派生 `DBG-YYYYMMDD-NNN` 错误码（不引入 Math.random，可单测复现）。
 *
 * **M9（AUDIT-FIXES 部署前必修）**：NNN 优先取 `sequence`（调用方传入「同日既有 ErrorEntry 数 + 1」的
 * 单调序号）——避免原「issueId 哈希 mod 1000」在 ~38 次/日时生日碰撞 → 静默覆盖、污染 `kb-similar`
 * 依赖 errorCode 的跨赛季查找。`sequence` 省略时回退到 issueId 哈希（CLI 历史导入 / console mock
 * 无 store 访问、走 best-effort 哈希）。
 *
 * 单一源（D-052 重复真相收口）：hub-server 结案路由 / ProbeFlash 导入 CLI / hub-console mock 三端
 * import 同一函数。导入路径传入**历史时戳**（归档 frontmatter date / 文件名日期）而非当前钟，
 * 故 errorCode 的日期段反映 bug 当年发生时间（KB-IMPORT-PROBEFLASH 要求）。
 */
export function deriveErrorCode(
  now: string,
  issueId: string,
  sequence?: number,
): string {
  const datePart = now.slice(0, 10).replace(/-/g, '');
  const nnn = sequence != null ? sequence % 1000 : hashIssueId(issueId);
  return `DBG-${datePart}-${String(nnn).padStart(3, '0')}`;
}

function hashIssueId(issueId: string): number {
  let hash = 0;
  for (const ch of issueId) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
  return hash;
}
