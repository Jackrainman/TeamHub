import { describe, expect, test } from 'vitest';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import {
  BaselineResponseSchema,
  UpdateBaselineResponseSchema,
  PassMilestoneResponseSchema,
} from '@teamhub/hub-contracts';

// governanceScenarioFixture 里真实存在的归档物 id（同 artifact-upload.test.ts）——用于
// evidenceRefs「先验存在」校验测试的合法引用。
const KNOWN_ARTIFACT_ID = 'artifact-gripper-v1';

const seasonId = 'season-baseline-route-1';

describe('倒排基准线路由（BASELINE-CORE，S4）', () => {
  test('GET /api/baseline：无 seasonId → 400', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/baseline' });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('GET /api/baseline：赛季无基准线 → 200 { baseline: null }（非 404，GET 语义上"还没有"合法）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/baseline?seasonId=${seasonId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = BaselineResponseSchema.parse(res.json());
      expect(body.baseline).toBeNull();
    } finally {
      await app.close();
    }
  });

  test('PATCH /api/baseline：生成模板（不存在则创建）→ 200，读回一致', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/baseline?seasonId=${seasonId}`,
        payload: {
          anchors: { semesterStart: '2026-09-01T00:00:00.000Z' },
          milestones: [
            {
              id: 'm-g1',
              title: '门 G1：问题清单收敛',
              kind: 'gate',
              plannedAt: '2026-11-01T00:00:00.000Z',
              status: 'pending',
            },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = UpdateBaselineResponseSchema.parse(res.json());
      expect(body.baseline.seasonId).toBe(seasonId);
      expect(body.baseline.milestones).toHaveLength(1);

      const reread = await app.inject({
        method: 'GET',
        url: `/api/baseline?seasonId=${seasonId}`,
      });
      const rereadBody = BaselineResponseSchema.parse(reread.json());
      expect(rereadBody.baseline?.milestones[0].id).toBe('m-g1');
    } finally {
      await app.close();
    }
  });

  test('PATCH /api/baseline：无 seasonId → 400', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/baseline',
        payload: { anchors: {} },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('PATCH /api/baseline：segment 低频调整的边界兜底——结束早于开始 → 400 BASELINE_SEGMENT_RANGE_INVALID；合法段 → 200', async () => {
    const app = buildTestHubServer();
    try {
      const bad = await app.inject({
        method: 'PATCH',
        url: `/api/baseline?seasonId=${seasonId}`,
        payload: {
          segments: [
            {
              kind: 'vacuum',
              startsAt: '2027-02-01T00:00:00.000Z',
              endsAt: '2027-01-01T00:00:00.000Z',
              label: '反了的段',
            },
          ],
        },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().code).toBe('BASELINE_SEGMENT_RANGE_INVALID');

      const good = await app.inject({
        method: 'PATCH',
        url: `/api/baseline?seasonId=${seasonId}`,
        payload: {
          segments: [
            {
              kind: 'semester',
              startsAt: '2026-09-01T00:00:00.000Z',
              endsAt: '2026-12-01T00:00:00.000Z',
              label: '第一学期',
            },
          ],
        },
      });
      expect(good.statusCode).toBe(200);
      const body = UpdateBaselineResponseSchema.parse(good.json());
      expect(body.baseline.segments).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  test('POST /milestones/:id/pass：证据引用不存在的 artifactId → 400（避孤儿引用）', async () => {
    const app = buildTestHubServer();
    try {
      await app.inject({
        method: 'PATCH',
        url: `/api/baseline?seasonId=${seasonId}`,
        payload: {
          milestones: [
            {
              id: 'm-g1',
              title: '门 G1',
              kind: 'gate',
              plannedAt: '2026-11-01T00:00:00.000Z',
              status: 'pending',
            },
          ],
        },
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/baseline/milestones/m-g1/pass?seasonId=${seasonId}`,
        payload: {
          status: 'passed',
          passedBy: { id: 'm-senior-1', displayName: '大三验收人', source: 'human' },
          evidenceRefs: ['artifact-does-not-exist'],
        },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('POST /milestones/:id/pass：合法过门 → 200，status=passed，响应剥 passedBy（I0 沿 confirmedBy 先例）', async () => {
    const app = buildTestHubServer();
    try {
      await app.inject({
        method: 'PATCH',
        url: `/api/baseline?seasonId=${seasonId}`,
        payload: {
          milestones: [
            {
              id: 'm-g1',
              title: '门 G1',
              kind: 'gate',
              plannedAt: '2026-11-01T00:00:00.000Z',
              status: 'pending',
            },
          ],
        },
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/baseline/milestones/m-g1/pass?seasonId=${seasonId}`,
        payload: {
          status: 'passed',
          passedBy: { id: 'm-senior-1', displayName: '大三验收人', source: 'human' },
          evidenceRefs: [KNOWN_ARTIFACT_ID],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = PassMilestoneResponseSchema.parse(res.json());
      const milestone = body.baseline.milestones.find((m) => m.id === 'm-g1');
      expect(milestone?.status).toBe('passed');
      expect(milestone?.evidenceRefs).toEqual([KNOWN_ARTIFACT_ID]);
      // I0：读视图（含刚过门这次响应）永不回 passedBy。
      expect(milestone).not.toHaveProperty('passedBy');
      expect(JSON.stringify(body)).not.toContain('大三验收人');
    } finally {
      await app.close();
    }
  });

  test('POST /milestones/:id/pass：milestoneId 未命中 → 404', async () => {
    const app = buildTestHubServer();
    try {
      await app.inject({
        method: 'PATCH',
        url: `/api/baseline?seasonId=${seasonId}`,
        payload: { milestones: [] },
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/baseline/milestones/m-nope/pass?seasonId=${seasonId}`,
        payload: { status: 'passed' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('写鉴权：配 writeToken 后无 token PATCH /api/baseline → 401，带 token → 200', async () => {
    const app = buildTestHubServer({ writeToken: 'secret-baseline' });
    try {
      const noToken = await app.inject({
        method: 'PATCH',
        url: `/api/baseline?seasonId=${seasonId}`,
        payload: { anchors: {} },
      });
      expect(noToken.statusCode).toBe(401);

      const withToken = await app.inject({
        method: 'PATCH',
        url: `/api/baseline?seasonId=${seasonId}`,
        headers: { authorization: 'Bearer secret-baseline' },
        payload: { anchors: {} },
      });
      expect(withToken.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
