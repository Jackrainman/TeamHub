import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  CreateReimburseEntryResponseSchema,
  ReimburseBatchResponseSchema,
  ReimburseBatchesResponseSchema,
  ReimburseEntriesResponseSchema,
  GetReimburseProfileResponseSchema,
  StockInContextResponseSchema,
  StockInResponseSchema,
  UpdateReimburseEntryResponseSchema,
  governanceScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  GovernanceSnapshot,
  Group,
  InventorySnapshot,
  Member,
} from '@teamhub/hub-contracts';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryPmRepository } from './support/inmemory-gov-store.js';
import { InMemoryInvStore } from './support/inmemory-inv-store.js';
import { InMemoryReimburseStore } from './support/inmemory-reimburse-store.js';

/**
 * 报账域路由端到端（REIMBURSE-PROC 一期，计划 taskmaster-impulse-steel 阶段 2）：
 *  - GET entries 服务端过滤（普通成员只见自己 / 超管见全部 / 未登录 401）；匿名模式回全量。
 *  - POST entries 钉 memberId=sessionActor（客户端给了一律覆盖）+ 发票号查重 409（空号跳过）。
 *  - PATCH 本人或超管（越权 403 / 未知 404 / 悬空批次 400）。
 *  - 批次三端点超管门（普通成员 403）+ clamp collecting + 状态流转 + 聚合 summaries（无按人明细）。
 *  - stock-in 联动落账（新件创建 + restock 带 acquisition/reimburseEntryId）+ 防重复入库 400
 *    + expense 条目 400 + 越权 403。
 * 身份搭建照 inventory-import-route.test.ts 先例：identityMode='identity' + POST /api/session 免 PIN 登录。
 */

const GRP_MECH = {
  id: 'grp-mech',
  seasonId: 'season-robocon-2026',
  parentGroupId: null,
  name: '机械',
  kind: 'mechanical',
} as const;

