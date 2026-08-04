import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  InMemoryReimburseStore,
} from '../src/store/reimburse-store.js';
import type {
  ReimburseEntryDraft,
  ReimburseStore,
} from '../src/store/reimburse-store.js';
import { FileReimburseStore } from '../src/store/file-reimburse-store.js';
import { SqliteReimburseStore } from '../src/store/sqlite-reimburse-store.js';
import { SqliteDatabase } from '../src/store/sqlite-db.js';

/**
 * 报账域 store 三实现一致性（REIMBURSE-PROC，照 gov-store-scaffold.test.ts 模式）：
 * InMemory（逻辑主体）/ File（decorator + PersistedFile）/ SQLite（独立实现 fromSharedDb，KV JSON 表）
 * 跑同一条操作序列，行为逐字一致——id 形态（reimb-new-N / rbatch-new-N）、clamp collecting、
 * 白名单 PATCH、未知 id → undefined、发票号查重。File 实现另验重启存活（重开同文件数据还在）。
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
async function expectConsistentBehavior(store: ReimburseStore): Promise<void> {
  expect(await store.listEntries()).toHaveLength(0);
  expect(await store.listBatches()).toHaveLength(0);

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

describe('ReimburseStore 三实现一致性', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  test('InMemoryReimburseStore（逻辑主体）', async () => {
    await expectConsistentBehavior(new InMemoryReimburseStore());
  });

  test('FileReimburseStore（decorator）：同一行为 + 重启存活（重开同文件数据还在）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'reimburse-file-'));
    const file = join(dir, 'reimburse.json');
    const store = await FileReimburseStore.create(file);
    await expectConsistentBehavior(store);

    // 重启存活：同文件重开（模拟进程重启），条目/批次/装批关系全在
    const reopened = await FileReimburseStore.create(file);
    expect(await reopened.listEntries()).toHaveLength(2);
    expect(await reopened.listBatches()).toHaveLength(1);
    expect((await reopened.getEntry('reimb-new-1'))?.batchId).toBe('rbatch-new-1');
    // id 序列不回退：重开后再建不撞既有 id
    const e3 = await reopened.createEntry(entryDraft({ invoiceNo: null }));
    expect(e3.id).toBe('reimb-new-3');
  });

  test('FileReimburseStore：坏文件 fail-closed（抛，不静默覆盖团队数据）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'reimburse-file-bad-'));
    const file = join(dir, 'reimburse.json');
    const store = await FileReimburseStore.create(file);
    await store.createEntry(entryDraft());
    // 篡改落盘文件为非法 JSON → 重开必抛（不静默 seed 覆盖）
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, '{ broken json', 'utf8');
    await expect(FileReimburseStore.create(file)).rejects.toThrow();
  });

  test('SqliteReimburseStore（独立实现，KV JSON 表）：同一行为 + 重开同库数据还在', async () => {
    dir = await mkdtemp(join(tmpdir(), 'reimburse-sqlite-'));
    const dbFile = join(dir, 'reimburse.sqlite');
    const sdb = SqliteDatabase.open(dbFile);
    sdb.ensureMetaTable();
    const store = SqliteReimburseStore.fromSharedDb(sdb);
    await expectConsistentBehavior(store);

    // 重开同库（模拟进程重启）：数据还在 + id 序列经 maxSuffix 对齐不回退
    const sdb2 = SqliteDatabase.open(dbFile);
    sdb2.ensureMetaTable();
    const reopened = SqliteReimburseStore.fromSharedDb(sdb2);
    expect(await reopened.listEntries()).toHaveLength(2);
    const e3 = await reopened.createEntry(entryDraft({ invoiceNo: null }));
    expect(e3.id).toBe('reimb-new-3');
    sdb.close();
    sdb2.close();
  });
});
