import { afterAll, describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import { GroupGapsResponseSchema } from '../src/contracts.js';

const app = buildHubServer();

afterAll(async () => {
  await app.close();
});

describe('GET /api/group-gaps', () => {
  test('returns group-keyed direction gaps derived from the seeded fixture', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/group-gaps' });

    expect(response.statusCode).toBe(200);
    const body = GroupGapsResponseSchema.parse(response.json());

    // 走了 deriveDirectionGaps：fixture 的 open need-rtos(grp-program) 产一条组级缺口
    expect(body.gaps.length).toBeGreaterThan(0);
    const program = body.gaps.find((g) => g.groupId === 'grp-program');
    expect(program).toBeDefined();
    expect(program!.neededSkills).toContain('RTOS');

    // A1/I0 反监视护栏：整个响应体（含 factStatement）不含任何人维度
    const raw = response.body;
    expect(raw).not.toContain('memberId');
    expect(raw).not.toContain('displayName');
    expect(raw).not.toContain('confirmedBy');
    for (const gap of body.gaps) expect(gap).not.toHaveProperty('memberId');
  });
});
