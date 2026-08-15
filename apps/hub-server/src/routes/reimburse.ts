import type { FastifyInstance } from 'fastify';
import {
  CreateReimburseBatchRequestSchema,
  CreateReimburseEntryRequestSchema,
  CreateReimburseEntryResponseSchema,
  ReimburseBatchResponseSchema,
  ReimburseBatchesResponseSchema,
  ReimburseEntriesResponseSchema,
  StockInRequestSchema,
  StockInResponseSchema,
  UpdateReimburseBatchRequestSchema,
  UpdateReimburseEntryRequestSchema,
  UpdateReimburseEntryResponseSchema,
  deriveBatchSummary,
} from '@teamhub/hub-contracts';
import type {
  IdentityMode,
  ReimburseEntry,
} from '@teamhub/hub-contracts';
import { isSuperAdmin } from '../authz.js';
import type { GovStore } from '../store/gov-store.js';
import type { ReimburseStore } from '../store/reimburse-store.js';
import type { ReimburseStockInService } from '../application/reimburse-stock-in-service.js';
import {
  parseBody,
  requireActor,
  requireSuperAdmin,
  sendApplicationError,
} from './helpers.js';

/**
 * 报账域路由（REIMBURSE-PROC 一期，计划 taskmaster-impulse-steel 阶段 2）。
 *
 * 安全红线落到路由层：
 *  - **I0**：`GET /api/reimburse/entries` **过滤在服务端**——普通成员只回本人条目，超管回全部；
 *    身份模式未登录 → 401（条目是个人财务事实，fail-closed，不适用「匿名可读一切」）。
 *  - `POST /api/reimburse/entries`：memberId **钉 sessionActor**（写契约 omit memberId，客户端给了一律
 *    覆盖）；发票号非空且全库已存在 → 409（tidoc 同款防重复防护，空号草稿跳过查重）。
 *  - 批次三端点（GET/POST/PATCH）一律超管（一期财务视角=超管，独立 finance flag 留扩展位不做）；
 *    批次聚合只有 count/totalAmountFen/incompleteCount（deriveBatchSummary，**无按人明细、无排行**）。
 *  - 发票文件本体永不上传——本域只收结构化字段（contracts 层已无文件键）。
 *
 * 匿名模式（identityMode='anonymous'）：无身份概念，写端点 requireActor 一律 400「须先登录」、批次端点
 * 403（超管判定无身份可 anchoring）；GET entries 回全量（与匿名可读一切一致——匿名部署即全队互见，
 * 不设防而非藏漏）。真实部署用 identity 模式。
 */
export interface ReimburseRouteDeps {
  store: GovStore;
  reimburseStore: ReimburseStore;
  reimburseStockInService: ReimburseStockInService;
  identityMode: IdentityMode;
}

