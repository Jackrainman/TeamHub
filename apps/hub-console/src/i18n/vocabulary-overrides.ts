import type { Lang, TranslationKey } from './translations';

/**
 * 租户词汇覆盖层（HUB-MODULARIZATION 第 6 步 i18n 通道，见
 * docs/design/modularization-feasibility.md §3.4-B-3）。
 *
 * `translations.ts` 巨表是核心默认词汇（今天 = 机器人战队租户）；本层允许垂直包 / 租户配置在
 * **不修改巨表、不拆 per-module 文件**的前提下覆盖个别词条的显示文案（例：把
 * `pm.field.robotTarget` 的文案从"适配机器人"换成游戏工作室的"目标平台"）。覆盖表默认为空——
 * 无覆盖 = 与改动前逐字一致的行为，本文件本身不改变任何已渲染文案。
 *
 * 装配层（`assembly.ts` 的 `ModuleDescriptor`/`TenantConfig`）尚未接线"谁在什么时机调用
 * `setVocabularyOverrides`"——本步只做机制先行（供 `translate()` 消费的读取点），运行期真正
 * 按租户切换词汇是延后项（需要真正的租户装配/启动时机才能验证，避免无法编译验证的连锁改动）。
 *
 * **AUDIT-DEBT-2026-07 §9-④ 审计债⑥**：此前覆盖表的 key 类型钉死 `TranslationKey`（核心巨表
 * 已有的 key 闭集），结构上只能覆盖巨表已存在的词条、不能新增巨表里没有的 key——垂直包若要挂一个
 * 核心完全没有的全新词汇槽（如某租户专属字段的文案），无路可走。`VocabularyKey` 用
 * `TranslationKey | (string & {})` 开放字符串套字面量联合的写法：IDE 对已知 key 仍有自动补全，
 * 同时允许任意新字符串 key——覆盖表与 `translate()`/`t()` 的 key 参数同步放宽，新 key 与已知 key
 * 走同一条解析路径（无覆盖时回退巨表找不到该 key → 兜底返回 key 本身，见 `translate()`）。
 */

/** 覆盖表 / `t()` 的 key 类型：已知 `TranslationKey` 之外也接受任意新字符串（供垂直包新增词汇槽）。 */
export type VocabularyKey = TranslationKey | (string & {});

/** 单条覆盖：按语言给替换文案，缺的语言回退原巨表值（不要求两语言都填）。 */
export type VocabularyOverrideEntry = Partial<Record<Lang, string>>;

/** 覆盖表：只需覆盖的 key 才出现，其余 key 走巨表原值——不是巨表的替代品。key 不限于巨表已有值。 */
export type VocabularyOverrides = Partial<Record<VocabularyKey, VocabularyOverrideEntry>>;

let activeOverrides: VocabularyOverrides = {};

/**
 * 装配层 / 租户配置注入覆盖表（人填，非派生——AI 只转译不下判断红线 §6.2：
 * 覆盖内容是人定的租户词汇，不是自动判断出来的）。
 */
export function setVocabularyOverrides(overrides: VocabularyOverrides): void {
  activeOverrides = overrides;
}

/** 仅供测试重置，避免跨用例污染（覆盖表是模块级单例，非 React state）。 */
export function resetVocabularyOverrides(): void {
  activeOverrides = {};
}

/** 供 `translate()` 消费：某 key 在当前语言下若有租户覆盖，返回覆盖文案；否则 undefined（回退巨表）。 */
export function resolveVocabularyOverride(
  lang: Lang,
  key: VocabularyKey,
): string | undefined {
  return activeOverrides[key]?.[lang];
}
