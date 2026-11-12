import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import FormData from 'form-data';
import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { governanceScenarioFixture, type GovernanceSnapshot, type Member } from '@teamhub/hub-contracts';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryPmRepository } from './support/inmemory-pm-repository.js';
import { InMemoryReimburseStore } from './support/inmemory-reimburse-store.js';
import { usernameOf } from './support/login-helpers.js';

const NAMES = { 'm-a': '成员A', 'm-b': '成员B', 'm-finance': '财务' } as const;
function member(id: keyof typeof NAMES, projectManager = false): Member {
  return { id, displayName: NAMES[id], role: 'member', grade: 'sophomore', groupId: 'grp-mech', status: 'idle', currentTaskId: null, updatedBy: 'console', updatedAt: '2026-01-01T00:00:00.000Z', ...(projectManager ? { projectManager: true } : {}) };
}
function gov(): GovernanceSnapshot {
  return { ...governanceScenarioFixture, members: [member('m-a'), member('m-b'), member('m-finance', true)], tasks: [], dependencies: [], needs: [] };
}
async function login(app: FastifyInstance, id: keyof typeof NAMES): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/session', payload: { username: usernameOf(id, NAMES) } });
  const cookie = `teamhub_session=${response.cookies.find((item) => item.name === 'teamhub_session')!.value}`;
  await app.inject({ method: 'PUT', url: `/api/members/${id}/pin`, headers: { cookie }, payload: { pin: '1234abcd' } });
  return cookie;
}
async function create(app: FastifyInstance, cookie: string, suffix: string, amount: number | null = 1000) {
  const response = await app.inject({ method: 'POST', url: '/api/reimburse/entries', headers: { cookie }, payload: {
    projectId: 'prj-robots', seasonId: '2027RC', expenseType: 'purchase', summary: `合成${suffix}`,
    kind: 'goods', invoiceType: 'vatOrdinary', invoiceNo: `001234567890${suffix}`, invoiceDate: '2026-11-01',
    seller: '合成商户', purchaserName: '哈尔滨工业大学', purchaserTaxNo: '12100000400000456B', recognitionSource: 'xml',
    totalAmountFen: amount, items: [{ name: '合成件', unit: '包', quantity: 1, unitPriceFen: amount, amountFen: amount ?? 0 }],
    actualItemName: null, materials: { invoice: false, paymentShot: false, inspection: false }, note: null,
  } });
  return response.json().entry;
}
async function upload(app: FastifyInstance, cookie: string, entryId: string, name: string, revision = 1) {
  const form = new FormData();
  form.append('kind', 'invoice');
  form.append('expectedRevision', String(revision));
  form.append('file', Buffer.from(`synthetic:${name}`), { filename: name });
  const response = await app.inject({ method: 'POST', url: `/api/reimburse/entries/${entryId}/evidence`, headers: { ...form.getHeaders(), cookie }, payload: form.getBuffer() });
  expect(response.statusCode).toBe(201);
  return response.json().evidence;
}

describe('XLSX 与受控附件包导出', () => {
  let app: FastifyInstance;
  let dir: string;
  let previousDir: string | undefined;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'reimburse-export-'));
    previousDir = process.env.TEAMHUB_EVIDENCE_FILES_DIR;
    process.env.TEAMHUB_EVIDENCE_FILES_DIR = dir;
    app = buildTestHubServer({ store: new InMemoryPmRepository(gov()), reimburseStore: new InMemoryReimburseStore(), identityMode: 'identity' });
  });
  afterEach(async () => {
    await app.close();
    if (previousDir === undefined) delete process.env.TEAMHUB_EVIDENCE_FILES_DIR;
    else process.env.TEAMHUB_EVIDENCE_FILES_DIR = previousDir;
    await rm(dir, { recursive: true, force: true });
  });

  test('导出 ID 与本人授权范围求交集，XLSX 含两张结构表且长号码按字符串', async () => {
    const owner = await login(app, 'm-a');
    const other = await login(app, 'm-b');
    const mine = await create(app, owner, 'A');
    const foreign = await create(app, other, 'B');
    const response = await app.inject({ method: 'POST', url: '/api/reimburse/export', headers: { cookie: owner }, payload: { entryIds: [mine.id, foreign.id], includeEvidence: false } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('.xlsx');
    const workbook = unzipSync(new Uint8Array(response.rawPayload));
    expect(strFromU8(workbook['xl/workbook.xml'])).toContain('类型汇总');
    const detail = strFromU8(workbook['xl/worksheets/sheet1.xml']);
    expect(detail).toContain('001234567890A');
    expect(detail).not.toContain('001234567890B');
    expect(detail).toContain('成员A');
    expect(detail).not.toContain('成员B');
    expect((await app.inject({ method: 'POST', url: '/api/reimburse/export', headers: { cookie: other }, payload: { entryIds: [mine.id] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/reimburse/export', payload: { entryIds: [mine.id] } })).statusCode).toBe(401);
  });

  test('附件包含 ID 防重名、逐件留痕；缺失字节进入 manifest 而不静默漏掉', async () => {
    const owner = await login(app, 'm-a');
    const first = await create(app, owner, 'C');
    const second = await create(app, owner, 'D', null);
    const evidence1 = await upload(app, owner, first.id, '同名.pdf');
    const evidence2 = await upload(app, owner, second.id, '同名.pdf');
    await unlink(path.join(dir, `${evidence2.id}.pdf`));
    const response = await app.inject({ method: 'POST', url: '/api/reimburse/export', headers: { cookie: owner }, payload: { entryIds: [first.id, second.id], includeEvidence: true } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('.zip');
    const files = unzipSync(new Uint8Array(response.rawPayload));
    expect(files['报账明细.xlsx']).toBeDefined();
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    const archived = manifest.entries[0].evidence[0];
    const failed = manifest.entries[1].evidence[0];
    expect(archived.status).toBe('archived');
    expect(failed).toMatchObject({ status: 'failed', failure: 'REIMBURSE_EVIDENCE_FILE_MISSING' });
    expect(archived.path).not.toBe(failed.path);
    expect(strFromU8(files[archived.path])).toBe('synthetic:同名.pdf');
    expect(files[failed.path]).toBeUndefined();
    expect(manifest.entries[1].missingMaterials).toEqual(['paymentShot']);
    const logs = await app.inject({ method: 'GET', url: `/api/reimburse/entries/${first.id}/evidence-downloads`, headers: { cookie: owner } });
    expect(logs.json().downloads).toMatchObject([{ evidenceId: evidence1.id, actorId: 'm-a' }]);
    const entries = await app.inject({ method: 'GET', url: '/api/reimburse/entries', headers: { cookie: owner } });
    const exported = entries.json().entries.find((entry: any) => entry.id === first.id);
    expect(exported.revision).toBe(2);
    expect(exported.history.at(-1).action).toBe('exported');
    expect(exported.evidence).toEqual([]);
  });
});
