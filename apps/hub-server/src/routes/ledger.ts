import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  deriveInventoryLedger,
  deriveShortfalls,
  InvalidPartActionError,
  IDLE_HOLDER,
  InventoryResponseSchema,
  CreatePartTypeRequestSchema,
  CreatePartTypeResponseSchema,
  CreatePartActionRequestSchema,
  CreatePartActionResponseSchema,
  HermesInboundRequestSchema,
  HermesInboundResponseSchema,
  HermesInvQueryArgsSchema,
  HermesInvRecordArgsSchema,
  parseHermesText,
  buildInventoryTemplateCsv,
  decodeCsvBytes,
  parseInventoryCsv,
  InventoryImportReportSchema,
  InventoryImportRowsRequestSchema,
  InventoryPreviewResponseSchema,
} from '@teamhub/hub-contracts';
import type { InventoryImportFailure, InventoryImportRow, IdentityMode, SessionIdentity } from '@teamhub/hub-contracts';
import type { GovStore, InvStore } from '../store/gov-store.js';
import { firstZodMsg, parseBody, readCsvUpload, requireSuperAdmin } from './helpers.js';

const INVENTORY_IMPORT_MAX_BYTES = 1024 * 1024;

export interface LedgerRouteDeps {
  store: GovStore;
  invStore: InvStore;
  identityMode: IdentityMode;
}

