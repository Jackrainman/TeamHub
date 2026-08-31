import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixedClock } from '../src/clock.js';
import { isSuperAdmin } from '../src/authz.js';
import {
  ReimburseService,
  type InventoryStockInPort,
} from '../src/modules/reimburse/service.js';
import { SqliteApplicationUnitOfWork } from '../src/infrastructure/sqlite-application-unit-of-work.js';
import { openUnifiedDb, type UnifiedDatabase } from '../src/store/sqlite-unified.js';

const NOW = new Date('2026-08-15T08:00:00.000Z');
const ACTOR = { id: 'member-stock-in', displayName: '入库成员', source: 'console' };

describe('ReimburseService + SQLite ApplicationUnitOfWork', () => {
  let dir: string;
  let database: UnifiedDatabase;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'teamhub-stock-in-uow-'));
    database = openUnifiedDb(join(dir, 'teamhub.sqlite'));
    database.initialize({ dataMode: 'demo', identityMode: 'identity' }, NOW);
  });

  afterEach(async () => {
    database.close();
    await rm(dir, { recursive: true, force: true });
  });

  test('同步 UoW 包住 repository 内层 savepoint，成功批次一次提交且共用 Clock', async () => {
    const clock = new FixedClock(NOW);
    const stores = database.openStores(clock);
    const target = stores.inv.readStockInSnapshot().partTypes[0];
    const entry = await stores.reimburse.createEntry({
      projectId: 'prj-robots',
      memberId: ACTOR.id,
      batchId: null,
      kind: 'goods',
      invoiceNo: 'uow-success',
      invoiceDate: '2026-08-15',
      seller: '测试供应商',
      purchaserName: '哈尔滨工业大学',
      purchaserTaxNo: '12100000400000456B',
      recognitionSource: 'xml',
      totalAmountFen: 1000,
      items: [
        { name: '既有件', unit: '个', quantity: 2, unitPriceFen: 100, amountFen: 200 },
        { name: '新件', unit: '个', quantity: 1, unitPriceFen: 800, amountFen: 800 },
      ],
      actualItemName: null,
      materials: { paymentShot: false, inspection: false },
      note: null,
    });
    const service = new ReimburseService(
      stores.reimburse,
      { isSuperAdmin: async (memberId) => isSuperAdmin((await stores.gov.getSnapshot()).members, memberId) },
      stores.reimburse,
      stores.inv,
      new SqliteApplicationUnitOfWork(database.db, clock),
      'identity',
    );

    const result = await service.stockIn({
      entryId: entry.id,
      actor: ACTOR,
      canManageAll: false,
      lines: [
        { itemIndex: 0, quantity: 2, target: { partTypeId: target.id } },
        {
          itemIndex: 1,
          quantity: 1,
          target: {
            newPart: { partNumber: 'UOW-NEW', name: '新件', category: 'other', unit: '个' },
          },
        },
      ],
    });

    expect(result.actions).toHaveLength(2);
    expect(result.actions.every((action) => action.recordedAt === NOW.toISOString())).toBe(true);
    expect(result.partTypes.find((part) => part.partNumber === 'UOW-NEW')?.totalQuantity).toBe(1);
  });

  test('第二条写故障时，第一条补量/动作和已创建新件全部回滚', async () => {
    const clock = new FixedClock(NOW);
    const stores = database.openStores(clock);
    const target = stores.inv.readStockInSnapshot().partTypes[0];
    const entry = await stores.reimburse.createEntry({
      projectId: 'prj-robots',
      memberId: ACTOR.id,
      batchId: null,
      kind: 'goods',
      invoiceNo: 'uow-rollback',
      invoiceDate: '2026-08-15',
      seller: '测试供应商',
      purchaserName: '哈尔滨工业大学',
      purchaserTaxNo: '12100000400000456B',
      recognitionSource: 'xml',
      totalAmountFen: 300,
      items: [
        { name: '既有件', unit: '个', quantity: 1, unitPriceFen: 100, amountFen: 100 },
        { name: '故障新件', unit: '个', quantity: 1, unitPriceFen: 200, amountFen: 200 },
      ],
      actualItemName: null,
      materials: { paymentShot: false, inspection: false },
      note: null,
    });
    const before = stores.inv.readStockInSnapshot();
    let actionWrites = 0;
    const failingInventory: InventoryStockInPort = {
      readStockInSnapshot: () => stores.inv.readStockInSnapshot(),
      upsertStockInPartType: (draft, occurredAt) =>
        stores.inv.upsertStockInPartType(draft, occurredAt),
      recordStockInAction: (draft, occurredAt) => {
        actionWrites += 1;
        if (actionWrites === 2) throw new Error('injected second action failure');
        return stores.inv.recordStockInAction(draft, occurredAt);
      },
    };
    const service = new ReimburseService(
      stores.reimburse,
      { isSuperAdmin: async (memberId) => isSuperAdmin((await stores.gov.getSnapshot()).members, memberId) },
      stores.reimburse,
      failingInventory,
      new SqliteApplicationUnitOfWork(database.db, clock),
      'identity',
    );

    expect(() =>
      service.stockIn({
        entryId: entry.id,
        actor: ACTOR,
        canManageAll: false,
        lines: [
          { itemIndex: 0, quantity: 1, target: { partTypeId: target.id } },
          {
            itemIndex: 1,
            quantity: 1,
            target: {
              newPart: { partNumber: 'ROLLBACK-ME', name: '故障新件', category: 'other', unit: '个' },
            },
          },
        ],
      }),
    ).toThrow('injected second action failure');

    expect(stores.inv.readStockInSnapshot()).toEqual(before);
  });

  test('UoW 拒绝 async callback 并回滚同步部分', () => {
    const clock = new FixedClock(NOW);
    const uow = new SqliteApplicationUnitOfWork(database.db, clock);
    const context = uow.run(ACTOR, (current) => current);
    expect(context.actor).toEqual(ACTOR);
    expect(context.clock).toBe(clock);
    expect(context.occurredAt).toEqual(NOW);
    expect(() =>
      uow.run(ACTOR, async () => {
        database.db.insertRow('reimburse_batches', 'async-write', { id: 'async-write' });
      }),
    ).toThrow(/必须同步/);
    expect(database.db.getRow('reimburse_batches', 'async-write')).toBeUndefined();
  });
});
