/**
 * 装配契约（HUB-MODULARIZATION 第 2 步）。
 *
 * 只定接口 + 一份默认租户配置，不含任何实现/逻辑（见 docs/domains/system.md）。
 * 核心宿主（hub-server 的 buildHubServer / hub-console 的 App 壳）据此遍历 `TenantConfig.enabledModules`
 * 挂载各模块的路由 / 页面 / i18n / 词汇——装配层本身不判断"该启用什么"，enabledModules 永远是人填的
 * 租户配置（AI 只转译不下判断红线，见 §6.2）。
 *
 * `App`/`Ctx`/`Page` 故意留成型参占位：hub-contracts 不依赖 Fastify（server 侧）或 React（console 侧），
 * 具体宿主在各自包内把类型收紧（如 server 侧 `ModuleDescriptor<FastifyInstance, ModuleRouteCtx>`）。
 */

import { z } from 'zod';

/** 六个可开关功能模块的稳定 id（见 §3.3 模块清单）。system / pm-core 是"核心常装/必装"，
 *  但装配层不做结构性强制——是否常装由 TenantConfig.enabledModules 的内容体现，不在代码里写死例外。 */
export const ModuleIdSchema = z.enum([
  'system',
  'pm-core',
  'knowledge-base',
  'ledger',
  'archive',
  'presence-schedule',
]);
export type ModuleId = z.infer<typeof ModuleIdSchema>;

/** 全部模块 id，用于拼装"默认全启用"的机器人租户配置、以及装配层自查（穷举校验）。 */
export const ALL_MODULE_IDS: readonly ModuleId[] = ModuleIdSchema.options;

/** 配置中的模块清单：只接受已注册模块，并拒绝重复 id。 */
export const EnabledModulesSchema = z.array(ModuleIdSchema).superRefine((moduleIds, context) => {
  const seen = new Set<ModuleId>();
  moduleIds.forEach((moduleId, index) => {
    if (seen.has(moduleId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index],
        message: `重复模块 id：${moduleId}`,
      });
      return;
    }
    seen.add(moduleId);
  });
});

/** 模块导航项占位形状（宿主决定具体渲染，这里只给注册表需要的最小字段）。 */
export interface ModuleNavItem {
  key: string;
  titleKey: string;
  path: string;
}

/** 模块页面描述符（console 侧消费；lazyComponent 类型留给 console 收紧为 React.lazy 工厂）。 */
export interface ModulePageDescriptor<LazyComponent = unknown> {
  key: string;
  navItem: ModuleNavItem;
  titleKey: string;
  lazyComponent: LazyComponent;
}

/** 模块 i18n 词条覆盖（zh/en 各一份 flat 词表，前缀由模块自约束，如 `pm.`/`kb.`）。 */
export interface ModuleI18nBundle {
  zh: Record<string, string>;
  en: Record<string, string>;
}

/**
 * 模块装配契约（只接口，不含实现）。
 * - `buildStore`/`registerRoutes` 留给 server 宿主消费（App/Ctx 由宿主收紧，见 hub-server 的
 *   `ModuleRouteCtx`）；
 * - `pages`/`i18n` 留给 console 宿主消费；
 * - `domainVocab` 是词汇注入表占位（VocabularyRegistry 的模块级分片），核心层不解释其内容。
 */
export interface ModuleDescriptor<App = unknown, Ctx = unknown, LazyComponent = unknown> {
  id: ModuleId;
  /** 依赖的其他模块 id（装配顺序 / 校验用，不表达运行期强耦合）。 */
  dependsOn: ModuleId[];
  /** 本模块贡献的契约切片来源标记（纯文档用途，不改变 hub-contracts 的 export * 单一出口）。 */
  contractsFragment?: string;
  buildStore?: (ctx: Ctx) => unknown;
  registerRoutes?: (app: App, ctx: Ctx) => void;
  pages: ModulePageDescriptor<LazyComponent>[];
  i18n: ModuleI18nBundle;
  domainVocab?: VocabularyRegistry;
}

/** 租户配置：人填的模块开关表。装配层只读它、不派生它（否则违反"人在环"）。 */
export const TenantConfigSchema = z.object({
  enabledModules: EnabledModulesSchema,
}).strict();
export type TenantConfig = z.infer<typeof TenantConfigSchema>;

/**
 * 词汇注入表接口（三通道之一，见 §3.4-B）：租户/垂直包按 domainKey 注入覆盖词条
 * （如 enum label / i18n 覆盖），核心层不解释键名语义，只透传。
 */
export type VocabularyRegistry = Record<string, Record<string, string> | undefined>;

/** 判断某模块是否在租户配置内启用（纯读取，无派生判断，无副作用）。 */
export function isModuleEnabled(config: TenantConfig, id: ModuleId): boolean {
  return config.enabledModules.includes(id);
}

/**
 * 默认租户配置——机器人战队 = 全 6 模块启用，行为与 master（未模块化前）等价（§5 第2步收尾要求）。
 * 游戏工作室等其它租户按 §4 词汇替换表另配子集（如省略 presence-schedule）。
 */
export const ROBOTICS_TENANT_CONFIG: TenantConfig = {
  enabledModules: [...ALL_MODULE_IDS],
};
