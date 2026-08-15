import { describe, expect, test } from 'vitest';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { KbCloseoutResponseSchema } from '@teamhub/hub-contracts';
import { InMemoryGovStore } from './support/inmemory-gov-store.js';
import { InMemoryKbStore } from './support/inmemory-kb-store.js';

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
    const app = buildTestHubServer({ store });
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
      expect(res.statusCode).toBe(201); // L4：结案创建归档/错误表/知识节点 → 201
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

  test('闭环：结案上传后下次 similar 能召回（回灌检索语料）', async () => {
    const app = buildTestHubServer();
    const url =
      '/api/kb/similar?symptom=' +
      encodeURIComponent('云台舵机抖动') +
      '&tags=' +
      encodeURIComponent('云台,舵机') +
      '&minScore=0';
    const hasLive = (res: { json(): { items: { issueId: string }[] } }) =>
      res.json().items.some((item) => item.issueId === liveIssue.id);
    try {
      // 上传前：seed 语料（CAN/3508/MicroROS）里查不到这条云台舵机问题
      const before = await app.inject({ method: 'GET', url });
      expect(before.statusCode).toBe(200);
      expect(hasLive(before)).toBe(false);

      // 结案上传
      const closeout = await app.inject({
        method: 'POST',
        url: '/api/kb/closeout',
        payload: {
          issue: liveIssue,
          category: '云台',
          rootCause: 'PID 比例项过大',
          resolution: '下调 Kp + 加滤波',
        },
      });
      expect(closeout.statusCode).toBe(201); // L4：结案 → 201

      // 上传后：同症状现在召回到刚结案那条（闭环闭上）
      const after = await app.inject({ method: 'GET', url });
      expect(after.statusCode).toBe(200);
      expect(hasLive(after)).toBe(true);
    } finally {
      await app.close();
    }
  });

  // M9（AUDIT-FIXES 部署前必修）：errorCode 改单调序号后，同日多次结案得**不同**码——
  // 原「同 issue 同时刻复现同码」恰是审计指出的碰撞 bug（~38 次/日生日碰撞 → 静默覆盖、污染 kb-similar
  // 跨赛季查找）。新契约：每次结案占一个递增序号，格式仍 DBG-YYYYMMDD-NNN、不碰撞。
  test('errorCode 单调不碰撞（M9）：同日多次结案产出不同的码', async () => {
    const app = buildTestHubServer();
    try {
      const payload = {
        issue: liveIssue,
        category: '云台',
        rootCause: 'PID 比例项过大',
        resolution: '下调 Kp',
      };
      const r1 = await app.inject({ method: 'POST', url: '/api/kb/closeout', payload });
      const r2 = await app.inject({ method: 'POST', url: '/api/kb/closeout', payload });
      const c1 = r1.json().errorEntry.errorCode as string;
      const c2 = r2.json().errorEntry.errorCode as string;
      expect(c1).toMatch(/^DBG-\d{8}-\d{3}$/);
      expect(c2).toMatch(/^DBG-\d{8}-\d{3}$/);
      expect(c1).not.toBe(c2);
    } finally {
      await app.close();
    }
  });

  // 修复 #2：重复结案幂等。同一 issue 复结案（500 重试 / 重复提交）不应在治理快照 / 检索语料堆出重复主键——
  // KnowledgeNode 按 name dedup、errorEntry 按 id（err-${issue.id}）upsert、archiveDocument 按 issueId upsert、
  // issueCard 按 id upsert。两次结案后各计数仍是 +1。
  test('重复结案幂等（#2）：KnowledgeNode / errorEntry / archiveDocument / issueCard 主键不重复', async () => {
    const store = new InMemoryGovStore();
    const kbStore = new InMemoryKbStore();
    const kbBefore = await kbStore.getKbSnapshot();
    const errBefore = kbBefore.errorEntries.length;
    const archiveBefore = kbBefore.archiveDocuments.length;
    const cardBefore = kbBefore.issueCards.length;
    const nodesBefore = (await store.getSnapshot()).knowledgeNodes.length;
    const app = buildTestHubServer({ store, kbStore });
    const payload = {
      issue: liveIssue,
      category: '云台',
      rootCause: 'PID 比例项过大',
      resolution: '下调 Kp + 加滤波',
    };
    try {
      const r1 = await app.inject({ method: 'POST', url: '/api/kb/closeout', payload });
      const r2 = await app.inject({ method: 'POST', url: '/api/kb/closeout', payload });
      expect(r1.statusCode).toBe(201);
      expect(r2.statusCode).toBe(201);

      // 治理快照：KnowledgeNode 只 +1（同 name 原地覆盖，id 稳定）
      const nodes = (await store.getSnapshot()).knowledgeNodes;
      expect(nodes.length).toBe(nodesBefore + 1);
      expect(r1.json().knowledgeNode.id).toBe(r2.json().knowledgeNode.id);

      // 检索语料：errorEntry(同 id) / archiveDocument(同 issueId) / issueCard(同 id) 各只 +1
      const kbAfter = await kbStore.getKbSnapshot();
      expect(kbAfter.errorEntries.length).toBe(errBefore + 1);
      expect(kbAfter.archiveDocuments.length).toBe(archiveBefore + 1);
      expect(kbAfter.issueCards.length).toBe(cardBefore + 1);
      expect(
        kbAfter.errorEntries.filter((e) => e.id === `err-${liveIssue.id}`),
      ).toHaveLength(1);
      expect(
        kbAfter.archiveDocuments.filter((d) => d.issueId === liveIssue.id),
      ).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  // M19（AUDIT-FIXES schema 边界批）：rootCause 必填约束已推进 KbCloseoutRequestSchema
  // （.trim().min(1)），空值在 safeParse 边界即被拒 → 400（结案仍需手填根因，不伪造完成）。
  // 此前由 buildCloseoutFromIssue 运行时检查兜底 → 422；现约束上提到边界，请求仍被拒，仅状态码 422→400。
  test('缺 rootCause → 400（结案仍需手填根因，约束已上提到边界 schema，不伪造完成）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/kb/closeout',
        payload: { issue: liveIssue, category: '云台', rootCause: '', resolution: '修了' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('body 不合法（缺 issue）→ 400', async () => {
    const app = buildTestHubServer();
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
