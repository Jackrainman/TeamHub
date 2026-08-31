import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteDatabase } from '../src/store/sqlite-db.js';
import { SqliteReimburseRepository } from '../src/modules/reimburse/sqlite-repository.js';
import type { ReimburseEntryDraft } from '../src/modules/reimburse/repository.js';

/**
 * 发票号查重索引（REIMBURSE-DEFECTS #6）：进程内 invoiceNo→id 索引，
 * 不再全表扫描；关键是**跨实例重建**——进程重启后索引从行数据回填，查重依然命中。
 */

// repository 层是严格全键 draft（可空键缺省规整发生在 service 层，见 #5）。
const draft = (invoiceNo: string | null): ReimburseEntryDraft => ({
  projectId: 'prj-robots',
  memberId: 'm-a',
  batchId: null,
  kind: 'expense',
  invoiceNo,
  invoiceDate: null,
  seller: null,
  purchaserName: null,
  purchaserTaxNo: null,
  recognitionSource: 'manual',
  totalAmountFen: 100,
  items: [{ name: '打车', unit: null, quantity: 1, unitPriceFen: null, amountFen: 100 }],
  actualItemName: null,
  materials: { paymentShot: false, inspection: false },
  note: null,
});

describe('SqliteReimburseRepository 发票号索引', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'teamhub-reimb-idx-'));
    dbPath = join(dir, 'teamhub.sqlite');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('createEntry 后即时可查；新实例（重启语义）索引重建后依然命中', () => {
    const sdb1 = SqliteDatabase.open(dbPath);
    sdb1.ensureMetaTable();
    const repo1 = SqliteReimburseRepository.fromSharedDb(sdb1);
    const entry = repo1.createEntry(draft('INV-001'));
    repo1.createEntry(draft(null)); // 空号不进索引
    expect(repo1.findEntryByInvoiceNo('INV-001')?.id).toBe(entry.id);
    expect(repo1.findEntryByInvoiceNo('INV-404')).toBeUndefined();
    sdb1.close();

    // 模拟进程重启：新 SqliteDatabase + 新 repository，索引从行数据回填。
    const sdb2 = SqliteDatabase.open(dbPath);
    const repo2 = SqliteReimburseRepository.fromSharedDb(sdb2);
    expect(repo2.findEntryByInvoiceNo('INV-001')?.id).toBe(entry.id);
    // 新实例上的查重路径（service 同源调用）也能挡住重复发票号。
    expect(repo2.findEntryByInvoiceNo('INV-001')?.invoiceNo).toBe('INV-001');
    sdb2.close();
  });

  it('updateEntry 改发票号时索引换绑', () => {
    const sdb = SqliteDatabase.open(dbPath);
    sdb.ensureMetaTable();
    const repo = SqliteReimburseRepository.fromSharedDb(sdb);
    const entry = repo.createEntry(draft('INV-OLD'));
    repo.updateEntry(entry.id, { invoiceNo: 'INV-NEW' } as never);
    expect(repo.findEntryByInvoiceNo('INV-OLD')).toBeUndefined();
    expect(repo.findEntryByInvoiceNo('INV-NEW')?.id).toBe(entry.id);
    sdb.close();
  });
});
