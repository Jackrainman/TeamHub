import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { CreateSeasonResponseSchema, SeasonsResponseSchema } from '@teamhub/hub-contracts';
import { InMemoryPmRepository } from './support/inmemory-gov-store.js';

/**
 * SEASON-CREATE 补链路（POST /api/seasons）：总览页空态文案"先在设置里建一个赛季"此前指向
 * 不存在的入口——本测证入口链路真实存在且语义正确（新建=宣告当前赛季，旧 active 同笔归档）。
 */

const validBody = {
  name: 'Robocon 2027',
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: null,
};

describe('POST /api/seasons', () => {
  test('201 + server 补 id/钉 active；旧 active 同笔转 archived；GET 往返可见', async () => {
    const store = new InMemoryPmRepository();
    const priorActive = (await store.getSnapshot()).seasons.filter((s) => s.status === 'active');
    expect(priorActive.length).toBeGreaterThan(0); // fixture 种了一条 active，前提成立
    const app = buildTestHubServer({ store });
    try {
      const res = await app.inject({ method: 'POST', url: '/api/seasons', payload: validBody });
      expect(res.statusCode).toBe(201);
      const body = CreateSeasonResponseSchema.parse(res.json());
      expect(body.season.id).toMatch(/^season-new-/);
      expect(body.season.status).toBe('active');
      expect(body.season.endsAt).toBeNull();

      const list = SeasonsResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/seasons' })).json(),
      );
      // 一届一个当前赛季：全列表恰好一条 active，且是刚建的这条；旧 active 已归档。
      const actives = list.seasons.filter((s) => s.status === 'active');
      expect(actives).toEqual([body.season]);
      for (const prev of priorActive) {
        expect(list.seasons.find((s) => s.id === prev.id)?.status).toBe('archived');
      }
    } finally {
      await app.close();
    }
  });

  test('同名 400；endsAt 早于 startsAt 400；缺 name 400', async () => {
    const app = buildTestHubServer();
    try {
      const dupName = (await app.inject({ method: 'GET', url: '/api/seasons' })).json()
        .seasons[0].name as string;
      const dup = await app.inject({
        method: 'POST',
        url: '/api/seasons',
        payload: { ...validBody, name: dupName },
      });
      expect(dup.statusCode).toBe(400);

      const inverted = await app.inject({
        method: 'POST',
        url: '/api/seasons',
        payload: { ...validBody, endsAt: '2026-08-01T00:00:00.000Z' },
      });
      expect(inverted.statusCode).toBe(400);

      const noName = await app.inject({
        method: 'POST',
        url: '/api/seasons',
        payload: { startsAt: validBody.startsAt },
      });
      expect(noName.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('status 不受客户端摆布：传 archived 也被服务端钉回 active（生而废弃拒绝）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/seasons',
        payload: { ...validBody, status: 'archived' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().season.status).toBe('active');
    } finally {
      await app.close();
    }
  });
});