export function registerLedgerRoutes(app: FastifyInstance, deps: LedgerRouteDeps): void {
  const { store, invStore, identityMode } = deps;

  app.get('/api/inventory', async () => {
    const snapshot = await invStore.getInventorySnapshot();
    const resources = await store.listResources();
    const ledger = deriveInventoryLedger(snapshot, resources);
    const shortfalls = deriveShortfalls(snapshot);
    return InventoryResponseSchema.parse({
      partTypes: snapshot.partTypes,
      trackedParts: snapshot.trackedParts,
      ledger,
      shortfalls,
      actions: snapshot.actions,
    });
  });

  app.post('/api/inventory/part-types', async (request, reply) => {
    const parsed = parseBody(CreatePartTypeRequestSchema, request, reply);
    if (!parsed) return;
    const partType = await invStore.upsertPartType(parsed);
    void reply.code(201);
    return CreatePartTypeResponseSchema.parse({ partType });
  });

  app.post('/api/inventory/actions', async (request, reply) => {
    const parsed = parseBody(CreatePartActionRequestSchema, request, reply);
    if (!parsed) return;
    const validResourceIds = new Set(
      (await store.listResources()).map((r) => r.id),
    );
    for (const holder of [parsed.fromHolder, parsed.toHolder]) {
      if (holder && holder !== IDLE_HOLDER && !validResourceIds.has(holder)) {
        void reply.code(400).send({ detail: `未知 resourceId: ${holder}` });
        return;
      }
    }
    try {
      const action = await invStore.recordPartAction({ ...parsed, source: 'human' });
      void reply.code(201);
      return CreatePartActionResponseSchema.parse({ action });
    } catch (err) {
      if (err instanceof InvalidPartActionError) {
        void reply.code(400).send({ detail: err.message });
        return;
      }
      throw err;
    }
  });

  app.get('/api/inventory/template', async (_request, reply) => {
    void reply.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('库存模板.csv')}`,
    );
    void reply.type('text/csv; charset=utf-8');
    return buildInventoryTemplateCsv();
  });

  const inventoryWriteAuth = async (
    request: FastifyRequest & { identity?: SessionIdentity | null },
    reply: FastifyReply,
  ): Promise<boolean> => {
    if (identityMode === 'identity') {
      return requireSuperAdmin(store, request, reply);
    }
    return true;
  };

  const readInventoryCsvText = (request: FastifyRequest, reply: FastifyReply) =>
    readCsvUpload(request, reply, { maxBytes: INVENTORY_IMPORT_MAX_BYTES, decode: decodeCsvBytes });

  app.post('/api/inventory/preview', async (request, reply) => {
    if (!(await inventoryWriteAuth(request as FastifyRequest & { identity?: SessionIdentity | null }, reply))) return;
    const text = await readInventoryCsvText(request, reply);
    if (text === null) return;
    const { rows, errors } = parseInventoryCsv(text);
    return InventoryPreviewResponseSchema.parse({ rows, failed: errors });
  });

  app.post('/api/inventory/import', async (request, reply) => {
    if (!(await inventoryWriteAuth(request as FastifyRequest & { identity?: SessionIdentity | null }, reply))) return;
    let rows: InventoryImportRow[];
    let parseErrors: InventoryImportFailure[] = [];
    if ((request.headers['content-type'] ?? '').includes('application/json')) {
      const parsed = parseBody(InventoryImportRowsRequestSchema, request, reply);
      if (!parsed) return;
      rows = parsed.rows;
    } else {
      const text = await readInventoryCsvText(request, reply);
      if (text === null) return;
      const parsedCsv = parseInventoryCsv(text);
      rows = parsedCsv.rows;
      parseErrors = parsedCsv.errors;
    }
    const outcome = await invStore.importPartTypes(rows);
    return InventoryImportReportSchema.parse({
      created: outcome.created,
      updated: outcome.updated,
      failed: [...parseErrors, ...outcome.failed],
    });
  });

  app.post('/api/hermes/inbound', async (request, reply) => {
    const parsed = parseBody(HermesInboundRequestSchema, request, reply);
    if (!parsed) return;

    let command: string;
    let args: Record<string, unknown>;

    if ('text' in parsed) {
      const result = parseHermesText(parsed.text);
      if (!result) {
        return HermesInboundResponseSchema.parse({
          ok: false,
          text: `没听懂「${parsed.text}」。试试：「3508还有几个」「新到了5个电容」「3508烧了一个」「把电容从R1拆到R2」`,
        });
      }
      command = result.command;
      args = result.args;
    } else {
      command = parsed.command;
      args = parsed.args;
    }

    const snapshot = await invStore.getInventorySnapshot();
    const resources = await store.listResources();

    if (command === 'inv-query') {
      const q = HermesInvQueryArgsSchema.safeParse(args);
      if (!q.success) {
        return HermesInboundResponseSchema.parse({ ok: false, text: `查询参数不对：${firstZodMsg(q.error)}` });
      }
      const { name, category, robot } = q.data;
      let matched = snapshot.partTypes;
      if (name) {
        const lower = name.toLowerCase();
        matched = matched.filter((p) => p.name.toLowerCase().includes(lower) || p.partNumber.toLowerCase().includes(lower));
      }
      if (category) {
        const lower = category.toLowerCase();
        matched = matched.filter((p) => p.category.toLowerCase().includes(lower));
      }
      if (robot) {
        const res = resources.find((r) => r.displayCode?.toLowerCase() === robot.toLowerCase() || r.name.toLowerCase().includes(robot.toLowerCase()) || r.robotTarget.toLowerCase() === robot.toLowerCase());
        if (!res) {
          return HermesInboundResponseSchema.parse({ ok: false, text: `没找到叫「${robot}」的机器人。` });
        }
        matched = matched.filter((p) => p.allocations.some((a) => a.resourceId === res.id && (a.used > 0 || a.reserved > 0)));
        if (matched.length === 0) {
          return HermesInboundResponseSchema.parse({ ok: true, text: `${res.displayCode ?? res.name} 上没有装配任何零件。` });
        }
        const lines = matched.map((p) => {
          const alloc = p.allocations.find((a) => a.resourceId === res!.id)!;
          return `  ${p.name}(${p.partNumber}): 已装${alloc.used} 预留${alloc.reserved}`;
        });
        return HermesInboundResponseSchema.parse({ ok: true, text: `${res.displayCode ?? res.name} 装配清单：\n${lines.join('\n')}` });
      }
      if (matched.length === 0) {
        const hint = name ? `没找到叫「${name}」的件。` : category ? `类别「${category}」下没有件。` : '没有匹配的零件。';
        return HermesInboundResponseSchema.parse({ ok: false, text: hint });
      }
      const lines = matched.slice(0, 20).map((p) => {
        const usedTotal = p.allocations.reduce((s, a) => s + a.used + a.reserved, 0);
        const idle = p.totalQuantity - usedTotal;
        return `  ${p.name}(${p.partNumber}): 总${p.totalQuantity} 闲置${idle} [${p.category}]`;
      });
      const suffix = matched.length > 20 ? `\n  …还有${matched.length - 20}条` : '';
      return HermesInboundResponseSchema.parse({ ok: true, text: `库存查询结果（${matched.length}条）：\n${lines.join('\n')}${suffix}` });
    }

    if (command === 'inv-record') {
      const r = HermesInvRecordArgsSchema.safeParse(args);
      if (!r.success) {
        return HermesInboundResponseSchema.parse({ ok: false, text: `记账参数不对：${firstZodMsg(r.error)}` });
      }
      const { name, action, quantity, from, to, note } = r.data;
      const lower = name.toLowerCase();
      const partType = snapshot.partTypes.find((p) => p.name.toLowerCase() === lower || p.partNumber.toLowerCase() === lower) ?? snapshot.partTypes.find((p) => p.name.toLowerCase().includes(lower) || p.partNumber.toLowerCase().includes(lower));
      if (!partType) {
        return HermesInboundResponseSchema.parse({ ok: false, text: `没找到叫「${name}」的件，无法记账。` });
      }
      const findResource = (label: string) => resources.find((res) => res.displayCode?.toLowerCase() === label.toLowerCase() || res.name.toLowerCase().includes(label.toLowerCase()) || res.robotTarget.toLowerCase() === label.toLowerCase());
      try {
        if (action === 'add') {
          await invStore.recordPartAction({ projectId: partType.projectId, partTypeId: partType.id, trackedPartId: null, kind: 'restock', quantityDelta: quantity, fromHolder: null, toHolder: null, note: note ?? `Hermes 入库 +${quantity}`, source: 'hermes' });
          return HermesInboundResponseSchema.parse({ ok: true, text: `已记录：${partType.name} 入库 +${quantity}，当前总数 ${partType.totalQuantity + quantity}。` });
        }
        if (action === 'subtract') {
          await invStore.recordPartAction({ projectId: partType.projectId, partTypeId: partType.id, trackedPartId: null, kind: 'damage', quantityDelta: -quantity, fromHolder: null, toHolder: null, note: note ?? `Hermes 损耗 -${quantity}`, source: 'hermes' });
          return HermesInboundResponseSchema.parse({ ok: true, text: `已记录：${partType.name} 损耗 -${quantity}，当前总数 ${partType.totalQuantity - quantity}。` });
        }
        const fromRes = findResource(from!);
        const toRes = findResource(to!);
        if (!fromRes) return HermesInboundResponseSchema.parse({ ok: false, text: `没找到叫「${from}」的机器人。` });
        if (!toRes) return HermesInboundResponseSchema.parse({ ok: false, text: `没找到叫「${to}」的机器人。` });
        const transferNote = note ?? `Hermes 调拨 ${fromRes.displayCode ?? fromRes.name}→${toRes.displayCode ?? toRes.name}`;
        await invStore.recordPartAction({ projectId: partType.projectId, partTypeId: partType.id, trackedPartId: null, kind: 'dismount', quantityDelta: -quantity, fromHolder: fromRes.id, toHolder: null, note: transferNote, source: 'hermes' });
        try {
          await invStore.recordPartAction({ projectId: partType.projectId, partTypeId: partType.id, trackedPartId: null, kind: 'mount', quantityDelta: quantity, fromHolder: null, toHolder: toRes.id, note: transferNote, source: 'hermes' });
        } catch (mountErr) {
          await invStore.recordPartAction({ projectId: partType.projectId, partTypeId: partType.id, trackedPartId: null, kind: 'mount', quantityDelta: quantity, fromHolder: null, toHolder: fromRes.id, note: `补偿回滚：${transferNote}`, source: 'hermes' }).catch(() => {});
          throw mountErr;
        }
        return HermesInboundResponseSchema.parse({ ok: true, text: `已记录：${partType.name} ×${quantity} 从 ${fromRes.displayCode ?? fromRes.name} 调到 ${toRes.displayCode ?? toRes.name}。` });
      } catch (err) {
        if (err instanceof InvalidPartActionError) {
          return HermesInboundResponseSchema.parse({ ok: false, text: `记账失败：${err.message}` });
        }
        throw err;
      }
    }

    void reply.code(400).send({ detail: `未知命令: ${command}` });
  });
}
