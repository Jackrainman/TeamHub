import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Member, ReimburseEntry, SessionIdentity, Task } from '@teamhub/hub-contracts';
import { parseQuery } from '../../http/helpers.js';

const QuerySchema = z.object({ q: z.string().trim().min(1).max(100) });
export interface SearchPorts {
  tasks(): Task[];
  members(): Member[];
  reimburse(identity: SessionIdentity | null): Promise<ReimburseEntry[]>;
}
export function registerSearchRoutes(app: FastifyInstance, ports: SearchPorts): void {
  app.get('/api/search', async (request, reply) => {
    const query = parseQuery(QuerySchema, request, reply);
    if (!query) return;
    const needle = query.q.toLowerCase();
    const match = (value: string | null) => value?.toLowerCase().includes(needle) ?? false;
    const results = [
      ...ports.tasks().filter((task) => match(task.title) || match(task.rawSummary)).slice(0, 12).map((task) => ({
        type: 'task', id: task.id, title: task.title, snippet: task.rawSummary,
      })),
      ...ports.members().filter((member) => match(member.displayName)).slice(0, 8).map((member) => ({
        type: 'member', id: member.id, title: member.displayName, snippet: member.groupId,
      })),
      ...(await ports.reimburse(request.identity)).filter((entry) => match(entry.summary) || match(entry.invoiceNo)).slice(0, 8).map((entry) => ({
        type: 'reimburse', id: entry.id, title: entry.summary ?? entry.invoiceNo ?? entry.id,
        snippet: `${entry.workflowStatus} · ${entry.totalAmountFen ?? '金额待补'}`,
      })),
    ].slice(0, 30);
    return { results };
  });
}
