import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_REIMBURSE_PROFILE, type ActorRef } from '@teamhub/hub-contracts';
import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '../../clock.js';
import { openV1Database } from '../../store/v1-database.js';

const control = vi.hoisted(() => {
  const state = {
    blockPayment: true,
    paymentStarted: false,
    release: () => {},
    gate: null as unknown as Promise<void>,
  };
  state.gate = new Promise<void>(resolve => { state.release = resolve; });
  return state;
});

vi.mock('./import-parser.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./import-parser.js')>();
  return {
    ...actual,
    parseReimburseImportFile: vi.fn(async (ext: string, content: Buffer, profile: Parameters<typeof actual.parseReimburseImportFile>[2]) => {
      if (control.blockPayment && content.toString().includes('PAY-BLOCK')) {
        control.paymentStarted = true;
        await control.gate;
      }
      return actual.parseReimburseImportFile(ext, content, profile);
    }),
  };
});

import { LocalReimburseImportStorage } from './import-file-storage.js';
import { ReimburseImportService } from './import-service.js';
import { SqliteReimburseImportRepository } from './import-sqlite-repository.js';
import type { ReimburseEvidenceStorage, ReimburseRepository } from './repository.js';
import type { ReimburseService } from './service.js';

const actor: ActorRef = { id: 'member-1', displayName: 'owner', source: 'test' };
const invoiceXml = (suffix: string) => `<?xml version="1.0"?><Invoice><EIid>12345678901234567890</EIid><IssueTime>2026-11-20</IssueTime><SellerName>测试商店</SellerName><TotalTax-includedAmount>24.50</TotalTax-includedAmount><Item><ItemName>测试物料 ${suffix}</ItemName><Quantity>1</Quantity><Amount>24.50</Amount></Item></Invoice>`;
const blockedPaymentXml = '支付成功\n交易金额：￥24.50\n交易单号：PAY-BLOCK';

describe('reimburse import FIFO queue', () => {
  it('advances queued to parsing with per-file progress and reports dynamic FIFO positions', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamhub-import-queue-'));
    const database = openV1Database(path.join(root, 'teamhub.sqlite'));
    database.initialize({ dataMode: 'real', identityMode: 'identity' }, new Date('2026-01-01T00:00:00.000Z'));
    const jobs = SqliteReimburseImportRepository.fromSharedDb(database.db);
    const entries = { getProfile: () => DEFAULT_REIMBURSE_PROFILE } as ReimburseRepository;
    const service = new ReimburseImportService(
      jobs, entries, {} as ReimburseService,
      new LocalReimburseImportStorage(() => path.join(root, 'evidence')), {} as ReimburseEvidenceStorage,
      { isSuperAdmin: async () => false }, { run: () => { throw new Error('not used'); } },
      new FixedClock(new Date('2026-01-01T00:00:00.000Z')),
    );
    try {
      const first = await service.createJob(actor, [
        { name: 'invoice-first.xml', content: Buffer.from(invoiceXml('first')) },
        { name: 'payment-blocked.xml', content: Buffer.from(blockedPaymentXml) },
      ]);
      expect(first).toMatchObject({ status: 'queued', queuePosition: 1 });
      expect(jobs.getJob(first.id)).not.toHaveProperty('queuePosition');

      await vi.waitFor(() => { expect(control.paymentStarted).toBe(true); }, { timeout: 5000 });
      const parsing = await service.getJob(first.id, actor);
      expect(parsing.status).toBe('parsing');
      expect(parsing.queuePosition).toBeNull();
      expect(parsing.files.map(file => file.status)).toEqual(['parsed', 'uploading']);

      const second = await service.createJob(actor, [{ name: 'invoice-second.xml', content: Buffer.from(invoiceXml('second')) }]);
      const third = await service.createJob(actor, [{ name: 'invoice-third.xml', content: Buffer.from(invoiceXml('third')) }]);
      expect(second).toMatchObject({ status: 'queued', queuePosition: 1 });
      expect(third).toMatchObject({ status: 'queued', queuePosition: 2 });
      const listed = await service.listJobs(actor);
      expect(listed.find(job => job.id === second.id)).toMatchObject({ status: 'queued', queuePosition: 1 });
      expect(listed.find(job => job.id === third.id)).toMatchObject({ status: 'queued', queuePosition: 2 });

      control.release();
      await vi.waitFor(async () => {
        expect((await service.getJob(first.id, actor)).status).toBe('ready');
        expect((await service.getJob(second.id, actor)).status).toBe('ready');
        expect((await service.getJob(third.id, actor)).status).toBe('ready');
      }, { timeout: 5000 });
      const ready = await service.getJob(first.id, actor);
      expect(ready.files.map(file => file.status)).toEqual(['parsed', 'parsed']);
      expect(ready.queuePosition).toBeNull();
    } finally {
      control.release();
      database.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
