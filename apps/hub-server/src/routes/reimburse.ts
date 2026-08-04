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
  PartAction,
  PartType,
  ReimburseEntry,
} from '@teamhub/hub-contracts';
import { isSuperAdmin } from '../authz.js';
import type { GovStore, InvStore } from '../store/gov-store.js';
import type { ReimburseStore } from '../store/reimburse-store.js';
import { parseBody, requireActor, requireSuperAdmin } from './helpers.js';

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
  invStore: InvStore;
  reimburseStore: ReimburseStore;
  identityMode: IdentityMode;
}

/**
 * 防重复入库的记账方式（计划拍板「选简单可靠的」）：**已入库量不入条目、不落新字段，唯一真相 =
 * 库存动作日志**——`kind='restock'` 且 `reimburseEntryId=条目id` 的动作，note 前缀
 * `reimb-stock-in:<itemIndex>` 钉明细行号。每条明细行剩余可入库量 = 条目行 quantity − 同行动作
 * quantityDelta 合计。选 note 关联而非条目加 stockIn 记录字段的原因：① contracts 已冻结（条目
 * 加字段要动三包）；② 动作日志 append-only 永不改，与库存账天然一致，不会出现「条目记了入库但
 * 库存没动」的双写漂移；③ 代价只是 note 前缀约定，解析失败（老数据/手改）的动作不计入 = 保守放行
 * 入库但库存账永远正确（防重复是体验层防线，库存正确性是账本层保证）。
 */
const STOCK_IN_NOTE_PREFIX = 'reimb-stock-in:';

function stockInNote(itemIndex: number, itemName: string): string {
  return `${STOCK_IN_NOTE_PREFIX}${itemIndex} 报账入库·${itemName}`;
}

function parseStockInItemIndex(note: string | null): number | null {
  if (!note || !note.startsWith(STOCK_IN_NOTE_PREFIX)) {
    return null;
  }
  const m = /^(\d+)\s/.exec(note.slice(STOCK_IN_NOTE_PREFIX.length));
  return m ? Number(m[1]) : null;
}

export function registerReimburseRoutes(
  app: FastifyInstance,
  deps: ReimburseRouteDeps,
): void {
  const { store, invStore, reimburseStore, identityMode } = deps;

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

  /**
   * 入库联动（计划阶段 2 核心）：物资类条目确认入库 → 服务端内部调 invStore（库存写端点
   * 本是超管门，成员自购入库必须走本端点代行）。鉴权 = 条目本人或超管。
   * 先全量校验（行号存在 + 剩余量够 + 目标件合法）再落账，任一非法整批 400、不落半批。
   */
  app.post('/api/reimburse/entries/:id/stock-in', async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await reimburseStore.getEntry(id);
    if (!entry) {
      void reply.code(404).send({ detail: `未知报账条目: ${id}` });
      return;
    }
    const actor = requireActor(request, reply, undefined, '入库确认须先登录');
    if (!actor) return;
    if (!(await isOwnerOrAdmin(entry, actor.id))) {
      void reply.code(403).send({ detail: '只有条目本人或管理员能确认入库' });
      return;
    }
    if (entry.kind !== 'goods') {
      void reply.code(400).send({ detail: '纯费用条目无物资可入库' });
      return;
    }
    const parsed = parseBody(StockInRequestSchema, request, reply);
    if (!parsed) return;

    const snapshot = await invStore.getInventorySnapshot();

    // 每行已入库量（唯一真相 = 动作日志，见文件头 STOCK_IN_NOTE_PREFIX 注释）。
    const stockedByLine = new Map<number, number>();
    for (const a of snapshot.actions) {
      if (a.kind !== 'restock' || a.reimburseEntryId !== entry.id) {
        continue;
      }
      const idx = parseStockInItemIndex(a.note);
      if (idx === null) {
        continue;
      }
      stockedByLine.set(idx, (stockedByLine.get(idx) ?? 0) + Math.abs(a.quantityDelta));
    }

    // ── 第一遍：全量校验（先算后写，任一非法整批 400、不落半批）─────────────────
    const requestedByLine = new Map<number, number>();
    for (const line of parsed.lines) {
      const item = entry.items[line.itemIndex];
      if (!item) {
        void reply
          .code(400)
          .send({ detail: `明细行 #${line.itemIndex} 不存在（条目共 ${entry.items.length} 行）` });
        return;
      }
      const requested = (requestedByLine.get(line.itemIndex) ?? 0) + line.quantity;
      requestedByLine.set(line.itemIndex, requested);
      const remaining = item.quantity - (stockedByLine.get(line.itemIndex) ?? 0);
      if (requested > remaining) {
        void reply.code(400).send({
          detail: `明细行「${item.name}」剩余可入库 ${remaining}，本次累计申请 ${requested}（防重复入库）`,
        });
        return;
      }
      const target = line.target; // 提成 const 局部：'in' 收窄在闭包（.some 回调）内才保得住
      if ('partTypeId' in target) {
        if (!snapshot.partTypes.some((p) => p.id === target.partTypeId)) {
          void reply.code(400).send({ detail: `未知件: ${target.partTypeId}` });
          return;
        }
      } else {
        const np = target.newPart;
        if (snapshot.partTypes.some((p) => p.partNumber === np.partNumber)) {
          void reply
            .code(400)
            .send({ detail: `件号 ${np.partNumber} 已存在，请改用 partTypeId 入库` });
          return;
        }
      }
    }
    // 同批两个 newPart 同件号 → 第二个会撞第一个新建的，同样拒（先算后写覆盖批内冲突）。
    const newPartNumbers = parsed.lines
      .map((l) => ('newPart' in l.target ? l.target.newPart.partNumber : null))
      .filter((p): p is string => p !== null);
    if (new Set(newPartNumbers).size !== newPartNumbers.length) {
      void reply.code(400).send({ detail: '同批新建件号重复' });
      return;
    }

    // ── 第二遍：落账（newPart 先建 0 库存件，数量一律经 restock 动作入账——
    //    来源构成 derivePartAcquisition 与动作日志天然一致）─────────────────────
    const actions: PartAction[] = [];
    for (const line of parsed.lines) {
      let partTypeId: string;
      if ('partTypeId' in line.target) {
        partTypeId = line.target.partTypeId;
      } else {
        const np = line.target.newPart;
        const created = await invStore.upsertPartType({
          projectId: entry.projectId,
          partNumber: np.partNumber,
          name: np.name,
          category: np.category,
          unit: np.unit,
          trackIndividually: false,
          totalQuantity: 0, // 数量走下面的 restock 动作，不直接建底（账全过动作日志）
          allocations: [],
          lowStockThreshold: 0,
        });
        partTypeId = created.id;
      }
      const item = entry.items[line.itemIndex];
      const action = await invStore.recordPartAction({
        projectId: entry.projectId,
        partTypeId,
        trackedPartId: null,
        kind: 'restock',
        quantityDelta: line.quantity,
        fromHolder: null,
        toHolder: null,
        note: stockInNote(line.itemIndex, item.name), // 前缀钉行号，防重复入库的记账键（见文件头）
        acquisition: 'selfPurchase', // 报账联动恒为垫付自购；赞助入库走库存自己的 restock 表单
        reimburseEntryId: entry.id,
        source: 'human',
      });
      actions.push(action);
    }

    const after = await invStore.getInventorySnapshot();
    const touched = new Set(actions.map((a) => a.partTypeId));
    const partTypes: PartType[] = after.partTypes.filter((p) => touched.has(p.id));
    void reply.code(201);
    return StockInResponseSchema.parse({ partTypes, actions });
  });
}
