// ---------------------------------------------------------------------------
// GOV-REPORT（拍板=B 导出文件形态）：项目级汇报——一键导出 Markdown / 可打印 HTML
// （浏览器打印即 PDF）。纯派生零 IO：buildGovReport 汇总 → renderGovReportMarkdown /
// renderGovReportHtml 渲染。数据全有：里程碑进度（baseline）/任务完成（tasks）/
// 在场统计（resource sessions，I0 红线=只到组/资源维度，绝无个人出勤计数）/
// 库存消耗（inventory actions + ledger）。
// 受众=老师，文案恒中文（不进 console i18n 体系）。
// ---------------------------------------------------------------------------

import type { SeasonBaseline } from './domains/baseline/model.js';
import { deriveStageProgress, type StagePipelineStatus } from './domains/baseline/policies.js';
import type { Group, Member, Task, TaskStatus } from './pm-core.js';
import type { ResourceSession, SharedResource } from './schedule-infra.js';
import { deriveInventoryLedger, deriveShortfalls, type InventorySnapshot } from './domains/inventory/index.js';

export interface GovReportInput {
  generatedAt: string;
  /** 活跃赛季名（无赛季时 null）。 */
  seasonName: string | null;
  baseline: SeasonBaseline | null;
  tasks: readonly Task[];
  groups: readonly Group[];
  members: readonly Member[];
  resources: readonly SharedResource[];
  sessions: readonly ResourceSession[];
  inventory: InventorySnapshot;
}

export interface GovReportMilestoneRow {
  title: string;
  kind: string;
  plannedAt: string;
  status: string;
  robotVersion: string | null;
}

export interface GovReportGroupCount {
  name: string;
  total: number;
  done: number;
}

export interface GovReport {
  generatedAt: string;
  seasonName: string | null;
  memberCount: number;
  groupCount: number;
  milestones: {
    total: number;
    passed: number;
    pending: number;
    missed: number;
    rows: GovReportMilestoneRow[];
    /** 六阶段状态（STAGE-PIPELINE 派生）；无 baseline 时 null。 */
    stages: Array<{ stage: string; status: StagePipelineStatus; endsAt: string }> | null;
  };
  tasks: {
    total: number;
    byStatus: Record<TaskStatus, number>;
    byGroup: GovReportGroupCount[];
  };
  presence: {
    sessionCount: number;
    distinctWindows: number;
    /** I0：组级整数，绝无 memberId 维度。 */
    byGroup: Array<{ name: string; count: number }>;
    byResource: Array<{ name: string; count: number }>;
  };
  inventory: {
    partTypeCount: number;
    totalUnits: number;
    mountedUnits: number;
    reservedUnits: number;
    idleUnits: number;
    damagedUnits: number;
    restockedUnits: number;
    lowStock: string[];
  };
}

export const GOV_REPORT_STAGE_LABELS: Record<string, string> = {
  moduleDesign: '模块设计',
  moduleAssembly: '模块组装',
  moduleTest: '模块测试',
  integratedAssembly: '集成组装',
  integratedTest: '集成测试',
  convergence: '待联调',
};

const STAGE_STATUS_LABELS: Record<StagePipelineStatus, string> = {
  done: '已完成',
  current: '进行中',
  upcoming: '未开始',
};

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '待启动',
  inProgress: '进行中',
  blocked: '卡住',
  done: '已完成',
  shelved: '已搁置',
};

const MILESTONE_STATUS_LABELS: Record<string, string> = {
  pending: '待达成',
  passed: '已达成',
  missed: '已错过',
};

