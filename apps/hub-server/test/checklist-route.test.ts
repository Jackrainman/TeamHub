import { describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import {
  ChecklistItemsResponseSchema,
  CreateChecklistItemResponseSchema,
  ClearChecklistItemResponseSchema,
  WaiveChecklistItemResponseSchema,
  ChecklistTemplatesResponseSchema,
} from '@teamhub/hub-contracts';
import { SetGateReviewerResponseSchema } from '@teamhub/hub-contracts';

// demo 基准线 baseline-season-robocon-2026 的 seasonId（fixtures.ts checklistScenarioFixture 挂它）：
// m-g4 = pending 整车级门；chk-demo-1 = pending 挂 m-g4 的欠条（'24V→5V 模块无溯源，先用着'）；
// chk-demo-2 = pending 自选到期日欠条。默认 gov fixture：m-progA/m-circuitD gateReviewer=true、m-ecB 非验收人。
const SEASON = 'season-robocon-2026';
const DEMO_IOU_TITLE = '24V→5V 模块无溯源，先用着';
const REVIEWER = { id: 'm-progA', displayName: '程序A', source: 'human' as const };
const NON_REVIEWER = { id: 'm-ecB', displayName: '电控B', source: 'human' as const };

describe('门检查单 / 欠条路由（GATE-CHECKLIST-IOU，C3）', () => {
  test('GET /api/checklist：无 seasonId → 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/checklist' });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('GET /api/checklist：赛季无基准线 → 200 { items: [] }（GET 语义上"还没有"合法）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/checklist?seasonId=season-no-baseline',
      });
      expect(res.statusCode).toBe(200);
      expect(ChecklistItemsResponseSchema.parse(res.json()).items).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('POST 建 → GET 列，带名不剥（清偿后读回 clearedBy = D-085 事实层）', async () => {
    const app = buildHubServer();
    try {
      const created = await app.inject({
        method: 'POST',
        url: `/api/checklist?seasonId=${SEASON}`,
        payload: { title: '新欠条：临时线束先用着', anchorMilestoneId: 'm-g1' },
      });
      expect(created.statusCode).toBe(201);
      const createdBody = CreateChecklistItemResponseSchema.parse(created.json());
      expect(createdBody.item.status).toBe('pending'); // server 钉 pending
      expect(createdBody.item.origin).toBe('iou'); // CreateChecklistItemRequestSchema.default('iou')
      expect(createdBody.item.seasonBaselineId).toBe('baseline-season-robocon-2026');

      const list = await app.inject({ method: 'GET', url: `/api/checklist?seasonId=${SEASON}` });
      const listBody = ChecklistItemsResponseSchema.parse(list.json());
      expect(listBody.items.some((i) => i.id === createdBody.item.id)).toBe(true);

      // 带名不剥：清偿 chk-demo-2 后，读视图直回 clearedBy（事实层带名，与 baseline 剥 passedBy 刻意不同）。
      const cleared = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-demo-2/clear?seasonId=${SEASON}`,
        payload: { clearedBy: REVIEWER },
      });
      expect(cleared.statusCode).toBe(200);
      const list2 = ChecklistItemsResponseSchema.parse(
        (await app.inject({ method: 'GET', url: `/api/checklist?seasonId=${SEASON}` })).json(),
      );
      const demo2 = list2.items.find((i) => i.id === 'chk-demo-2');
      expect(demo2?.status).toBe('passed');
      expect(demo2?.clearedBy?.id).toBe('m-progA'); // 读契约不剥名
    } finally {
      await app.close();
    }
  });

  test('POST /api/checklist：赛季无基准线 → 404（欠条须挂基准线）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/checklist?seasonId=season-no-baseline',
        payload: { title: 'x', anchorDueAt: '2026-12-01T00:00:00.000Z' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('POST /api/checklist：孤儿 anchorMilestoneId（未命中该 baseline 里程碑）→ 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/checklist?seasonId=${SEASON}`,
        payload: { title: 'x', anchorMilestoneId: 'm-does-not-exist' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('POST /api/checklist：挂接二选一违规（both / neither）→ 400', async () => {
    const app = buildHubServer();
    try {
      const both = await app.inject({
        method: 'POST',
        url: `/api/checklist?seasonId=${SEASON}`,
        payload: { title: 'x', anchorMilestoneId: 'm-g1', anchorDueAt: '2026-12-01T00:00:00.000Z' },
      });
      expect(both.statusCode).toBe(400);
      const neither = await app.inject({
        method: 'POST',
        url: `/api/checklist?seasonId=${SEASON}`,
        payload: { title: 'x' },
      });
      expect(neither.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('POST clear：匿名无留名 → 400；留名 → 200；不存在 → 404；已非 pending → 409', async () => {
    const app = buildHubServer();
    try {
      // 匿名 + 无 body.clearedBy → 400 清偿必须留名
      const noName = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-demo-1/clear?seasonId=${SEASON}`,
        payload: {},
      });
      expect(noName.statusCode).toBe(400);

      // 留名 → 200，事实卡带 clearedBy
      const ok = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-demo-1/clear?seasonId=${SEASON}`,
        payload: { clearedBy: REVIEWER },
      });
      expect(ok.statusCode).toBe(200);
      const okBody = ClearChecklistItemResponseSchema.parse(ok.json());
      expect(okBody.item.status).toBe('passed');
      expect(okBody.item.clearedBy?.id).toBe('m-progA');

      // 已 passed 再清 → 409
      const again = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-demo-1/clear?seasonId=${SEASON}`,
        payload: { clearedBy: REVIEWER },
      });
      expect(again.statusCode).toBe(409);

      // 不存在 → 404
      const missing = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-nope/clear?seasonId=${SEASON}`,
        payload: { clearedBy: REVIEWER },
      });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('POST waive：缺 reason → 400；非名单 → 403；名单成员 → 200（带名+理由不剥）；匿名无留名 → 400', async () => {
    const app = buildHubServer();
    try {
      // 缺 waiveReason（schema 强制非空）→ 400
      const noReason = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-demo-1/waive?seasonId=${SEASON}`,
        payload: { waivedBy: REVIEWER },
      });
      expect(noReason.statusCode).toBe(400);

      // 匿名无 body.waivedBy → 400 豁免必须留名
      const noName = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-demo-1/waive?seasonId=${SEASON}`,
        payload: { waiveReason: '书面豁免理由' },
      });
      expect(noName.statusCode).toBe(400);

      // 非验收人名单 → 403
      const forbidden = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-demo-1/waive?seasonId=${SEASON}`,
        payload: { waivedBy: NON_REVIEWER, waiveReason: '想豁免但没资格' },
      });
      expect(forbidden.statusCode).toBe(403);

      // 名单成员（m-progA gateReviewer=true）→ 200，事实卡带 waivedBy + waiveReason（不剥）
      const ok = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-demo-1/waive?seasonId=${SEASON}`,
        payload: { waivedBy: REVIEWER, waiveReason: '实验车用完全合法，书面认账' },
      });
      expect(ok.statusCode).toBe(200);
      const okBody = WaiveChecklistItemResponseSchema.parse(ok.json());
      expect(okBody.item.status).toBe('waived');
      expect(okBody.item.waivedBy?.id).toBe('m-progA');
      expect(okBody.item.waiveReason).toBe('实验车用完全合法，书面认账');
    } finally {
      await app.close();
    }
  });

  test('过门硬闸（本刀灵魂）：m-g4 挂 pending 欠条 → pass 被拦 400（detail 含项 title）→ 清完再过 200', async () => {
    const app = buildHubServer();
    try {
      // chk-demo-1（pending）挂 m-g4 → 过门被拦，detail 列出未清项 title
      const blocked = await app.inject({
        method: 'POST',
        url: `/api/baseline/milestones/m-g4/pass?seasonId=${SEASON}`,
        payload: { status: 'passed' },
      });
      expect(blocked.statusCode).toBe(400);
      expect((blocked.json() as { detail: string }).detail).toContain(DEMO_IOU_TITLE);

      // 清偿 chk-demo-1
      const cleared = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-demo-1/clear?seasonId=${SEASON}`,
        payload: { clearedBy: REVIEWER },
      });
      expect(cleared.statusCode).toBe(200);

      // m-g4 再无 pending 挂靠项 → 过门 200
      const passed = await app.inject({
        method: 'POST',
        url: `/api/baseline/milestones/m-g4/pass?seasonId=${SEASON}`,
        payload: { status: 'passed' },
      });
      expect(passed.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('过门硬闸：豁免完再过 200（waive 路径也解闸）', async () => {
    const app = buildHubServer();
    try {
      const waived = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-demo-1/waive?seasonId=${SEASON}`,
        payload: { waivedBy: REVIEWER, waiveReason: '书面豁免，判断留档' },
      });
      expect(waived.statusCode).toBe(200);
      const passed = await app.inject({
        method: 'POST',
        url: `/api/baseline/milestones/m-g4/pass?seasonId=${SEASON}`,
        payload: { status: 'passed' },
      });
      expect(passed.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('过门硬闸：status=missed 不拦（记录验收失败 → 200，即便 m-g4 仍有 pending 欠条）', async () => {
    const app = buildHubServer();
    try {
      const missed = await app.inject({
        method: 'POST',
        url: `/api/baseline/milestones/m-g4/pass?seasonId=${SEASON}`,
        payload: { status: 'missed' },
      });
      expect(missed.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('GET /api/checklist/templates → 200 { templates: [] }（seed 留空等复盘导入）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/checklist/templates' });
      expect(res.statusCode).toBe(200);
      expect(ChecklistTemplatesResponseSchema.parse(res.json()).templates).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('PUT /api/members/:id/gate-reviewer：开关生效（非名单 waive 403 → 开权后 200）+ 剥 pinHash + 不存在 404', async () => {
    const app = buildHubServer();
    try {
      // 开权前 m-ecB waive → 403
      const before = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-demo-1/waive?seasonId=${SEASON}`,
        payload: { waivedBy: NON_REVIEWER, waiveReason: '换届前无权' },
      });
      expect(before.statusCode).toBe(403);

      // 加进验收人名单
      const put = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/gate-reviewer',
        payload: { gateReviewer: true },
      });
      expect(put.statusCode).toBe(200);
      const putBody = SetGateReviewerResponseSchema.parse(put.json());
      expect(putBody.member.gateReviewer).toBe(true);
      expect(JSON.stringify(putBody)).not.toContain('pinHash'); // 密钥纪律

      // 开权后 m-ecB waive → 200
      const after = await app.inject({
        method: 'POST',
        url: `/api/checklist/chk-demo-1/waive?seasonId=${SEASON}`,
        payload: { waivedBy: NON_REVIEWER, waiveReason: '换届后新增验收人，书面认账' },
      });
      expect(after.statusCode).toBe(200);

      // 成员不存在 → 404
      const missing = await app.inject({
        method: 'PUT',
        url: '/api/members/m-nope/gate-reviewer',
        payload: { gateReviewer: true },
      });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('写门覆盖 PUT /api/members/:id/gate-reviewer：配 writeToken 无 token → 401', async () => {
    const app = buildHubServer({ writeToken: 'secret-gr' });
    try {
      const noToken = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/gate-reviewer',
        payload: { gateReviewer: true },
      });
      expect(noToken.statusCode).toBe(401);
      const withToken = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/gate-reviewer',
        headers: { authorization: 'Bearer secret-gr' },
        payload: { gateReviewer: true },
      });
      expect(withToken.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
