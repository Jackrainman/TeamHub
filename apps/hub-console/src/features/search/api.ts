import type { HttpContext } from '../../api/http';

/** 全局搜索结果行（server /api/search 的响应行形状；跨域聚合读，无 contracts schema 故本地声明）。 */
export interface GlobalSearchResult {
  type: string;
  id: string;
  title: string;
  snippet: string;
}

/**
 * search 域 API 分段（ARCH-UNIFY A4；前身 segments/system-pm.ts 的 globalSearch）。
 * 跨域聚合读（pm/kb/inventory），对照 server modules/reporting/search.ts。
 * 查询由本域 hooks 统一管理，按关键词隔离响应。
 */
export interface SearchSegment {
  globalSearch(q: string): Promise<{ results: GlobalSearchResult[] }>;
}

export function createSearchSegment(ctx: HttpContext): SearchSegment {
  const { baseUrl, fetcher } = ctx;
  return {
    async globalSearch(q: string) {
      const res = await fetcher(`${baseUrl}/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`search ${res.status}`);
      return res.json() as Promise<{ results: GlobalSearchResult[] }>;
    },
  };
}