export function buildGovReport(input: GovReportInput): GovReport {
  const groupName = (id: string) => input.groups.find((g) => g.id === id)?.name ?? id;
  const resourceName = (id: string) => {
    const r = input.resources.find((x) => x.id === id);
    return r?.displayCode ?? r?.name ?? id;
  };

  // --- 里程碑进度 ---
  const milestones = input.baseline?.milestones ?? [];
  const stages = input.baseline
    ? deriveStageProgress(
        input.baseline.milestones,
        input.baseline.phases,
        input.baseline.anchors.competitionDate,
        input.generatedAt,
      )
    : null;

  // --- 任务完成 ---
  const byStatus: Record<TaskStatus, number> = {
    pending: 0,
    inProgress: 0,
    blocked: 0,
    done: 0,
    shelved: 0,
  };
  const taskGroupAcc = new Map<string, { total: number; done: number }>();
  for (const t of input.tasks) {
    byStatus[t.status] += 1;
    const acc = taskGroupAcc.get(t.groupId) ?? { total: 0, done: 0 };
    acc.total += 1;
    if (t.status === 'done') acc.done += 1;
    taskGroupAcc.set(t.groupId, acc);
  }

  // --- 在场统计（I0：只按 holderGroupId / resourceId 聚合，不碰 invitedMemberIds） ---
  const presenceGroupAcc = new Map<string, number>();
  const presenceResourceAcc = new Map<string, number>();
  const windows = new Set<string>();
  for (const s of input.sessions) {
    windows.add(s.windowLabel);
    presenceGroupAcc.set(s.holderGroupId, (presenceGroupAcc.get(s.holderGroupId) ?? 0) + 1);
    presenceResourceAcc.set(s.resourceId, (presenceResourceAcc.get(s.resourceId) ?? 0) + 1);
  }

  // --- 库存消耗 ---
  const ledger = deriveInventoryLedger(
    input.inventory,
    input.resources.map((r) => ({ id: r.id, name: r.name, displayCode: r.displayCode })),
  );
  const shortfalls = deriveShortfalls(input.inventory);
  let totalUnits = 0;
  let mountedUnits = 0;
  let reservedUnits = 0;
  let idleUnits = 0;
  for (const row of ledger) {
    totalUnits += row.partType.totalQuantity;
    idleUnits += row.idle;
    for (const per of row.perResource) {
      mountedUnits += per.used;
      reservedUnits += per.reserved;
    }
  }
  let damagedUnits = 0;
  let restockedUnits = 0;
  for (const a of input.inventory.actions) {
    if (a.kind === 'damage') damagedUnits += Math.abs(a.quantityDelta);
    if (a.kind === 'restock') restockedUnits += Math.abs(a.quantityDelta);
  }

  const sorted = <T>(arr: T[], by: (x: T) => number) => arr.slice().sort((a, b) => by(b) - by(a));

  return {
    generatedAt: input.generatedAt,
    seasonName: input.seasonName,
    memberCount: input.members.length,
    groupCount: input.groups.length,
    milestones: {
      total: milestones.length,
      passed: milestones.filter((m) => m.status === 'passed').length,
      pending: milestones.filter((m) => m.status === 'pending').length,
      missed: milestones.filter((m) => m.status === 'missed').length,
      rows: milestones
        .slice()
        .sort((a, b) => (a.plannedAt < b.plannedAt ? -1 : 1))
        .map((m) => ({
          title: m.title,
          kind: m.kind === 'gate' ? '门' : '里程碑',
          plannedAt: m.plannedAt.slice(0, 10),
          status: MILESTONE_STATUS_LABELS[m.status] ?? m.status,
          robotVersion: m.robotVersion ?? null,
        })),
      stages: stages
        ? stages.map((s) => ({ stage: s.stage, status: s.status, endsAt: s.endsAt.slice(0, 10) }))
        : null,
    },
    tasks: {
      total: input.tasks.length,
      byStatus,
      byGroup: sorted(
        [...taskGroupAcc.entries()].map(([gid, acc]) => ({
          name: groupName(gid),
          total: acc.total,
          done: acc.done,
        })),
        (x) => x.total,
      ),
    },
    presence: {
      sessionCount: input.sessions.length,
      distinctWindows: windows.size,
      byGroup: sorted(
        [...presenceGroupAcc.entries()].map(([gid, count]) => ({ name: groupName(gid), count })),
        (x) => x.count,
      ),
      byResource: sorted(
        [...presenceResourceAcc.entries()].map(([rid, count]) => ({
          name: resourceName(rid),
          count,
        })),
        (x) => x.count,
      ),
    },
    inventory: {
      partTypeCount: input.inventory.partTypes.length,
      totalUnits,
      mountedUnits,
      reservedUnits,
      idleUnits,
      damagedUnits,
      restockedUnits,
      lowStock: shortfalls.map((p) => p.name),
    },
  };
}

// ---------------------------------------------------------------------------
// Markdown 渲染
// ---------------------------------------------------------------------------

