import type { TranslationKey } from '../i18n';
import type { VocabularyOverrides } from '../i18n/vocabulary-overrides';

/**
 * robotics 垂直包（console 侧，HUB-MODULARIZATION 第 6 步：词汇注入收口）。
 *
 * 只装「机器人战队租户」的前端词汇 + 词汇相关派生 helper，不含核心逻辑——通用组件层
 * （`components/SeasonSelect.tsx` 等）已把机器人专属规则委托给本文件的函数；核心组件本身
 * 除了调用这里的注入值外不再直接内嵌机器人词汇。游戏工作室等其它垂直包应在自己的
 * `verticals/*.ts` 平行放一份同形文件，不改动本文件、不改动核心组件。
 *
 * 见 docs/design/modularization-feasibility.md §3.4-B + §4 词汇替换表 + §5 第6步；
 * 对应契约层参考表见 `@teamhub/hub-contracts` 的 `verticals/robotics.ts`。
 */

// ---------------------------------------------------------------------------
// 赛季（原住 components/SeasonSelect.tsx，机器人赛季惯例：截止月<=4 视为上赛季延续）
// ---------------------------------------------------------------------------

/**
 * 猜当前赛季年份（后两位数字字符串，如 "25"）。赛季切换惯例（机器人战队专属）：
 * 赛季年份 = 日历年 - 1（赛季到次年前数月结束）；截止月：若当前月份 <= 4（1~4月），
 * 视为"上个赛季年"仍在进行，用 (year-1) 的后两位；否则用 year 后两位。
 * 游戏工作室等无"赛季"概念的租户应换一份自己的时间锚定（如 dev-cycle/sprint 序号），不复用本函数。
 */
export function guessSeason(now: Date): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  const seasonYear = month <= 4 ? year - 1 : year;
  return String(seasonYear).slice(-2);
}

/** 从当前猜测赛季生成 ±2 年的选项列表（字符串后两位），供 `SeasonSelect` 组合框候选复用。 */
export function seasonOptions(now: Date): string[] {
  const base = guessSeason(now);
  const baseYear = 2000 + parseInt(base, 10);
  return [-2, -1, 0, 1, 2].map((offset) => String(baseYear + offset).slice(-2));
}

// ---------------------------------------------------------------------------
// 图纸档案组别（原住 features/archive/ArchivePage.tsx，与 hub-contracts 写侧闭集同一份值）
// ---------------------------------------------------------------------------

export type OwnerGroup = 'mechanical' | 'electrical' | 'ec' | 'vision';

/** 组别顺序（新增组别在此处一处登记；与 `@teamhub/hub-contracts` 的
 *  `ROBOTICS_OWNER_GROUP_VALUES` 同一份值，两处不漂移）。 */
export const OWNER_GROUP_ORDER: readonly OwnerGroup[] = [
  'mechanical',
  'electrical',
  'ec',
  'vision',
];

export const GROUP_LABEL_KEY: Record<OwnerGroup, TranslationKey> = {
  mechanical: 'enum.group.mechanical',
  electrical: 'enum.group.electrical',
  ec: 'enum.group.ec',
  vision: 'enum.group.vision',
};

// ---------------------------------------------------------------------------
// 归档上传文件后缀白名单（机器人 CAD 格式 .step/.f3d 等；与 server ARTIFACT_ALLOWED_EXT 对齐）
// ---------------------------------------------------------------------------

/**
 * 归档上传文件后缀白名单：CAD（机械）/ 文档 / 图 / 包 / 固件——机器人战队专属格式集
 * （.step/.stp/.iges/.igs/.sldprt/.sldasm/.slddrw/.dwg/.f3d）+ 通用格式兜底。
 * 前端 accept 仅是提示，真正把关在 server `hub-server/src/server.ts:ARTIFACT_ALLOWED_EXT`
 * （该白名单尚未接注入通道，是本步遗留的延后项，见设计文档 risks）。
 * 游戏工作室等其它垂直包应换一份自己的格式集（如 .blend/.fbx/.max，见 §4 词汇替换表）。
 */
export const ARTIFACT_ACCEPT_EXT: readonly string[] = [
  '.step',
  '.stp',
  '.iges',
  '.igs',
  '.sldprt',
  '.sldasm',
  '.slddrw',
  '.dwg',
  '.f3d',
  '.pdf',
  '.md',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.zip',
  '.bin',
  '.hex',
];

// ---------------------------------------------------------------------------
// i18n 词汇覆盖表（PHASE2-CONSOLE-ASSEMBLY：接线 vocabulary-overrides.ts 的 setVocabularyOverrides，
// 装配点见 App.tsx）
// ---------------------------------------------------------------------------

/**
 * robotics 租户的词汇覆盖表——**恒为空**：巨表 `translations.ts` 本身就是按机器人战队词汇写的
 * （见文件头注释「今天 = 机器人战队租户」），故 robotics 垂直包无需覆盖任何词条。接线
 * `setVocabularyOverrides(ROBOTICS_VOCAB_OVERRIDES)` 后 robotics 租户渲染文案零变化，只是把
 * "谁在调用这条机制"从空白填成显式（游戏工作室等其它垂直包应在自己的 verticals/*.ts 里放一份
 * 非空覆盖表，如把 `pm.field.robotTarget` 换成"目标平台"）。
 */
export const ROBOTICS_VOCAB_OVERRIDES: VocabularyOverrides = {};
