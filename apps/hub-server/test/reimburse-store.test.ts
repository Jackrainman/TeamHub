import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryReimburseStore } from './support/inmemory-reimburse-store.js';
import type {
  ReimburseEntryDraft,
  ReimburseRepository,
} from '../src/modules/reimburse/repository.js';
import { openUnifiedDb } from '../src/store/sqlite-unified.js';

/**
 * 测试 fake 与生产统一 SQLite 复跑同一条报销 Store 行为契约。
 */

function entryDraft(over: Partial<ReimburseEntryDraft> = {}): ReimburseEntryDraft {
  return {
    projectId: 'prj-robots',
    memberId: 'm-a',
    batchId: null,
    kind: 'goods',
    invoiceNo: '20260701000000000001',
    invoiceDate: '2026-07-01',
    seller: '某某五金店',
    purchaserName: '哈尔滨工业大学',
    purchaserTaxNo: '12100000400000456B',
    recognitionSource: 'xml',
    totalAmountFen: 2500,
    items: [
      { name: 'M3×8 螺丝', unit: '个', quantity: 20, unitPriceFen: 100, amountFen: 2000 },
    ],
    actualItemName: null,
    materials: { paymentShot: false, inspection: false },
    note: null,
    ...over,
  };
}

/** 三实现共用的一致性脚本：同一操作序列，断言逐字一致。 */
async function expectConsistentBehavior(store: ReimburseRepository): Promise<void> {
  expect(await store.listEntries()).toHaveLength(0);
  expect(await store.listBatches()).toHaveLength(0);
  expect(store.getProfile().expectedPurchaserName).toBe('哈尔滨工业大学');
  expect(store.updateProfile({ expectedPurchaserName: '测试抬头', expectedPurchaserTaxNo: '' }))
    .toEqual({ expectedPurchaserName: '测试抬头', expectedPurchaserTaxNo: '' });

  // createEntry：id reimb-new-N、补时间戳、memberId 原样落（路由钉入，store 不造）
  const e1 = await store.createEntry(entryDraft());
  expect(e1.id).toBe('reimb-new-1');
  expect(e1.createdAt).toMatch(/\dT\d/);
  expect(e1.memberId).toBe('m-a');
  const e2 = await store.createEntry(entryDraft({ invoiceNo: null, kind: 'expense', items: [] }));
  expect(e2.id).toBe('reimb-new-2');

  // 发票号查重：非空号命中、空号不命中、未录号不命中
  expect((await store.findEntryByInvoiceNo('20260701000000000001'))?.id).toBe(e1.id);
  expect(await store.findEntryByInvoiceNo('00000000000000000000')).toBeUndefined();

  // getEntry / listEntries
  expect((await store.getEntry(e1.id))?.seller).toBe('某某五金店');
  expect(await store.getEntry('reimb-new-999')).toBeUndefined();
  expect(await store.listEntries()).toHaveLength(2);

  // updateEntry：白名单 PATCH（材料 checklist / note / 装批），bump updatedAt；未知 id → undefined
  const patched = await store.updateEntry(e1.id, {
    materials: { paymentShot: true, inspection: false },
    note: '已补付款截图',
  });
  expect(patched?.materials.paymentShot).toBe(true);
  expect(patched?.note).toBe('已补付款截图');
  expect(patched?.invoiceNo).toBe('20260701000000000001'); // 未动字段保留
  expect(await store.updateEntry('reimb-new-999', { note: 'x' })).toBeUndefined();

  // createBatch：id rbatch-new-N、clamp status='collecting'
  const b1 = await store.createBatch({ projectId: 'prj-robots', name: '2026-08 第一批' });
  expect(b1.id).toBe('rbatch-new-1');
  expect(b1.status).toBe('collecting');

  // updateBatch：状态流转 + 名称改；未知 id → undefined
  const flowed = await store.updateBatch(b1.id, { status: 'submitted' });
  expect(flowed?.status).toBe('submitted');
  expect(flowed?.name).toBe('2026-08 第一批');
  expect(await store.updateBatch('rbatch-new-999', { status: 'reimbursed' })).toBeUndefined();

  // 装批（条目 PATCH batchId）后 listEntries 可见
  const assigned = await store.updateEntry(e1.id, { batchId: b1.id });
  expect(assigned?.batchId).toBe(b1.id);
  expect((await store.listEntries()).find((e) => e.id === e1.id)?.batchId).toBe(b1.id);
}

describe('ReimburseStore fake / 统一 SQLite 一致性', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  test('InMemoryReimburseStore（逻辑主体）', async () => {
    await expectConsistentBehavior(new InMemoryReimburseStore());
  });

  test('openUnifiedDb：同一行为 + 关闭重开后数据和 id 序列存活', async () => {
    dir = await mkdtemp(join(tmpdir(), 'reimburse-unified-'));
    const dbFile = join(dir, 'teamhub.sqlite');
    const unified = openUnifiedDb(dbFile);
    unified.initialize(
      { dataMode: 'real', identityMode: 'anonymous' },
      new Date('2026-08-15T00:00:00.000Z'),
    );
    await expectConsistentBehavior(unified.openStores().reimburse);
    unified.close();

    const reopened = openUnifiedDb(dbFile);
    try {
      const reimburse = reopened.openStores().reimburse;
      expect(await reimburse.listEntries()).toHaveLength(2);
      expect(await reimburse.listBatches()).toHaveLength(1);
      expect(reimburse.getProfile().expectedPurchaserName).toBe('测试抬头');
      expect((await reimburse.getEntry('reimb-new-1'))?.batchId).toBe('rbatch-new-1');
      const next = await reimburse.createEntry(entryDraft({ invoiceNo: null }));
      expect(next.id).toBe('reimb-new-3');
    } finally {
      reopened.close();
    }
  });
});