export function renderGovReportMarkdown(report: GovReport): string {
  const L: string[] = [];
  const date = report.generatedAt.slice(0, 10);
  L.push(`# 项目进展汇报${report.seasonName ? `（${report.seasonName}）` : ''}`);
  L.push('');
  L.push(`生成时间：${date}｜在编成员 ${report.memberCount} 人｜${report.groupCount} 个组`);
  L.push('');

  L.push('## 一、里程碑进度');
  L.push('');
  const ms = report.milestones;
  L.push(`共 ${ms.total} 个节点：已达成 ${ms.passed}、待达成 ${ms.pending}、已错过 ${ms.missed}。`);
  L.push('');
  if (ms.stages) {
    L.push(
      `整车六阶段：${ms.stages
        .map((s) => `${GOV_REPORT_STAGE_LABELS[s.stage] ?? s.stage}（${STAGE_STATUS_LABELS[s.status]}）`)
        .join(' → ')}`,
    );
    L.push('');
  }
  if (ms.rows.length > 0) {
    L.push('| 节点 | 类型 | 计划日期 | 状态 | 车版 |');
    L.push('| --- | --- | --- | --- | --- |');
    for (const r of ms.rows) {
      L.push(`| ${r.title} | ${r.kind} | ${r.plannedAt} | ${r.status} | ${r.robotVersion ?? '—'} |`);
    }
    L.push('');
  }

  L.push('## 二、任务完成');
  L.push('');
  const tk = report.tasks;
  const statusLine = (Object.keys(TASK_STATUS_LABELS) as TaskStatus[])
    .map((k) => `${TASK_STATUS_LABELS[k]} ${tk.byStatus[k]}`)
    .join('、');
  L.push(`共 ${tk.total} 项任务：${statusLine}。`);
  L.push('');
  if (tk.byGroup.length > 0) {
    L.push('| 组 | 任务数 | 已完成 | 完成率 |');
    L.push('| --- | --- | --- | --- |');
    for (const g of tk.byGroup) {
      const rate = g.total > 0 ? `${Math.round((g.done / g.total) * 100)}%` : '—';
      L.push(`| ${g.name} | ${g.total} | ${g.done} | ${rate} |`);
    }
    L.push('');
  }

  L.push('## 三、在场统计');
  L.push('');
  L.push(
    `共记录 ${report.presence.sessionCount} 个在场窗口（覆盖 ${report.presence.distinctWindows} 个时段标签）。按组与按机器人统计如下（不含个人维度）：`,
  );
  L.push('');
  if (report.presence.byGroup.length > 0) {
    L.push('| 组 | 在场次数 |');
    L.push('| --- | --- |');
    for (const g of report.presence.byGroup) L.push(`| ${g.name} | ${g.count} |`);
    L.push('');
  }
  if (report.presence.byResource.length > 0) {
    L.push('| 机器人/设备 | 使用次数 |');
    L.push('| --- | --- |');
    for (const r of report.presence.byResource) L.push(`| ${r.name} | ${r.count} |`);
    L.push('');
  }

  L.push('## 四、库存消耗');
  L.push('');
  const inv = report.inventory;
  L.push(
    `零件 ${inv.partTypeCount} 种、共 ${inv.totalUnits} 件：在装 ${inv.mountedUnits}、预留 ${inv.reservedUnits}、闲置 ${inv.idleUnits}；累计补料 ${inv.restockedUnits} 件、损坏 ${inv.damagedUnits} 件。`,
  );
  L.push('');
  if (inv.lowStock.length > 0) {
    L.push(`缺料告警（闲置低于阈值）：${inv.lowStock.join('、')}。`);
    L.push('');
  }

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// HTML 渲染（自包含、可打印：浏览器 Ctrl+P 即 PDF；内联样式不依赖任何外网资源）
// ---------------------------------------------------------------------------

const escapeHtml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function htmlTable(headers: string[], rows: string[][]): string {
  const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const trs = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('\n');
  return `<table><thead><tr>${th}</tr></thead><tbody>\n${trs}\n</tbody></table>`;
}

export function renderGovReportHtml(report: GovReport): string {
  const date = report.generatedAt.slice(0, 10);
  const ms = report.milestones;
  const tk = report.tasks;
  const inv = report.inventory;

  const stageStrip = ms.stages
    ? `<p class="stages">${ms.stages
        .map(
          (s) =>
            `<span class="stage stage--${s.status}">${escapeHtml(
              GOV_REPORT_STAGE_LABELS[s.stage] ?? s.stage,
            )}<small>${STAGE_STATUS_LABELS[s.status]}</small></span>`,
        )
        .join('<span class="arrow">→</span>')}</p>`
    : '';

  const milestoneTable =
    ms.rows.length > 0
      ? htmlTable(
          ['节点', '类型', '计划日期', '状态', '车版'],
          ms.rows.map((r) => [r.title, r.kind, r.plannedAt, r.status, r.robotVersion ?? '—']),
        )
      : '';

  const groupTable =
    tk.byGroup.length > 0
      ? htmlTable(
          ['组', '任务数', '已完成', '完成率'],
          tk.byGroup.map((g) => [
            g.name,
            String(g.total),
            String(g.done),
            g.total > 0 ? `${Math.round((g.done / g.total) * 100)}%` : '—',
          ]),
        )
      : '';

  const presenceGroupTable =
    report.presence.byGroup.length > 0
      ? htmlTable(
          ['组', '在场次数'],
          report.presence.byGroup.map((g) => [g.name, String(g.count)]),
        )
      : '';
  const presenceResourceTable =
    report.presence.byResource.length > 0
      ? htmlTable(
          ['机器人/设备', '使用次数'],
          report.presence.byResource.map((r) => [r.name, String(r.count)]),
        )
      : '';

  const statusLine = (Object.keys(TASK_STATUS_LABELS) as TaskStatus[])
    .map((k) => `${TASK_STATUS_LABELS[k]} ${tk.byStatus[k]}`)
    .join('、');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>项目进展汇报 ${escapeHtml(date)}</title>
<style>
  body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 800px; margin: 2em auto; padding: 0 1em; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 1.5em; border-bottom: 2px solid #333; padding-bottom: .3em; }
  h2 { font-size: 1.15em; margin-top: 1.6em; }
  table { border-collapse: collapse; width: 100%; margin: .6em 0; }
  th, td { border: 1px solid #ccc; padding: .35em .6em; text-align: left; font-size: .92em; }
  th { background: #f2f2f2; }
  .meta { color: #666; font-size: .9em; }
  .stages { display: flex; flex-wrap: wrap; gap: .3em; align-items: center; }
  .stage { border: 1px solid #bbb; border-radius: 6px; padding: .2em .55em; font-size: .88em; }
  .stage small { color: #777; margin-left: .4em; }
  .stage--done { background: #e8f5e9; }
  .stage--current { background: #fff8e1; border-color: #d8a500; font-weight: 600; }
  .arrow { color: #999; }
  .warn { color: #b00020; }
  @media print { body { margin: 0; max-width: none; } h2 { page-break-after: avoid; } table { page-break-inside: avoid; } }
</style>
</head>
<body>
<h1>项目进展汇报${report.seasonName ? `（${escapeHtml(report.seasonName)}）` : ''}</h1>
<p class="meta">生成时间：${escapeHtml(date)}｜在编成员 ${report.memberCount} 人｜${report.groupCount} 个组</p>

<h2>一、里程碑进度</h2>
<p>共 ${ms.total} 个节点：已达成 ${ms.passed}、待达成 ${ms.pending}、已错过 ${ms.missed}。</p>
${stageStrip}
${milestoneTable}

<h2>二、任务完成</h2>
<p>共 ${tk.total} 项任务：${escapeHtml(statusLine)}。</p>
${groupTable}

<h2>三、在场统计</h2>
<p>共记录 ${report.presence.sessionCount} 个在场窗口（覆盖 ${report.presence.distinctWindows} 个时段标签）。按组与按机器人统计如下（不含个人维度）：</p>
${presenceGroupTable}
${presenceResourceTable}

<h2>四、库存消耗</h2>
<p>零件 ${inv.partTypeCount} 种、共 ${inv.totalUnits} 件：在装 ${inv.mountedUnits}、预留 ${inv.reservedUnits}、闲置 ${inv.idleUnits}；累计补料 ${inv.restockedUnits} 件、损坏 ${inv.damagedUnits} 件。</p>
${inv.lowStock.length > 0 ? `<p class="warn">缺料告警（闲置低于阈值）：${escapeHtml(inv.lowStock.join('、'))}。</p>` : ''}
</body>
</html>
`;
}

export const GOV_REPORT_TASK_STATUS_LABELS = TASK_STATUS_LABELS;
export const GOV_REPORT_STAGE_STATUS_LABELS = STAGE_STATUS_LABELS;
