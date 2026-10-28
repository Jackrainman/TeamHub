import { expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { usernameOf } from './support/login-helpers.js';
import { FixedClock } from '../src/clock.js';

async function login(app: FastifyInstance, id: string) {
  const response = await app.inject({ method: 'POST', url: '/api/session', payload: { username: usernameOf(id) } });
  expect(response.statusCode).toBe(200);
  const cookie = `teamhub_session=${response.cookies.find(c => c.name === 'teamhub_session')!.value}`;
  expect((await app.inject({ method: 'PUT', url: `/api/members/${id}/pin`, headers: { cookie }, payload: { pin: '1234abcd' } })).statusCode).toBe(200);
  return cookie;
}

test('self report, owner-only progress, peer acceptance, reject and recomplete', async () => {
  const app = buildTestHubServer({ identityMode: 'identity', clock: new FixedClock(new Date('2026-10-28T00:00:00Z')) });
  try {
    const a = await login(app, 'm-circuitD');
    const b = await login(app, 'm-ecB');
    const post = (url: string, cookie: string, payload: object = {}) => app.inject({ method: 'POST', url, headers: { cookie }, payload });
    const draft = { projectId: 'prj-robots', groupId: 'grp-circuit', title: 'week task', rawSummary: 'test', intrinsicComplexity: 'normal', ownerId: 'm-ecB', reviewedBy: { id: 'm-ecB', displayName: 'fake', source: 'console' } };
    for (const key of ['2026-W43', '2026-W45', '2021-W53']) {
      expect((await post(`/api/weeks/${key}/tasks`, a, draft)).statusCode).toBe(400);
    }
    const created = await post('/api/weeks/2026-W44/tasks', a, draft);
    expect(created.statusCode).toBe(200);
    const task = created.json().task;
    expect(task.ownerId).toBe('m-circuitD');
    expect(task.reviewedBy).toBeUndefined();
    expect(task.weekLinks).toHaveLength(1);
    expect(task.ownershipEvents[0].kind).toBe('claimed');
    const base = `/api/tasks/${task.id}`;
    expect((await post(`${base}/weeks`, a, { weekKey: '2026-W44' })).json().task.weekLinks).toHaveLength(1);
    expect((await post(`${base}/weeks`, b, { weekKey: '2026-W44' })).statusCode).toBe(403);
    expect((await post(`${base}/status`, b, { status: 'done' })).statusCode).toBe(403);
    expect((await post(`${base}/complete`, b)).statusCode).toBe(403);
    expect((await post(`${base}/status`, a, { status: 'done' })).json().task.completedBy.id).toBe('m-circuitD');
    expect((await post(`${base}/review`, a, { outcome: 'accept' })).statusCode).toBe(403);
    const accepted = await post(`${base}/review`, b, { outcome: 'accept' });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().task.reviewedAt).toBe('2026-10-28T00:00:00.000Z');
    expect((await post(`${base}/review`, b, { outcome: 'reject', note: 'fix' })).json().task.status).toBe('inProgress');
    const completed = (await post(`${base}/complete`, a)).json().task;
    expect(completed.reviewedBy).toBeUndefined();
    expect(completed.reviewedAt).toBeUndefined();
    expect(completed.reviewNote).toBeUndefined();
    expect((await post(`${base}/weeks`, a, { weekKey: '2026-W44' })).statusCode).toBe(409);
    expect((await post('/api/tasks/t-r1-newboard/review', b, { outcome: 'accept' })).statusCode).toBe(403);
  } finally { await app.close(); }
});