export function registerReimburseRoutes(
  app: FastifyInstance,
  deps: ReimburseRouteDeps,
): void {
  const { store, reimburseStore, reimburseStockInService, identityMode } = deps;

  /** 当前会话成员是否条目本人或超管（PATCH / stock-in 共用授权门，同 authz「布尔条件 + 403」范式）。 */
  const isOwnerOrAdmin = async (
    entry: ReimburseEntry,
    memberId: string,
  ): Promise<boolean> => {
    if (entry.memberId === memberId) {
      return true;
    }
    const members = (await store.getSnapshot()).members;
    return isSuperAdmin(members, memberId);
  };

  app.get('/api/reimburse/entries', async (request, reply) => {
    const entries = await reimburseStore.listEntries();
    if (identityMode !== 'identity') {
      // 匿名模式：无身份概念，与「匿名可读一切」一致回全量（见文件头）。
      return ReimburseEntriesResponseSchema.parse({ entries });
    }
    if (!request.identity) {
      void reply.code(401).send({ detail: '登录后查看报账条目' });
      return;
    }
    const members = (await store.getSnapshot()).members;
    const visible = isSuperAdmin(members, request.identity.memberId)
      ? entries
      : entries.filter((e) => e.memberId === request.identity!.memberId);
    return ReimburseEntriesResponseSchema.parse({ entries: visible });
  });

  app.post('/api/reimburse/entries', async (request, reply) => {
    const parsed = parseBody(CreateReimburseEntryRequestSchema, request, reply);
    if (!parsed) return;
    const actor = requireActor(request, reply, undefined, '报账录入须先登录');
    if (!actor) return;
    // 发票号查重（tidoc 同款防重复防护）：非空号全库已存在 → 409；空号草稿跳过。
    if (parsed.invoiceNo) {
      const dup = await reimburseStore.findEntryByInvoiceNo(parsed.invoiceNo);
      if (dup) {
        void reply
          .code(409)
          .send({ detail: `发票号 ${parsed.invoiceNo} 已录入过（条目 ${dup.id}），勿重复报账` });
        return;
      }
    }
    const entry = await reimburseStore.createEntry({
      ...parsed,
      memberId: actor.id, // I0 事实层：垫付人=本人，server 钉 sessionActor（客户端给了一律覆盖）
      batchId: null, // 新条目必未装批，装批走 PATCH
    });
    void reply.code(201);
    return CreateReimburseEntryResponseSchema.parse({ entry });
  });

  app.patch('/api/reimburse/entries/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await reimburseStore.getEntry(id);
    if (!entry) {
      void reply.code(404).send({ detail: `未知报账条目: ${id}` });
      return;
    }
    const actor = requireActor(request, reply, undefined, '改报账条目须先登录');
    if (!actor) return;
    if (!(await isOwnerOrAdmin(entry, actor.id))) {
      void reply.code(403).send({ detail: '只有条目本人或管理员能改报账条目' });
      return;
    }
    const parsed = parseBody(UpdateReimburseEntryRequestSchema, request, reply);
    if (!parsed) return;
    // 装批校验：batchId 非 null 时批次须存在（防挂到悬空批次）。
    if (parsed.batchId) {
      const batch = await reimburseStore.getBatch(parsed.batchId);
      if (!batch) {
        void reply.code(400).send({ detail: `未知批次: ${parsed.batchId}` });
        return;
      }
    }
    const updated = await reimburseStore.updateEntry(id, parsed);
    if (!updated) {
      void reply.code(404).send({ detail: `未知报账条目: ${id}` });
      return;
    }
    return UpdateReimburseEntryResponseSchema.parse({ entry: updated });
  });

  app.get('/api/reimburse/batches', async (request, reply) => {
    if (!(await requireSuperAdmin(store, request, reply))) return;
    const [batches, entries] = await Promise.all([
      reimburseStore.listBatches(),
      reimburseStore.listEntries(),
    ]);
    // I0：聚合只有 count/总额/未齐计数（deriveBatchSummary），无按人明细、无排行。
    const summaries = batches.map((b) => ({
      batchId: b.id,
      ...deriveBatchSummary(entries, b.id),
    }));
    return ReimburseBatchesResponseSchema.parse({ batches, summaries });
  });

  app.post('/api/reimburse/batches', async (request, reply) => {
    if (!(await requireSuperAdmin(store, request, reply))) return;
    const parsed = parseBody(CreateReimburseBatchRequestSchema, request, reply);
    if (!parsed) return;
    const batch = await reimburseStore.createBatch(parsed); // store clamp status='collecting'
    void reply.code(201);
    return ReimburseBatchResponseSchema.parse({ batch });
  });

  app.patch('/api/reimburse/batches/:id', async (request, reply) => {
    if (!(await requireSuperAdmin(store, request, reply))) return;
    const { id } = request.params as { id: string };
    const parsed = parseBody(UpdateReimburseBatchRequestSchema, request, reply);
    if (!parsed) return;
    const batch = await reimburseStore.updateBatch(id, parsed);
    if (!batch) {
      void reply.code(404).send({ detail: `未知批次: ${id}` });
      return;
    }
    return ReimburseBatchResponseSchema.parse({ batch });
  });

  /** 入库联动：route 只解析/认证/调用一个 application service/映射错误。 */
  app.post('/api/reimburse/entries/:id/stock-in', async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = requireActor(request, reply, undefined, '入库确认须先登录');
    if (!actor) return;
    const parsed = parseBody(StockInRequestSchema, request, reply);
    if (!parsed) return;
    const members = (await store.getSnapshot()).members;
    try {
      const result = reimburseStockInService.stockIn({
        entryId: id,
        lines: parsed.lines,
        actor,
        canManageAll: isSuperAdmin(members, actor.id),
      });
      void reply.code(201);
      return StockInResponseSchema.parse(result);
    } catch (error) {
      if (sendApplicationError(error, reply)) return reply;
      throw error;
    }
  });
}
