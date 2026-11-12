import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixedClock } from '../src/clock.js';
import { ReimburseService } from '../src/modules/reimburse/service.js';
import type { ReimburseRepository } from '../src/modules/reimburse/repository.js';
import { LocalEvidenceFileStorage } from '../src/modules/reimburse/index.js';
import { SqliteApplicationUnitOfWork } from '../src/infrastructure/sqlite-application-unit-of-work.js';
import { openUnifiedDb, type UnifiedDatabase } from '../src/store/sqlite-unified.js';

const NOW = new Date('2026-11-12T02:00:00.000Z');
const ACTOR = { id: 'finance', displayName: '财务', source: 'console' } as const;
let dir = '';
let database: UnifiedDatabase;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'reimburse-payout-uow-'));
  database = openUnifiedDb(join(dir, 'teamhub.sqlite'));
  database.initialize({ dataMode: 'demo', identityMode: 'identity' }, NOW);
});
afterEach(async () => {
  database.close();
  await rm(dir, { recursive: true, force: true });
});

function service(repository: ReimburseRepository, clock: FixedClock): ReimburseService {
  const stores = database.openStores(clock);
  return new ReimburseService(repository, { isSuperAdmin: async () => true }, stores.reimburse,
    stores.inv, new SqliteApplicationUnitOfWork(database.db, clock), 'identity', new LocalEvidenceFileStorage());
}

test('合并打款第二条更新失败时 payout、第一条完成状态和历史全部回滚；重启后幂等重试仍只有一笔', async () => {
  const clock = new FixedClock(NOW);
  const stores = database.openStores(clock);
  const entries = ['A', 'B'].map((suffix) => {
    const created = stores.reimburse.createEntry({
      projectId: 'prj-robots', seasonId: '2027RC', memberId: 'member-a', batchId: null,
      kind: 'expense', expenseType: 'taxi', summary: `合成打车${suffix}`, invoiceType: 'vatOrdinary',
      invoiceNo: `SYN-${suffix}`, invoiceDate: '2026-11-01', seller: '合成商户', purchaserName: null,
      purchaserTaxNo: null, recognitionSource: 'xml', totalAmountFen: 1000, items: [], actualItemName: null,
      materials: { invoice: true, paymentShot: true, inspection: false }, note: null,
    });
    return stores.reimburse.updateEntry(created.id, {
      workflowStatus: 'pendingPayment', approvedAmountFen: 1000, reviewedRevision: 1,
    })!;
  });
  let writes = 0;
  const failing = new Proxy(stores.reimburse, {
    get(target, property, receiver) {
      if (property === 'updateEntry') return (...args: Parameters<ReimburseRepository['updateEntry']>) => {
        writes += 1;
        if (writes === 2) throw new Error('injected second entry failure');
        return target.updateEntry(...args);
      };
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as ReimburseRepository;
  const request = {
    entries: entries.map((entry) => ({ id: entry.id, expectedRevision: 1 })),
    amountFen: 2000, paidAt: '2026-11-12T01:00:00.000Z', method: 'bank' as const,
    transactionRef: 'SYN-PAYOUT', clientRequestId: 'cb49c06e-69c4-4f1c-b08e-2e0f6f0c32c7',
  };
  await expect(service(failing, clock).createPayout(request, ACTOR)).rejects.toThrow('injected second entry failure');
  expect(stores.reimburse.listPayouts()).toEqual([]);
  expect(stores.reimburse.listEntries().filter((entry) => entries.some((item) => item.id === entry.id)).every((entry) =>
    entry.workflowStatus === 'pendingPayment' && entry.payoutId === null && !entry.history.some((event) => event.action === 'payoutRegistered'))).toBe(true);

  const created = await service(stores.reimburse, clock).createPayout(request, ACTOR);
  expect(created.entryIds).toEqual(entries.map((entry) => entry.id));
  database.close();
  database = openUnifiedDb(join(dir, 'teamhub.sqlite'));
  const reopened = database.openStores(clock).reimburse;
  expect(reopened.listPayouts()).toHaveLength(1);
  expect(reopened.listEntries().filter((entry) => entries.some((item) => item.id === entry.id)).every((entry) => entry.workflowStatus === 'completed')).toBe(true);
  const retried = await service(reopened, clock).createPayout(request, ACTOR);
  expect(retried.id).toBe(created.id);
  expect(reopened.listPayouts()).toHaveLength(1);
});
