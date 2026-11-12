import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { governanceScenarioFixture, type GovernanceSnapshot, type Member } from '@teamhub/hub-contracts';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryPmRepository } from './support/inmemory-pm-repository.js';
import { InMemoryReimburseStore } from './support/inmemory-reimburse-store.js';
import { usernameOf } from './support/login-helpers.js';

const NAMES = { 'm-a': '成员A', 'm-b': '成员B', 'm-finance': '财务' } as const;
function member(id: keyof typeof NAMES, projectManager = false): Member {
  return {
    id, displayName: NAMES[id], role: 'member', grade: 'sophomore', groupId: 'grp-mech',
    status: 'idle', currentTaskId: null, updatedBy: 'console', updatedAt: '2026-01-01T00:00:00.000Z',
    ...(projectManager ? { projectManager: true } : {}),
  };
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
function fixture() {
  const store = new InMemoryReimburseStore();
  const app = buildTestHubServer({ store: new InMemoryPmRepository(gov()), reimburseStore: store, identityMode: 'identity' });
  return { app, store };
}
async function create(app: FastifyInstance, cookie: string, suffix: string, expenseType: string | null = 'purchase') {
  const response = await app.inject({ method: 'POST', url: '/api/reimburse/entries', headers: { cookie }, payload: {
    projectId: 'prj-robots', seasonId: '2027RC', expenseType, summary: `合成条目${suffix}`,
    kind: expenseType === 'purchase' ? 'goods' : 'expense', invoiceType: 'vatOrdinary', invoiceNo: `SYN-${suffix}`,
    invoiceDate: '2026-11-01', seller: '合成商户', purchaserName: '哈尔滨工业大学',
    purchaserTaxNo: '12100000400000456B', recognitionSource: 'xml', totalAmountFen: 1000,
    items: expenseType === 'purchase' ? [{ name: '合成件', unit: '个', quantity: 1, unitPriceFen: 1000, amountFen: 1000 }] : [],
    actualItemName: null, materials: { invoice: true, paymentShot: true, inspection: false }, note: null,
  } });
  expect(response.statusCode).toBe(201);
  return response.json().entry;
}
async function action(app: FastifyInstance, cookie: string, id: string, name: string, revision: number, extra: Record<string, unknown> = {}) {
  return app.inject({ method: 'POST', url: `/api/reimburse/entries/${id}/workflow/${name}`, headers: { cookie }, payload: { expectedRevision: revision, ...extra } });
}
async function approve(app: FastifyInstance, owner: string, finance: string, entry: any) {
  await action(app, owner, entry.id, 'submit', entry.revision);
  await action(app, finance, entry.id, 'accept', entry.revision);
  const response = await action(app, finance, entry.id, 'approve', entry.revision, { approvedAmountFen: entry.totalAmountFen });
  expect(response.statusCode).toBe(200);
  return response.json().entry;
}

describe('逐条报账工作流与权限', () => {
  test('提交、接收、核对、退回补充、核准与版本冲突都留下历史', async () => {
    const { app } = fixture();
    try {
      const owner = await login(app, 'm-a');
      const finance = await login(app, 'm-finance');
      const other = await login(app, 'm-b');
      const entry = await create(app, owner, 'A');
      expect(entry.workflowStatus).toBe('draft');
      expect((await action(app, other, entry.id, 'accept', 1)).statusCode).toBe(403);
      expect((await action(app, owner, entry.id, 'submit', 1)).json().entry.recognitionConfirmedRevision).toBe(1);
      expect((await action(app, owner, entry.id, 'accept', 1)).statusCode).toBe(403);
      expect((await action(app, finance, entry.id, 'accept', 1)).json().entry.workflowStatus).toBe('reviewing');
      expect((await action(app, finance, entry.id, 'check', 1)).json().entry.checkedRevision).toBe(1);
      const corrected = await app.inject({ method: 'PATCH', url: `/api/reimburse/entries/${entry.id}`, headers: { cookie: finance }, payload: { expectedRevision: 1, summary: '财务修正', changeReason: '对照合成原件' } });
      expect(corrected.json().entry).toMatchObject({ revision: 2, checkedRevision: null });
      expect((await action(app, finance, entry.id, 'check', 1)).statusCode).toBe(409);
      expect((await action(app, finance, entry.id, 'return', 2, { reason: '请补充用途说明' })).json().entry.workflowStatus).toBe('returned');
      const edited = await app.inject({ method: 'PATCH', url: `/api/reimburse/entries/${entry.id}`, headers: { cookie: owner }, payload: { expectedRevision: 2, note: '已补充' } });
      expect(edited.json().entry.revision).toBe(3);
      await action(app, owner, entry.id, 'submit', 3);
      await action(app, finance, entry.id, 'accept', 3);
      const approved = await action(app, finance, entry.id, 'approve', 3, { approvedAmountFen: 900, reason: '按有效金额核准' });
      expect(approved.json().entry).toMatchObject({ workflowStatus: 'pendingPayment', approvedAmountFen: 900, reviewedRevision: 3 });
      const history = approved.json().entry.history.map((event: any) => event.action);
      expect(history).toEqual(expect.arrayContaining(['submitted', 'accepted', 'checked', 'edited', 'returned', 'approved']));
      expect((await action(app, finance, entry.id, 'revokeApproval', 3, { reason: '发现金额需复核' })).json().entry.workflowStatus).toBe('reviewing');
    } finally { await app.close(); }
  });

  test('缺件可提交，缺件核准必须留意见；未确认类型不能提交', async () => {
    const { app } = fixture();
    try {
      const owner = await login(app, 'm-a');
      const finance = await login(app, 'm-finance');
      const untyped = await create(app, owner, 'UNTYPE', null);
      expect((await action(app, owner, untyped.id, 'submit', 1)).statusCode).toBe(409);
      const entry = await create(app, owner, 'MISSING');
      const patched = await app.inject({ method: 'PATCH', url: `/api/reimburse/entries/${entry.id}`, headers: { cookie: owner }, payload: { expectedRevision: 1, materials: { invoice: false, paymentShot: false, inspection: false } } });
      expect(patched.statusCode).toBe(200);
      await action(app, owner, entry.id, 'submit', 2);
      await action(app, finance, entry.id, 'accept', 2);
      expect((await action(app, finance, entry.id, 'approve', 2, { approvedAmountFen: 1000 })).statusCode).toBe(400);
      expect((await action(app, finance, entry.id, 'approve', 2, { approvedAmountFen: 1000, reason: '缺件由财务另行补收' })).statusCode).toBe(200);
    } finally { await app.close(); }
  });
});

describe('合并打款', () => {
  test('同一提交人多笔核准条目一次完成，总额不符与跨人选择被拒绝', async () => {
    const { app } = fixture();
    try {
      const owner = await login(app, 'm-a');
      const other = await login(app, 'm-b');
      const finance = await login(app, 'm-finance');
      const first = await approve(app, owner, finance, await create(app, owner, 'P1'));
      const second = await approve(app, owner, finance, await create(app, owner, 'P2'));
      const foreign = await approve(app, other, finance, await create(app, other, 'P3'));
      const request = {
        entries: [{ id: first.id, expectedRevision: 1 }, { id: second.id, expectedRevision: 1 }],
        amountFen: 2000, paidAt: '2026-11-12T01:00:00.000Z', method: 'bank', transactionRef: 'SYN-001',
        clientRequestId: 'f3a6e682-d603-48d4-96b1-c50e46f06a01',
      };
      expect((await app.inject({ method: 'POST', url: '/api/reimburse/payouts', headers: { cookie: other }, payload: request })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/api/reimburse/payouts', headers: { cookie: finance }, payload: { ...request, amountFen: 1999 } })).statusCode).toBe(409);
      expect((await app.inject({ method: 'POST', url: '/api/reimburse/payouts', headers: { cookie: finance }, payload: { ...request, entries: [...request.entries, { id: foreign.id, expectedRevision: 1 }] } })).statusCode).toBe(409);
      const created = await app.inject({ method: 'POST', url: '/api/reimburse/payouts', headers: { cookie: finance }, payload: request });
      expect(created.statusCode).toBe(201);
      expect(created.json().payout).toMatchObject({ recipientId: 'm-a', amountFen: 2000, entryIds: [first.id, second.id] });
      expect((await app.inject({ method: 'POST', url: '/api/reimburse/payouts', headers: { cookie: finance }, payload: request })).json().payout.id).toBe(created.json().payout.id);
      const entries = await app.inject({ method: 'GET', url: '/api/reimburse/entries', headers: { cookie: owner } });
      expect(entries.json().entries.filter((entry: any) => [first.id, second.id].includes(entry.id)).every((entry: any) => entry.workflowStatus === 'completed' && entry.payoutId === created.json().payout.id)).toBe(true);
      const own = await app.inject({ method: 'GET', url: '/api/reimburse/payouts', headers: { cookie: owner } });
      const otherPayouts = await app.inject({ method: 'GET', url: '/api/reimburse/payouts', headers: { cookie: other } });
      expect(own.json().payouts).toHaveLength(1);
      expect(otherPayouts.json().payouts.map((payout: any) => payout.id)).not.toContain(created.json().payout.id);
    } finally { await app.close(); }
  });
});
