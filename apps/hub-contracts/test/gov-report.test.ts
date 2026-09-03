import { describe, expect, test } from 'vitest';
import {
  buildGovReport,
  generateRoboconBaselineTemplate,
  governanceScenarioFixture,
  inventoryScenarioFixture,
  renderGovReportHtml,
  renderGovReportMarkdown,
  scheduleScenarioFixture,
  type GovReportInput,
  type SeasonBaseline,
} from '../src/index.js';

/**
 * GOV-REPORT：项目级汇报派生 + Markdown/HTML 渲染。
 * I0 红线：在场统计只到组/资源维度，渲染产物不得出现成员名。
 */

const NOW = '2026-08-30T14:00:00.000Z';

function makeInput(overrides: Partial<GovReportInput> = {}): GovReportInput {
  const tpl = generateRoboconBaselineTemplate({
    semesterStart: '2026-03-02T00:00:00.000Z',
    competitionDate: '2026-08-24T00:00:00.000Z',
  });
  const baseline: SeasonBaseline = {
    id: 'baseline-1',
    seasonId: 'season-1',
    ...tpl,
  };
  return {
    generatedAt: NOW,
    seasonName: '2026 赛季',
    baseline,
    tasks: governanceScenarioFixture.tasks,
    groups: governanceScenarioFixture.groups,
    members: governanceScenarioFixture.members,
    resources: scheduleScenarioFixture.resources,
    sessions: scheduleScenarioFixture.resourceSessions,
    inventory: inventoryScenarioFixture,
    ...overrides,
  };
}

describe('buildGovReport', () => {
  test('四段数据齐备：里程碑计数/任务状态分布/在场组级聚合/库存台账', () => {
    const report = buildGovReport(makeInput());
    expect(report.seasonName).toBe('2026 赛季');
    expect(report.memberCount).toBe(governanceScenarioFixture.members.length);
    // 模板 6 节点全 pending
    expect(report.milestones.total).toBe(6);
    expect(report.milestones.pending).toBe(6);
    expect(report.milestones.passed).toBe(0);
    // 任务状态分布合计 = 总数
    const sum = Object.values(report.tasks.byStatus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(report.tasks.total);
    expect(report.tasks.byGroup.length).toBeGreaterThan(0);
    // 在场：组级聚合计数合计 = session 总数
    const presenceSum = report.presence.byGroup.reduce((a, x) => a + x.count, 0);
    expect(presenceSum).toBe(report.presence.sessionCount);
    // 库存：在装+预留+闲置 = 总件数
    const inv = report.inventory;
    expect(inv.mountedUnits + inv.reservedUnits + inv.idleUnits).toBe(inv.totalUnits);
  });

  test('六阶段状态走 deriveStageProgress 精确派生（模板带 stage 标签）', () => {
    const report = buildGovReport(makeInput());
    expect(report.milestones.stages).not.toBeNull();
    expect(report.milestones.stages!.map((s) => s.stage)).toEqual([
      'moduleDesign',
      'moduleAssembly',
      'moduleTest',
      'integratedAssembly',
      'integratedTest',
      'convergence',
    ]);
    // 全 pending → 第一段 current
    expect(report.milestones.stages![0].status).toBe('current');
  });

  test('无 baseline → milestones 归零、stages null，不炸', () => {
    const report = buildGovReport(makeInput({ baseline: null }));
    expect(report.milestones.total).toBe(0);
    expect(report.milestones.stages).toBeNull();
  });

  test('I0：在场统计无成员维度（byGroup/byResource 键均为组/资源名）', () => {
    const report = buildGovReport(makeInput());
    const memberNames = new Set(governanceScenarioFixture.members.map((m) => m.displayName));
    for (const row of [...report.presence.byGroup, ...report.presence.byResource]) {
      expect(memberNames.has(row.name)).toBe(false);
    }
  });
});

describe('renderGovReportMarkdown / renderGovReportHtml', () => {
  test('Markdown 含四大段标题与里程碑表格', () => {
    const md = renderGovReportMarkdown(buildGovReport(makeInput()));
    expect(md).toContain('# 项目进展汇报（2026 赛季）');
    expect(md).toContain('## 一、里程碑进度');
    expect(md).toContain('## 二、任务完成');
    expect(md).toContain('## 三、在场统计');
    expect(md).toContain('## 四、库存消耗');
    expect(md).toContain('| 节点 | 类型 | 计划日期 | 状态 | 车版 |');
    expect(md).toContain('G1：问题清单收敛（V2 设计拍板）');
  });

  test('HTML 自包含可打印：内联样式 + @media print + 表格转义', () => {
    const html = renderGovReportHtml(
      buildGovReport(
        makeInput({
          baseline: {
            ...makeInput().baseline!,
            milestones: [
              {
                id: 'm-xss',
                title: '<script>alert(1)</script>',
                kind: 'milestone',
                plannedAt: '2026-05-01T00:00:00.000Z',
                status: 'pending',
              },
            ],
          },
        }),
      ),
    );
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('@media print');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('渲染产物不出现成员名（I0 全链路）', () => {
    const report = buildGovReport(makeInput());
    const md = renderGovReportMarkdown(report);
    const html = renderGovReportHtml(report);
    for (const m of governanceScenarioFixture.members) {
      expect(md).not.toContain(m.displayName);
      expect(html).not.toContain(m.displayName);
    }
  });
});
