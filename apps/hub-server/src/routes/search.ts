import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GovStore, KbStore } from '../store/gov-store.js';
import type { InventoryReadPort } from '../modules/inventory/repository.js';
import { parseQuery } from './helpers.js';

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
});

export interface SearchRouteDeps {
  store: GovStore;
  kbStore: KbStore;
  inventoryRead: InventoryReadPort;
}

export interface SearchResult {
  type: 'task' | 'kb' | 'inventory';
  id: string;
  title: string;
  snippet: string;
}

export function registerSearchRoutes(app: FastifyInstance, deps: SearchRouteDeps): void {
  const { store, kbStore, inventoryRead } = deps;

  app.get('/api/search', async (request, reply) => {
    const query = parseQuery(SearchQuerySchema, request, reply, 'q parameter required (1-100 chars)');
    if (!query) return;
    const q = query.q.toLowerCase();
    const results: SearchResult[] = [];

    const snapshot = await store.getSnapshot();
    for (const t of snapshot.tasks) {
      if (
        t.title.toLowerCase().includes(q) ||
        t.rawSummary.toLowerCase().includes(q)
      ) {
        results.push({
          type: 'task',
          id: t.id,
          title: t.title,
          snippet: t.rawSummary.slice(0, 80),
        });
      }
    }

    const kb = await kbStore.getKbSnapshot();
    for (const card of kb.issueCards) {
      if (
        card.symptomSummary.toLowerCase().includes(q) ||
        card.title.toLowerCase().includes(q)
      ) {
        results.push({
          type: 'kb',
          id: card.id,
          title: card.title,
          snippet: card.symptomSummary.slice(0, 80),
        });
      }
    }
    for (const doc of kb.archiveDocuments) {
      if (doc.fileName.toLowerCase().includes(q)) {
        results.push({
          type: 'kb',
          id: doc.issueId,
          title: doc.fileName,
          snippet: doc.fileName,
        });
      }
    }

    const inv = await inventoryRead.getInventorySnapshot();
    for (const pt of inv.partTypes) {
      if (pt.name.toLowerCase().includes(q)) {
        results.push({
          type: 'inventory',
          id: pt.id,
          title: pt.name,
          snippet: `库存 ${pt.totalQuantity}`,
        });
      }
    }

    return { results: results.slice(0, 30) };
  });
}
