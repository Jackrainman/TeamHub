import { describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import { KbCloseoutResponseSchema } from '../src/contracts.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

const liveIssue = {
  id: 'iss-live-closeout',
  projectId: 'prj-robots',
  title: '云台舵机抖动',
  rawInput: '云台舵机一直抖',
  normalizedSummary: '云台舵机 PID 参数不当导致抖动',
  symptomSummary: '云台舵机抖动',
  suspectedDirections: ['PID 参数'],
  suggestedActions: ['调 PID'],
  status: 'investigating' as const,
  severity: 'medium' as const,
  tags: ['云台', '舵机'],
  relatedFiles: ['src/gimbal/pid.c'],
  relatedCommits: ['abc1234def'],
  relatedHistoricalIssueIds: [],
  createdAt: '2026-06-13T08:00:00.000Z',
  updatedAt: '2026-06-13T08:00:00.000Z',
};

describe('POST /api/kb/closeout', () => {
  test('结案成功 → 归档+错误表+已归档卡+派生知识节点；节点持久到 store', async () => {
    const store = new InMemoryGovStore();
    const before = (await store.getSnapshot()).knowledgeNodes.length;
    const app = buildHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/kb/closeout',
        payload: {
          issue: liveIssue,
          category: '云台',
          rootCause: 'PID 比例项过大',
          resolution: '下调 Kp + 加滤波',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = KbCloseoutResponseSchema.parse(res.json());

      expect(body.updatedIssueCard.status).toBe('archived');
      expect(body.errorEntry.errorCode).toMatch(/^DBG-\d{8}-\d{3}$/);
      // I0：归档来源 hybrid 默认、不记结案人
      expect(body.archiveDocument.generatedBy).toBe('hybrid');
      // 结案派生知识节点持久化
      expect(body.knowledgeNode.id).toMatch(/^kn-cl-/);
      expect(body.knowledgeNode.name).toContain('云台舵机抖动');
      const after = (await store.getSnapshot()).knowledgeNodes.length;
      expect(after).toBe(before + 1);
    } finally {
      await app.close();
    }
  });

  test('errorCode 确定性：同 issue 同结案时刻可复现', async () => {
    const app = buildHubServer();
    try {
      const payload = {
        issue: liveIssue,
        category: '云台',
        rootCause: 'PID 比例项过大',
        resolution: '下调 Kp',
      };
      const r1 = await app.inject({ method: 'POST', url: '/api/kb/closeout', payload });
      const r2 = await app.inject({ method: 'POST', url: '/api/kb/closeout', payload });
      expect(r1.json().errorEntry.errorCode).toBe(r2.json().errorEntry.errorCode);
    } finally {
      await app.close();
    }
  });

  test('缺 rootCause → 422（结案仍需手填根因，不伪造完成）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/kb/closeout',
        payload: { issue: liveIssue, category: '云台', rootCause: '', resolution: '修了' },
      });
      expect(res.statusCode).toBe(422);
    } finally {
      await app.close();
    }
  });

  test('body 不合法（缺 issue）→ 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/kb/closeout',
        payload: { rootCause: 'x', resolution: 'y' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
