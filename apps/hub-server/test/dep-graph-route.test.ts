import { afterAll, describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import { DepGraphSchema } from '@teamhub/hub-contracts';

const app = buildHubServer();

afterAll(async () => {
  await app.close();
});

describe('GET /api/dep-graph', () => {
  test('returns a DepGraph derived from the seeded governance fixture', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/dep-graph' });

    expect(response.statusCode).toBe(200);
    const body = DepGraphSchema.parse(response.json());

    // 走了 toDepGraphView 而非空壳：锚点场景的任务节点全在
    expect(body.nodes.length).toBeGreaterThan(0);

    // fixture 场景含被卡链 + 自由闲，证明派生算法在 GOVERNANCE_SCENARIO_NOW 下真正跑了
    expect(
      body.summary.blockedIdleCount + body.summary.freeIdleCount,
    ).toBeGreaterThan(0);

    // C2 反排名护栏：节点主键是 task/group，不暴露 memberId 聚合维度
    for (const node of body.nodes) {
      expect(node).not.toHaveProperty('memberId');
    }
  });
});
