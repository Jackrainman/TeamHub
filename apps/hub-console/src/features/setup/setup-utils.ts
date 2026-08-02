/**
 * 初始化向导公共符号（常量 / 类型 / 纯函数）——从 BootstrapGate.tsx 提取，供步组件与单测共用。
 * AGENTS.md §9：Page 组件不导出公共符号 → 放独立模块。
 */
import {
  generateRoboconBaselineTemplate,
  type CreateSeasonRequest,
  type KbImportDocsReport,
  type MemberGrade,
  type Season,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { TranslationKey } from '../../i18n';
import { suggestSeason } from '../../utils';

// ─── 步骤元数据 ───────────────────────────────────────────────────────────────

export type Step = 'who' | 'roster' | 'leads' | 'season' | 'inventory' | 'kb' | 'done';

/**
 * 向导进度（WIZARD-PROGRESS）：步 → 1-based 序号 + 短名 i18n 键。顶显「第 N/7 步 · 步名」用——
 * 短名（gate.stepName.*）独立于带圈号标题（gate.step.* = 「① 你是谁」），进度行不重复圈号。
 * 车队步已移出向导（2026-08-03 教学动线）：初始化车改在左侧「机器人队」页做，向导七步。
 */
export const WIZARD_STEP_TOTAL = 7;
export const WIZARD_STEP_META: Record<Step, { n: number; nameKey: TranslationKey }> = {
  who: { n: 1, nameKey: 'gate.stepName.who' },
  roster: { n: 2, nameKey: 'gate.stepName.roster' },
  leads: { n: 3, nameKey: 'gate.stepName.leads' },
  season: { n: 4, nameKey: 'gate.stepName.season' },
  inventory: { n: 5, nameKey: 'gate.stepName.inventory' },
  kb: { n: 6, nameKey: 'gate.stepName.kb' },
  done: { n: 7, nameKey: 'gate.stepName.done' },
};

/**
 * 步骤顺序（WIZARD-BACK 修复刀）：「上一步」回退的唯一真源——下标即步序，与 WIZARD_STEP_META.n 一致
 * （单测锚住）。回退实现 = 已访问步保持挂载（hidden 隐藏），已填表单态不丢；已提交数据本就在服务端，
 * 回步后各步查询重取自然回显（赛季步「已有当前赛季」先例）。
 */
export const WIZARD_STEP_ORDER: readonly Step[] = [
  'who',
  'roster',
  'leads',
  'season',
  'inventory',
  'kb',
  'done',
];

// ─── ① 你是谁 ─────────────────────────────────────────────────────────────────

/**
 * 「你是谁」步年级下拉选项（GRADE-7-TIERS 刀⑥）：大一~大四/研一~研三七档，按序、默认 freshman。
 * legacy 档 `graduate`（旧落盘数据）不在选项内——新建成员不再产它；文案复用 SettingsPage 的
 * GRADE_KEY（同一 i18n 键，不另起）。
 */
export const WHO_GRADE_OPTIONS: readonly MemberGrade[] = [
  'freshman',
  'sophomore',
  'junior',
  'senior',
  'grad1',
  'grad2',
  'grad3',
];

// ─── ④ 建赛季 ─────────────────────────────────────────────────────────────────

/** 赛季步本地表单态：semesterStart/competitionDate 承接 date input 原生 YYYY-MM-DD；endsAt 不暴露编辑。 */
export interface SeasonForm {
  name: string;
  semesterStart: string; // 学期开始（锚点①，必填）
  competitionDate: string; // 比赛日（锚点②，选填；空串 = 不生成基准线模板）
  endsAt: string; // 赛季结束 ISO（suggestSeason 推导，随表单走不另算）
}

/** 预填派生：赛季名/学期开始日期段/结束日均从 suggestSeason 拿（UTC 钉边界，同刀⑨）；比赛日不预填。 */
export function suggestSeasonForm(now: Date): SeasonForm {
  const s = suggestSeason(now);
  return {
    name: s.name,
    semesterStart: s.startsAt.slice(0, 10),
    competitionDate: '',
    endsAt: s.endsAt,
  };
}

/** 两锚点齐否：学期开始 + 比赛日都给了 → 提交后顺手生成基准线模板（照 BaselineOverview 空态同律）。 */
export function seasonAnchorsComplete(
  form: Pick<SeasonForm, 'semesterStart' | 'competitionDate'>,
): boolean {
  return Boolean(form.semesterStart && form.competitionDate);
}

/** 可提交 = 赛季名非空 + 学期开始必填；比赛日填了则须晚于学期开始（同 BaselineEmptyState orderOk）。 */
export function seasonFormSubmittable(form: SeasonForm): boolean {
  if (form.name.trim().length === 0 || !form.semesterStart) return false;
  return !form.competitionDate || form.competitionDate > form.semesterStart;
}

/**
 * 赛季名 → 年份（"2027赛季" → 2027）。年份下拉的 value 必须用本函数派生——option 的 value 是
 * 年份数（seasonYearOptions.years），直接拿 form.name（带「赛季」后缀）做 value 匹配不到任何
 * option，受控下拉恒显示空白（known-bugs 2026-07-28 #3「建赛季」缺陷的向导侧根因）。
 */
export function seasonNameYear(name: string): number {
  return Number.parseInt(name, 10);
}

/** 本地表单 → createSeason 请求体：学期开始日期段 → ISO 零点（UTC，同 suggestSeason 边界钉法）。 */
export function buildSeasonCreateRequest(form: SeasonForm): CreateSeasonRequest {
  return {
    name: form.name.trim(),
    startsAt: `${form.semesterStart}T00:00:00.000Z`,
    endsAt: form.endsAt,
  };
}

/**
 * 提交序列（顺序钉死：模板 PATCH 要新建赛季的 id）——先 createSeason，两锚点齐则
 * generateRoboconBaselineTemplate（参数照 BaselineOverview 空态既有调用）+ updateBaseline PATCH 回；
 * 比赛日空只建赛季。抽成纯数据 helper 供单测 mock client 断言顺序与参数形状。
 */
export async function submitSeasonStep(
  client: Pick<HubApiClient, 'createSeason' | 'updateBaseline'>,
  form: SeasonForm,
): Promise<{ season: Season; baselineGenerated: boolean }> {
  const { season } = await client.createSeason(buildSeasonCreateRequest(form));
  if (!seasonAnchorsComplete(form)) return { season, baselineGenerated: false };
  const template = generateRoboconBaselineTemplate({
    semesterStart: `${form.semesterStart}T00:00:00.000Z`,
    competitionDate: `${form.competitionDate}T00:00:00.000Z`,
  });
  await client.updateBaseline(season.id, template);
  return { season, baselineGenerated: true };
}

// ─── ⑥ 导入知识库 ─────────────────────────────────────────────────────────────

/** 文件选择器 accept 串（与 server 后缀白名单同律）。 */
export const KB_DOC_ACCEPT = '.md,.markdown';

/** 报告三段计数（回显「导入 N 篇 · 跳过 M · 失败 K」的 i18n 参数源，纯函数供单测）。 */
export function kbImportReportCounts(report: KbImportDocsReport): {
  imported: number;
  skipped: number;
  failed: number;
} {
  return {
    imported: report.imported.length,
    skipped: report.skipped.length,
    failed: report.failed.length,
  };
}
