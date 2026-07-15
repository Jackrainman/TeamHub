import { describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';
import {
  governanceScenarioFixture,
  ClaimTaskResponseSchema,
  AssignTaskResponseSchema,
  SetTaskPartnerResponseSchema,
  ConfirmCrossClaimResponseSchema,
  CompleteTaskResponseSchema,
  ReviewTaskResponseSchema,
  CreateTaskResponseSchema,
  TasksResponseSchema,
} from '@teamhub/hub-contracts';
import type { GovernanceSnapshot } from '@teamhub/hub-contracts';

// 挂单认领制窄写路由（TASK-POST-CLAIM，D-088 / docs/design/task-post-claim.md）：认领即生效免确认（唯一硬
// 闸在门上）；指派/跨组确认走组长鉴权（isGroupLeadOf）；验收走验收人名单（isGateReviewer，与欠条豁免同名
// 册）。红线：留名只落单卡，本簇不聚合/不按人筛。fixture 无任何 groupAdmin，故组长 200 用例注入 groupAdmin。

// fixture 成员均 role 'member'；m-progA/m-circuitD gateReviewer=true、m-ecB 非验收人。为测组长鉴权 200，
// 把某成员升为其所在组的 groupAdmin（体检裁定：组长 = role groupAdmin + groupId 匹配，无 Group.leadMemberId）。
function withGroupLead(memberId: string): GovernanceSnapshot {
  return {
    ...governanceScenarioFixture,
    members: governanceScenarioFixture.members.map((m) =>
      m.id === memberId ? { ...m, role: 'groupAdmin' as const } : m,
    ),
  };
}

const REVIEWER = { id: 'm-progA', displayName: '程序A', source: 'human' as const };
const NON_REVIEWER = { id: 'm-ecB', displayName: '电控B', source: 'human' as const };

describe('TASK-POST-CLAIM 路由：认领（claim）', () => {
  test('挂单认领即生效：POST /api/tasks 建无主活 → claim → ownerId + claimedAt + pending→inProgress', async () => {
    const app = buildHubServer();
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          projectId: 'prj-robots',
          groupId: 'grp-mech',
          title: '挂单：整理线束',
          rawSummary: '无主的活，谁来领',
          ownerId: null,
          collaboratorIds: [],
          intrinsicComplexity: 'trivial',
        },
      });
      expect(created.statusCode).toBe(201);
      const posted = CreateTaskResponseSchema.parse(created.json()).task;
      expect(posted.ownerId).toBeNull();
      expect(posted.status).toBe('pending');

      const res = await app.inject({
        method: 'POST',
        url: `/api/tasks/${posted.id}/claim`,
        payload: { memberId: 'm-mechD' },
      });
      expect(res.statusCode).toBe(200);
      const body = ClaimTaskResponseSchema.parse(res.json());
      expect(body.task.ownerId).toBe('m-mechD');
      expect(body.task.claimedAt).toBeTruthy();
      expect(body.task.status).toBe('inProgress'); // pending → inProgress
    } finally {
      await app.close();
    }
  });

  test('已有主 → 409（不覆盖他人的活）', async () => {
    const app = buildHubServer();
    try {
      // t-r1-arm-mount 已由 m-mechC 认领（fixture）
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-arm-mount/claim',
        payload: { memberId: 'm-mechD' },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });

  test('孤儿 memberId（不在名册）→ 400', async () => {
    const app = buildHubServer();
    try {
      // t-r1-integration 无主（convergence，ownerId=null）→ 不触发 409，孤儿 memberId 触发 400
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-integration/claim',
        payload: { memberId: 'm-ghost' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('缺 memberId（匿名无 body）→ 400 必须留名', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-integration/claim',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('未知 taskId → 404', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-nope/claim',
        payload: { memberId: 'm-mechD' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('TASK-POST-CLAIM 路由：指派 / 转派（assign）', () => {
  test('缺 reason → 400（schema 强制理由）', async () => {
    const app = buildHubServer({ store: new InMemoryGovStore(withGroupLead('m-ecB')) });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-chassis/assign',
        payload: { ownerId: 'm-progB', assignedBy: NON_REVIEWER },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('非组长 → 403', async () => {
    const app = buildHubServer(); // 默认 fixture 无 groupAdmin → 一律非组长
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-chassis/assign',
        payload: { ownerId: 'm-progB', reason: '带他上手底盘', assignedBy: NON_REVIEWER },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  test('组长 → 200：assignReason / assignedBy 落卡；claimedAt 清空', async () => {
    const store = new InMemoryGovStore(withGroupLead('m-ecB')); // m-ecB = grp-ec 组长
    const app = buildHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-chassis/assign', // grp-ec 任务
        payload: { ownerId: 'm-progB', reason: '带他上手底盘调试', assignedBy: NON_REVIEWER },
      });
      expect(res.statusCode).toBe(200);
      const body = AssignTaskResponseSchema.parse(res.json());
      expect(body.task.ownerId).toBe('m-progB');
      expect(body.task.assignReason).toBe('带他上手底盘调试');
      expect(body.task.assignedBy?.id).toBe('m-ecB');
      expect(body.task.claimedAt).toBeUndefined(); // 指派非认领
    } finally {
      await app.close();
    }
  });

  test('转派清搭档：先设本组搭档 → assign 换主后搭档失效', async () => {
    const store = new InMemoryGovStore(withGroupLead('m-ecB'));
    const app = buildHubServer({ store });
    try {
      // 先给 t-r1-chassis(grp-ec) 设本组搭档 m-progA(grp-ec)
      const partnered = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-chassis/partner',
        payload: { partnerMemberId: 'm-progA' },
      });
      expect(partnered.statusCode).toBe(200);
      expect(SetTaskPartnerResponseSchema.parse(partnered.json()).task.partnerMemberId).toBe(
        'm-progA',
      );

      // 转派（组长）→ 换主后搭档 / 跨组确认失效
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-chassis/assign',
        payload: { ownerId: 'm-mechC', reason: '转派给机械C练手', assignedBy: NON_REVIEWER },
      });
      expect(res.statusCode).toBe(200);
      const body = AssignTaskResponseSchema.parse(res.json());
      expect(body.task.ownerId).toBe('m-mechC');
      expect(body.task.partnerMemberId).toBeUndefined(); // 转派清搭档
    } finally {
      await app.close();
    }
  });

  test('缺 assignedBy（匿名无留名）→ 400', async () => {
    const app = buildHubServer({ store: new InMemoryGovStore(withGroupLead('m-ecB')) });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-chassis/assign',
        payload: { ownerId: 'm-progB', reason: '带他上手' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe('TASK-POST-CLAIM 路由：本组搭档（partner）', () => {
  test('本组成员 → 200；partnerMemberId 落卡', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-chassis/partner', // grp-ec
        payload: { partnerMemberId: 'm-progA' }, // m-progA grp-ec
      });
      expect(res.statusCode).toBe(200);
      expect(SetTaskPartnerResponseSchema.parse(res.json()).task.partnerMemberId).toBe('m-progA');
    } finally {
      await app.close();
    }
  });

  test('外组成员 → 400（跨组是学习通道，不是甩锅通道）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-chassis/partner', // grp-ec
        payload: { partnerMemberId: 'm-mechC' }, // m-mechC grp-mech ≠ grp-ec
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('搭档不在名册 → 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-chassis/partner',
        payload: { partnerMemberId: 'm-ghost' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe('TASK-POST-CLAIM 路由：跨组确认（confirm-cross-claim）', () => {
  test('非组长 → 403', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-chassis/confirm-cross-claim',
        payload: { confirmedBy: NON_REVIEWER },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  test('组长 → 200；crossClaimConfirmedBy 落卡（事后留名，非启动闸）', async () => {
    const app = buildHubServer({ store: new InMemoryGovStore(withGroupLead('m-ecB')) });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-chassis/confirm-cross-claim',
        payload: { confirmedBy: NON_REVIEWER },
      });
      expect(res.statusCode).toBe(200);
      expect(ConfirmCrossClaimResponseSchema.parse(res.json()).task.crossClaimConfirmedBy?.id).toBe(
        'm-ecB',
      );
    } finally {
      await app.close();
    }
  });

  test('缺 confirmedBy → 400', async () => {
    const app = buildHubServer({ store: new InMemoryGovStore(withGroupLead('m-ecB')) });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-chassis/confirm-cross-claim',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe('TASK-POST-CLAIM 路由：标完成（complete）', () => {
  test('complete → status done + completedBy 落卡', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-newboard/complete',
        payload: { completedBy: { id: 'm-circuitD', displayName: '电路D', source: 'human' } },
      });
      expect(res.statusCode).toBe(200);
      const body = CompleteTaskResponseSchema.parse(res.json());
      expect(body.task.status).toBe('done');
      expect(body.task.completedBy?.id).toBe('m-circuitD');
    } finally {
      await app.close();
    }
  });

  test('缺 completedBy → 400；未知 id → 404', async () => {
    const app = buildHubServer();
    try {
      expect(
        (await app.inject({ method: 'POST', url: '/api/tasks/t-r1-newboard/complete', payload: {} }))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/tasks/t-nope/complete',
            payload: { completedBy: REVIEWER },
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('TASK-POST-CLAIM 路由：验收 / 抽查（review）', () => {
  test('非验收人名单 → 403', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-arm-mount/review',
        payload: { outcome: 'accept', reviewedBy: NON_REVIEWER }, // m-ecB 非 gateReviewer
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  test('accept → reviewedBy 留名；status 保持 done', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-arm-mount/review', // done 大任务（有下游 dep-001）
        payload: { outcome: 'accept', reviewedBy: REVIEWER }, // m-progA gateReviewer
      });
      expect(res.statusCode).toBe(200);
      const body = ReviewTaskResponseSchema.parse(res.json());
      expect(body.task.reviewedBy?.id).toBe('m-progA');
      expect(body.task.status).toBe('done'); // accept 不改状态
    } finally {
      await app.close();
    }
  });

  test('reject（打回）→ status 回 inProgress + reviewNote 打回理由 + reviewedBy 留名', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-arm-mount/review',
        payload: { outcome: 'reject', reviewedBy: REVIEWER, note: '焊点虚焊，重焊后再验' },
      });
      expect(res.statusCode).toBe(200);
      const body = ReviewTaskResponseSchema.parse(res.json());
      expect(body.task.status).toBe('inProgress'); // 打回
      expect(body.task.reviewNote).toBe('焊点虚焊，重焊后再验');
      expect(body.task.reviewedBy?.id).toBe('m-progA');
    } finally {
      await app.close();
    }
  });

  test('缺 reviewedBy → 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-arm-mount/review',
        payload: { outcome: 'accept' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe('TASK-POST-CLAIM：GET /api/tasks?q= 子串搜 + isBig 元信息', () => {
  test('q= 搜到 title（大小写不敏感）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/tasks?q=r1' });
      expect(res.statusCode).toBe(200);
      const body = TasksResponseSchema.parse(res.json());
      // 'R1 底盘调试' 等标题含 R1（q 'r1' 小写命中）
      expect(body.tasks.some((t) => t.id === 't-r1-chassis')).toBe(true);
      expect(body.tasks.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  test('q= 搜到 rawSummary（title 不含该词）', async () => {
    const app = buildHubServer();
    try {
      // '中断时序' 只在 t-r1-chassis 的 rawSummary，不在其 title
      const res = await app.inject({ method: 'GET', url: '/api/tasks?q=中断时序' });
      const body = TasksResponseSchema.parse(res.json());
      expect(body.tasks.map((t) => t.id)).toContain('t-r1-chassis');
    } finally {
      await app.close();
    }
  });

  test('q= 无命中 → 空列表；缺省 q → 全部', async () => {
    const app = buildHubServer();
    try {
      const empty = TasksResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/tasks?q=zzz-no-such-task' })).json(),
      );
      expect(empty.tasks).toEqual([]);

      const all = TasksResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/tasks' })).json(),
      );
      expect(all.tasks.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  test('isBig：挂门任务 / 有下游任务 = true；无门无下游 = false', async () => {
    const app = buildHubServer();
    try {
      const body = TasksResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/tasks' })).json(),
      );
      const byId = new Map(body.tasks.map((t) => [t.id, t.isBig]));
      expect(byId.get('t-r1-newboard')).toBe(true); // 挂门 m-g4
      expect(byId.get('t-r1-arm-mount')).toBe(true); // 有下游 dep-001
      expect(byId.get('t-r2-spare')).toBe(false); // 无门、无下游
    } finally {
      await app.close();
    }
  });
});