function member(over: Partial<Member> & Pick<Member, 'id' | 'displayName'>): Member {
  return {
    role: 'member',
    grade: 'sophomore',
    groupId: 'grp-mech',
    status: 'idle',
    currentTaskId: null,
    updatedBy: 'console',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const MEMBERS: Member[] = [
  member({ id: 'm-a', displayName: '成员A' }),
  member({ id: 'm-b', displayName: '成员B' }),
  member({ id: 'm-admin', displayName: '管理员', projectManager: true }),
];

function seedGov(): GovernanceSnapshot {
  return {
    ...governanceScenarioFixture,
    groups: [GRP_MECH as Group],
    members: MEMBERS.map((m) => ({ ...m })),
    tasks: [],
    dependencies: [],
    needs: [],
    knowledgeNodes: [],
    taskKnowledgeTags: [],
  };
}

/** 干净库存种子：一件既有件（partTypeId 入库目标）+ 空动作日志。 */
function seedInv(): InventorySnapshot {
  return {
    projectId: 'prj-robots',
    partTypes: [
      {
        id: 'parttype-m3',
        projectId: 'prj-robots',
        partNumber: 'M3x8',
        name: 'M3×8 螺丝',
        category: 'fastener',
        unit: '个',
        trackIndividually: false,
        totalQuantity: 50,
        allocations: [],
        lowStockThreshold: 10,
        lastCountedAt: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    trackedParts: [],
    actions: [],
  };
}

/** 身份模式登录，回带 session cookie（member 无 pinHash 免 PIN）。 */
async function login(app: FastifyInstance, memberId: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/session', payload: { memberId } });
  const cookie = res.cookies.find((c) => c.name === 'teamhub_session');
  expect(cookie?.value).toBeTruthy();
  return `teamhub_session=${cookie!.value}`;
}

function buildTestApp() {
  const invStore = new InMemoryInvStore(seedInv());
  const reimburseStore = new InMemoryReimburseStore();
  const app = buildTestHubServer({
    store: new InMemoryPmRepository(seedGov()),
    inventoryRepository: invStore,
    reimburseStore,
    identityMode: 'identity',
  });
  return { app, invStore, reimburseStore };
}

let invoiceSeq = 0;
/** goods 条目写体（每次调用给唯一发票号，防用例间互撞查重）。 */
function goodsEntryPayload(over: Record<string, unknown> = {}) {
  invoiceSeq += 1;
  return {
    projectId: 'prj-robots',
    kind: 'goods',
    invoiceNo: `20260701${String(invoiceSeq).padStart(12, '0')}`,
    invoiceDate: '2026-07-01',
    seller: '某某五金店',
    purchaserName: '哈尔滨工业大学',
    purchaserTaxNo: '12100000400000456B',
    recognitionSource: 'xml',
    totalAmountFen: 2500,
    items: [
      { name: 'M3×8 螺丝', unit: '个', quantity: 20, unitPriceFen: 100, amountFen: 2000 },
      { name: '热缩管', unit: '米', quantity: 2, unitPriceFen: 250, amountFen: 500 },
    ],
    actualItemName: null,
    materials: { paymentShot: false, inspection: false },
    note: null,
    ...over,
  };
}

async function createEntry(
  app: FastifyInstance,
  cookie: string,
  over: Record<string, unknown> = {},
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/reimburse/entries',
    headers: { cookie },
    payload: goodsEntryPayload(over),
  });
  expect(res.statusCode).toBe(201);
  return CreateReimburseEntryResponseSchema.parse(res.json()).entry;
}

describe('GET/POST /api/reimburse/entries — 过滤与查重', () => {
  test('POST 钉 memberId=sessionActor（客户端塞 memberId 一律覆盖）；GET 普通成员只见自己、超管见全部、未登录 401', async () => {
    const { app } = buildTestApp();
    try {
      const cookieA = await login(app, 'm-a');
      const cookieB = await login(app, 'm-b');
      const cookieAdmin = await login(app, 'm-admin');

      // 客户端塞 memberId:'m-b' → zod 剥 unknown 键 + server 钉 sessionActor，落库必为 m-a
      const entryA = await createEntry(app, cookieA, { memberId: 'm-b' });
      expect(entryA.memberId).toBe('m-a');
      expect(entryA.id).toMatch(/^reimb-new-/);
      expect(entryA.batchId).toBeNull();
      await createEntry(app, cookieB);

      const asA = await app.inject({
        method: 'GET',
        url: '/api/reimburse/entries',
        headers: { cookie: cookieA },
      });
      expect(asA.statusCode).toBe(200);
      const listA = ReimburseEntriesResponseSchema.parse(asA.json());
      expect(listA.entries).toHaveLength(1);
      expect(listA.entries[0].memberId).toBe('m-a');

      const asAdmin = await app.inject({
        method: 'GET',
        url: '/api/reimburse/entries',
        headers: { cookie: cookieAdmin },
      });
      expect(ReimburseEntriesResponseSchema.parse(asAdmin.json()).entries).toHaveLength(2);

      const anon = await app.inject({ method: 'GET', url: '/api/reimburse/entries' });
      expect(anon.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  test('发票号查重：同号再录 → 409；空号草稿跳过查重（两条都 201）', async () => {
    const { app } = buildTestApp();
    try {
      const cookieA = await login(app, 'm-a');
      const cookieB = await login(app, 'm-b');
      const payload = goodsEntryPayload();
      const first = await app.inject({
        method: 'POST',
        url: '/api/reimburse/entries',
        headers: { cookie: cookieA },
        payload,
      });
      expect(first.statusCode).toBe(201);
      // 同号换人也撞（全库唯一，tidoc 同款防重复防护）
      const dup = await app.inject({
        method: 'POST',
        url: '/api/reimburse/entries',
        headers: { cookie: cookieB },
        payload,
      });
      expect(dup.statusCode).toBe(409);
      expect(dup.json().detail).toContain('已录入过');

      const blank1 = await app.inject({
        method: 'POST',
        url: '/api/reimburse/entries',
        headers: { cookie: cookieA },
        payload: goodsEntryPayload({ invoiceNo: null }),
      });
      const blank2 = await app.inject({
        method: 'POST',
        url: '/api/reimburse/entries',
        headers: { cookie: cookieA },
        payload: goodsEntryPayload({ invoiceNo: null }),
      });
      expect(blank1.statusCode).toBe(201);
      expect(blank2.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });
});

describe('PATCH /api/reimburse/entries/:id — 本人或超管', () => {
  test('本人改材料 checklist → 200；他人 → 403；超管 → 200；未知条目 → 404；悬空批次 → 400', async () => {
    const { app } = buildTestApp();
    try {
      const cookieA = await login(app, 'm-a');
      const cookieB = await login(app, 'm-b');
      const cookieAdmin = await login(app, 'm-admin');
      const entry = await createEntry(app, cookieA);

      const forbidden = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/entries/${entry.id}`,
        headers: { cookie: cookieB },
        payload: { note: '越权改' },
      });
      expect(forbidden.statusCode).toBe(403);

      const own = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/entries/${entry.id}`,
        headers: { cookie: cookieA },
        payload: { materials: { paymentShot: true, inspection: false } },
      });
      expect(own.statusCode).toBe(200);
      const patched = UpdateReimburseEntryResponseSchema.parse(own.json()).entry;
      expect(patched.materials.paymentShot).toBe(true);
      expect(patched.materials.inspection).toBe(false);

      const byAdmin = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/entries/${entry.id}`,
        headers: { cookie: cookieAdmin },
        payload: { note: '财务已核' },
      });
      expect(byAdmin.statusCode).toBe(200);

      const missing = await app.inject({
        method: 'PATCH',
        url: '/api/reimburse/entries/reimb-new-999',
        headers: { cookie: cookieAdmin },
        payload: { note: 'x' },
      });
      expect(missing.statusCode).toBe(404);

      const danglingBatch = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/entries/${entry.id}`,
        headers: { cookie: cookieA },
        payload: { batchId: 'rbatch-new-999' },
      });
      expect(danglingBatch.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe('/api/reimburse/batches — 超管门 + 状态流转 + 聚合', () => {
  test('普通成员 GET/POST/PATCH 全 403；超管建批 clamp collecting、流转 submitted、聚合 summaries 无按人明细', async () => {
    const { app } = buildTestApp();
    try {
      const cookieA = await login(app, 'm-a');
      const cookieAdmin = await login(app, 'm-admin');

      const getAsMember = await app.inject({
        method: 'GET',
        url: '/api/reimburse/batches',
        headers: { cookie: cookieA },
      });
      expect(getAsMember.statusCode).toBe(403);
      const postAsMember = await app.inject({
        method: 'POST',
        url: '/api/reimburse/batches',
        headers: { cookie: cookieA },
        payload: { projectId: 'prj-robots', name: '2026-08 第一批' },
      });
      expect(postAsMember.statusCode).toBe(403);

      const created = await app.inject({
        method: 'POST',
        url: '/api/reimburse/batches',
        headers: { cookie: cookieAdmin },
        payload: { projectId: 'prj-robots', name: '2026-08 第一批' },
      });
      expect(created.statusCode).toBe(201);
      const batch = ReimburseBatchResponseSchema.parse(created.json()).batch;
      expect(batch.id).toMatch(/^rbatch-new-/);
      expect(batch.status).toBe('collecting'); // clamp：客户端给不了 status

      const patchAsMember = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/batches/${batch.id}`,
        headers: { cookie: cookieA },
        payload: { status: 'submitted' },
      });
      expect(patchAsMember.statusCode).toBe(403);

      // 条目装批（本人 PATCH）后聚合：count/总额/未齐计数，无按人明细
      const entry = await createEntry(app, cookieA);
      const assign = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/entries/${entry.id}`,
        headers: { cookie: cookieA },
        payload: { batchId: batch.id },
      });
      expect(assign.statusCode).toBe(200);

      const blocked = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/batches/${batch.id}`,
        headers: { cookie: cookieAdmin },
        payload: { status: 'submitted' },
      });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().code).toBe('REIMBURSE_BATCH_BLOCKED');

      await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/entries/${entry.id}`,
        headers: { cookie: cookieA },
        payload: { materials: { paymentShot: true, inspection: true } },
      });
      const flowed = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/batches/${batch.id}`,
        headers: { cookie: cookieAdmin },
        payload: { status: 'submitted' },
      });
      expect(flowed.statusCode).toBe(200);
      expect(ReimburseBatchResponseSchema.parse(flowed.json()).batch.status).toBe('submitted');

      const list = await app.inject({
        method: 'GET',
        url: '/api/reimburse/batches',
        headers: { cookie: cookieAdmin },
      });
      const body = ReimburseBatchesResponseSchema.parse(list.json());
      expect(body.batches).toHaveLength(1);
      const summary = body.summaries.find((s) => s.batchId === batch.id);
      expect(summary).toMatchObject({
        count: 1,
        totalAmountFen: 2500,
        incompleteCount: 0,
        financial: { gross: { count: 1 }, eligible: { count: 1 }, blocked: { count: 0 } },
      });
      expect(body.profile.expectedPurchaserName).toBe('哈尔滨工业大学');
      // I0：聚合体无 memberId 字面
      expect(JSON.stringify(body.summaries)).not.toContain('memberId');

      const missing = await app.inject({
        method: 'PATCH',
        url: '/api/reimburse/batches/rbatch-new-999',
        headers: { cookie: cookieAdmin },
        payload: { status: 'reimbursed' },
      });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/reimburse/entries/:id/stock-in — 入库联动', () => {
  test('新件创建 + 既有件补量，restock 带 acquisition/reimburseEntryId；剩余量递减、超量 400（防重复入库）', async () => {
    const { app, invStore } = buildTestApp();
    try {
      const cookieA = await login(app, 'm-a');
      const entry = await createEntry(app, cookieA);

      // 行0 既有件入 10（总数 20），行1 新建件入 2
      const res = await app.inject({
        method: 'POST',
        url: `/api/reimburse/entries/${entry.id}/stock-in`,
        headers: { cookie: cookieA },
        payload: {
          lines: [
            { itemIndex: 0, quantity: 10, target: { partTypeId: 'parttype-m3' } },
            {
              itemIndex: 1,
              quantity: 2,
              target: {
                newPart: { partNumber: 'RSG-2MM', name: '热缩管', category: 'wire', unit: '米' },
              },
            },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = StockInResponseSchema.parse(res.json());
      expect(body.actions).toHaveLength(2);
      for (const action of body.actions) {
        expect(action.kind).toBe('restock');
        expect(action.acquisition).toBe('selfPurchase');
        expect(action.reimburseEntryId).toBe(entry.id);
        expect(action.recordedBy.source).toBe('human');
      }
      const m3 = body.partTypes.find((p) => p.id === 'parttype-m3');
      expect(m3?.totalQuantity).toBe(60); // 50 + 10
      const newPart = body.partTypes.find((p) => p.partNumber === 'RSG-2MM');
      expect(newPart?.totalQuantity).toBe(2); // 建 0 + restock 2（量全走动作日志）
      expect(newPart?.id).toMatch(/^parttype-new-/);

      // 落库复核：结构字段是防重键，note 只做人类可读说明。
      const snap = await invStore.getInventorySnapshot();
      const linked = snap.actions.filter((a) => a.reimburseEntryId === entry.id);
      expect(linked).toHaveLength(2);
      expect(linked.find((a) => a.partTypeId === 'parttype-m3')?.reimburseItemIndex).toBe(0);
      expect(linked.find((a) => a.partTypeId === 'parttype-m3')?.note).toBe('报账入库·M3×8 螺丝');

      // 行0 剩余 10：申请 11 → 400（防重复入库）
      const over = await app.inject({
        method: 'POST',
        url: `/api/reimburse/entries/${entry.id}/stock-in`,
        headers: { cookie: cookieA },
        payload: { lines: [{ itemIndex: 0, quantity: 11, target: { partTypeId: 'parttype-m3' } }] },
      });
      expect(over.statusCode).toBe(400);
      expect(over.json().detail).toContain('防重复入库');
      expect(over.json().code).toBe('REIMBURSE_STOCK_QUANTITY_EXCEEDED');

      // 恰好入满剩余 10 → 201；再入 1 → 400
      const fill = await app.inject({
        method: 'POST',
        url: `/api/reimburse/entries/${entry.id}/stock-in`,
        headers: { cookie: cookieA },
        payload: { lines: [{ itemIndex: 0, quantity: 10, target: { partTypeId: 'parttype-m3' } }] },
      });
      expect(fill.statusCode).toBe(201);
      const again = await app.inject({
        method: 'POST',
        url: `/api/reimburse/entries/${entry.id}/stock-in`,
        headers: { cookie: cookieA },
        payload: { lines: [{ itemIndex: 0, quantity: 1, target: { partTypeId: 'parttype-m3' } }] },
      });
      expect(again.statusCode).toBe(400);
      const finalSnap = await invStore.getInventorySnapshot();
      expect(
        finalSnap.partTypes.find((p) => p.id === 'parttype-m3')?.totalQuantity,
      ).toBe(70); // 60 + 10，被拒的两次没落账
    } finally {
      await app.close();
    }
  });

  test('越权 403 / expense 条目 400 / 行号越界 400 / 未知件 400 / 件号撞既有 400', async () => {
    const { app } = buildTestApp();
    try {
      const cookieA = await login(app, 'm-a');
      const cookieB = await login(app, 'm-b');
      const entry = await createEntry(app, cookieA);

      const forbidden = await app.inject({
        method: 'POST',
        url: `/api/reimburse/entries/${entry.id}/stock-in`,
        headers: { cookie: cookieB },
        payload: { lines: [{ itemIndex: 0, quantity: 1, target: { partTypeId: 'parttype-m3' } }] },
      });
      expect(forbidden.statusCode).toBe(403);

      const expense = await createEntry(app, cookieA, { kind: 'expense', items: [] });
      const expenseRes = await app.inject({
        method: 'POST',
        url: `/api/reimburse/entries/${expense.id}/stock-in`,
        headers: { cookie: cookieA },
        payload: { lines: [{ itemIndex: 0, quantity: 1, target: { partTypeId: 'parttype-m3' } }] },
      });
      expect(expenseRes.statusCode).toBe(400);
      expect(expenseRes.json().detail).toContain('纯费用');

      const badIndex = await app.inject({
        method: 'POST',
        url: `/api/reimburse/entries/${entry.id}/stock-in`,
        headers: { cookie: cookieA },
        payload: { lines: [{ itemIndex: 9, quantity: 1, target: { partTypeId: 'parttype-m3' } }] },
      });
      expect(badIndex.statusCode).toBe(400);

      const unknownPart = await app.inject({
        method: 'POST',
        url: `/api/reimburse/entries/${entry.id}/stock-in`,
        headers: { cookie: cookieA },
        payload: {
          lines: [{ itemIndex: 0, quantity: 1, target: { partTypeId: 'parttype-none' } }],
        },
      });
      expect(unknownPart.statusCode).toBe(400);
      expect(unknownPart.json().code).toBe('INVENTORY_PART_NOT_FOUND');

      const dupPartNumber = await app.inject({
        method: 'POST',
        url: `/api/reimburse/entries/${entry.id}/stock-in`,
        headers: { cookie: cookieA },
        payload: {
          lines: [
            {
              itemIndex: 0,
              quantity: 1,
              target: {
                newPart: { partNumber: 'M3x8', name: '螺丝', category: 'fastener', unit: '个' },
              },
            },
          ],
        },
      });
      expect(dupPartNumber.statusCode).toBe(400);
      expect(dupPartNumber.json().detail).toContain('已存在');

      // 以上全部 4xx：库存零变化（先算后写，不落半批）
      const entry404 = await app.inject({
        method: 'POST',
        url: '/api/reimburse/entries/reimb-new-999/stock-in',
        headers: { cookie: cookieA },
        payload: { lines: [{ itemIndex: 0, quantity: 1, target: { partTypeId: 'parttype-m3' } }] },
      });
      expect(entry404.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('报账 profile 与窄入库上下文', () => {
  test('profile 默认值可读且仅超管可改；context 只聚合当前可见条目与候选投影', async () => {
    const { app } = buildTestApp();
    try {
      const cookieA = await login(app, 'm-a');
      const cookieB = await login(app, 'm-b');
      const cookieAdmin = await login(app, 'm-admin');
      const entryA = await createEntry(app, cookieA);
      await createEntry(app, cookieB);

      const profile = await app.inject({ method: 'GET', url: '/api/reimburse/profile' });
      expect(GetReimburseProfileResponseSchema.parse(profile.json()).profile)
        .toMatchObject({ expectedPurchaserName: '哈尔滨工业大学' });
      const forbidden = await app.inject({
        method: 'PUT',
        url: '/api/reimburse/profile',
        headers: { cookie: cookieA },
        payload: { expectedPurchaserName: '', expectedPurchaserTaxNo: '' },
      });
      expect(forbidden.statusCode).toBe(403);
      const updated = await app.inject({
        method: 'PUT',
        url: '/api/reimburse/profile',
        headers: { cookie: cookieAdmin },
        payload: { expectedPurchaserName: '', expectedPurchaserTaxNo: '' },
      });
      expect(updated.statusCode).toBe(200);

      await app.inject({
        method: 'POST',
        url: `/api/reimburse/entries/${entryA.id}/stock-in`,
        headers: { cookie: cookieA },
        payload: { lines: [{ itemIndex: 0, quantity: 1, target: { partTypeId: 'parttype-m3' } }] },
      });
      const context = await app.inject({
        method: 'GET',
        url: '/api/reimburse/stock-in-context',
        headers: { cookie: cookieA },
      });
      const body = StockInContextResponseSchema.parse(context.json());
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0]).toEqual({
        entryId: entryA.id,
        stockedLines: [{ itemIndex: 0, quantity: 1 }],
      });
      expect(body.partTypes[0]).not.toHaveProperty('totalQuantity');
      expect(JSON.stringify(body)).not.toContain('m-b');
    } finally {
      await app.close();
    }
  });
});

describe('匿名模式（identityMode=anonymous）', () => {
  test('GET entries 回全量（无身份概念，与匿名可读一切一致）；POST → 400 须登录；批次端点 403', async () => {
    const app = buildTestHubServer({
      store: new InMemoryPmRepository(seedGov()),
      inventoryRepository: new InMemoryInvStore(seedInv()),
      reimburseStore: new InMemoryReimburseStore(),
    });
    try {
      const list = await app.inject({ method: 'GET', url: '/api/reimburse/entries' });
      expect(list.statusCode).toBe(200);
      expect(ReimburseEntriesResponseSchema.parse(list.json()).entries).toHaveLength(0);

      const post = await app.inject({
        method: 'POST',
        url: '/api/reimburse/entries',
        payload: goodsEntryPayload(),
      });
      expect(post.statusCode).toBe(400);

      const batches = await app.inject({ method: 'GET', url: '/api/reimburse/batches' });
      expect(batches.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

describe('批次不可变快照与状态机（REIMBURSE-DEFECTS #2/#4）', () => {
  test('提交后：条目归属/材料冻结、装批拒绝、改名拒绝；状态只允许顺向推进', async () => {
    const { app } = buildTestApp();
    try {
      const cookieA = await login(app, 'm-a');
      const cookieAdmin = await login(app, 'm-admin');

      const created = await app.inject({
        method: 'POST',
        url: '/api/reimburse/batches',
        headers: { cookie: cookieAdmin },
        payload: { projectId: 'prj-robots', name: '2026-08 锁批' },
      });
      const batch = ReimburseBatchResponseSchema.parse(created.json()).batch;

      const entry = await createEntry(app, cookieA);
      await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/entries/${entry.id}`,
        headers: { cookie: cookieA },
        payload: {
          batchId: batch.id,
          materials: { paymentShot: true, inspection: true },
        },
      });
      const submitted = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/batches/${batch.id}`,
        headers: { cookie: cookieAdmin },
        payload: { status: 'submitted' },
      });
      expect(submitted.statusCode).toBe(200);

      // 提交后移出批次 → 409 快照锁
      const detach = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/entries/${entry.id}`,
        headers: { cookie: cookieA },
        payload: { batchId: null },
      });
      expect(detach.statusCode).toBe(409);
      expect(detach.json().code).toBe('REIMBURSE_BATCH_LOCKED');

      // 提交后改材料 → 409
      const editMaterials = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/entries/${entry.id}`,
        headers: { cookie: cookieA },
        payload: { materials: { paymentShot: false, inspection: false } },
      });
      expect(editMaterials.statusCode).toBe(409);

      // 装进已提交批次 → 409
      const other = await createEntry(app, cookieA);
      const attach = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/entries/${other.id}`,
        headers: { cookie: cookieA },
        payload: { batchId: batch.id },
      });
      expect(attach.statusCode).toBe(409);
      expect(attach.json().code).toBe('REIMBURSE_BATCH_LOCKED');

      // 提交后改名 → 409；回退 collecting → 409 状态机
      const rename = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/batches/${batch.id}`,
        headers: { cookie: cookieAdmin },
        payload: { name: '改名' },
      });
      expect(rename.statusCode).toBe(409);
      const back = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/batches/${batch.id}`,
        headers: { cookie: cookieAdmin },
        payload: { status: 'collecting' },
      });
      expect(back.statusCode).toBe(409);
      expect(back.json().code).toBe('REIMBURSE_BATCH_TRANSITION');

      // 顺向推进 submitted → reimbursed 放行；之后一切状态转移拒绝
      const done = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/batches/${batch.id}`,
        headers: { cookie: cookieAdmin },
        payload: { status: 'reimbursed' },
      });
      expect(done.statusCode).toBe(200);
      const reopen = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/batches/${batch.id}`,
        headers: { cookie: cookieAdmin },
        payload: { status: 'submitted' },
      });
      expect(reopen.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });

  test('跳级拒绝：collecting 不能直达 reimbursed', async () => {
    const { app } = buildTestApp();
    try {
      const cookieAdmin = await login(app, 'm-admin');
      const created = await app.inject({
        method: 'POST',
        url: '/api/reimburse/batches',
        headers: { cookie: cookieAdmin },
        payload: { projectId: 'prj-robots', name: '跳级批' },
      });
      const batch = ReimburseBatchResponseSchema.parse(created.json()).batch;
      const skip = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/batches/${batch.id}`,
        headers: { cookie: cookieAdmin },
        payload: { status: 'reimbursed' },
      });
      expect(skip.statusCode).toBe(409);
      expect(skip.json().code).toBe('REIMBURSE_BATCH_TRANSITION');
      // collecting 阶段改名仍放行
      const rename = await app.inject({
        method: 'PATCH',
        url: `/api/reimburse/batches/${batch.id}`,
        headers: { cookie: cookieAdmin },
        payload: { name: '跳级批·改' },
      });
      expect(rename.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
