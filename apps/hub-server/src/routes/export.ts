import type { FastifyInstance } from 'fastify';
import type { GovStore } from '../store/gov-store.js';
import type { ScheduleResourcesReadPort } from '../modules/schedule/repository.js';
import type { InventoryReadPort } from '../modules/inventory/repository.js';
import { deriveInventoryLedger } from '@teamhub/hub-contracts';

export interface ExportRouteDeps {
  store: GovStore;
  inventoryRead: InventoryReadPort;
  scheduleRead: ScheduleResourcesReadPort;
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function toCsv(headers: string[], rows: string[][]): string {
  const bom = '\uFEFF';
  const lines = [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
  return bom + lines.join('\r\n');
}

export function registerExportRoutes(app: FastifyInstance, deps: ExportRouteDeps): void {
  const { store, scheduleRead, inventoryRead } = deps;

  app.get('/api/export/roster', async (_request, reply) => {
    const snapshot = await store.getSnapshot();
    const groups = snapshot.groups;
    const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id;
    const rows = snapshot.members.map((m) => [
      m.displayName,
      groupName(m.groupId),
      m.grade,
      m.role,
      m.projectManager ? 'yes' : 'no',
    ]);
    const csv = toCsv(['姓名', '组别', '年级', '角色', '项目管理'], rows);
    void reply.header('content-type', 'text/csv; charset=utf-8');
    void reply.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent('名册.csv')}`);
    return csv;
  });

  app.get('/api/export/tasks', async (_request, reply) => {
    const snapshot = await store.getSnapshot();
    const groups = snapshot.groups;
    const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id;
    const memberName = (id: string | null) =>
      id ? (snapshot.members.find((m) => m.id === id)?.displayName ?? id) : '';
    const rows = snapshot.tasks.map((t) => [
      t.title,
      groupName(t.groupId),
      t.status,
      memberName(t.ownerId),
      t.createdAt.slice(0, 10),
      t.rawSummary.slice(0, 100),
    ]);
    const csv = toCsv(['任务', '组别', '状态', '负责人', '创建日期', '摘要'], rows);
    void reply.header('content-type', 'text/csv; charset=utf-8');
    void reply.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent('任务清单.csv')}`);
    return csv;
  });

  app.get('/api/export/inventory', async (_request, reply) => {
    const snapshot = await inventoryRead.getInventorySnapshot();
    const resources = await scheduleRead.listResources();
    const ledger = deriveInventoryLedger(snapshot, resources);
    const rows = ledger.map((row) => [
      row.partType.name,
      String(row.partType.totalQuantity),
      String(row.partType.totalQuantity - row.idle),
      String(row.idle),
      String(row.partType.lowStockThreshold),
    ]);
    const csv = toCsv(['零件', '总数', '在装', '闲置', '最低阈值'], rows);
    void reply.header('content-type', 'text/csv; charset=utf-8');
    void reply.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent('库存台账.csv')}`);
    return csv;
  });
}
