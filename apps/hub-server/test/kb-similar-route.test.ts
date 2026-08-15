import { afterAll, describe, expect, test } from 'vitest';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { KbSimilarResponseSchema } from '@teamhub/hub-contracts';

const app = buildTestHubServer();

afterAll(async () => {
  await app.close();
});

describe('GET /api/kb/similar', () => {
  test('「3508 电机过热」症状 → 召回历史 3508 卡 + A4 护栏 note', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/kb/similar?symptom=' + encodeURIComponent('3508 电机又过热了') + '&tags=' + encodeURIComponent('电机,3508,散热'),
    });
    expect(res.statusCode).toBe(200);
    const body = KbSimilarResponseSchema.parse(res.json());
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]?.issueId).toBe('iss-motor-3508-2025');
    // A4：响应明示只列候选、不断言同因
    expect(body.note).toContain('不断言');
    // C2：召回项主键 issue/errorCode，无人维度
    for (const item of body.items) {
      expect(item).not.toHaveProperty('memberId');
      expect(item).not.toHaveProperty('ownerId');
    }
  });

  test('缺 symptom → 400（不强行返回空结论）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/kb/similar' });
    expect(res.statusCode).toBe(400);
  });

  test('limit/minScore querystring 生效（coerce 成数）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/kb/similar?symptom=' + encodeURIComponent('CAN 丢包 电机失控') + '&tags=' + encodeURIComponent('CAN,电机') + '&limit=1&minScore=1',
    });
    expect(res.statusCode).toBe(200);
    const body = KbSimilarResponseSchema.parse(res.json());
    expect(body.items.length).toBeLessThanOrEqual(1);
  });

  test('无关症状 → items 空（A4：不凑结论）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/kb/similar?symptom=' + encodeURIComponent('报名表打不开') + '&tags=行政',
    });
    expect(res.statusCode).toBe(200);
    const body = KbSimilarResponseSchema.parse(res.json());
    expect(body.items.length).toBe(0);
  });
});
