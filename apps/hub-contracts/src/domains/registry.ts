/**
 * 域注册表（D-090 §6 单一真相，设计稿 tmp/design/module-registry.md 步骤 1）。
 * 回答"有哪些域、各包目录叫什么、受哪个开关控制"；目录覆盖由 verify-architecture 门禁比对。
 * 不含 schema/路由路径/权限/开关默认值/文件清单——那些是代码、配置或派生件。
 * 类型名避开 assembly.ts 的 ModuleId/ModuleDescriptor（那是六开关的运行时装配契约）。
 */

export type DomainId =
  | 'pm' | 'inventory' | 'knowledge' | 'reimburse' | 'schedule' | 'baseline'
  | 'checklist' | 'artifacts' | 'integrations' | 'reporting' | 'system';

export interface DomainDescriptor {
  /** 三包统一域 id；新建目录必须用它 */
  id: DomainId;
  /** 一句话职责，给人读也直接喂给 AI 定位 */
  title: string;
  /** core=框架常装 / pillar=三支柱 / support=支撑能力 */
  group: 'core' | 'pillar' | 'support';
  /** 各包实现目录名；允许与 id 不同（历史别名在此显式登记） */
  packages: { contracts?: string; server?: string; console?: string | readonly string[] };
  /** app_settings 模块开关名（assembly.ts ModuleId）；缺省=常装 */
  enabledBy?: string;
  /** server 注册函数名后缀（registerXxxRoutes），供组合根比对 */
  routes?: readonly string[];
  /** CONSOLE_PAGES 页面 key，供页面表比对 */
  pages?: readonly string[];
  /** 已知未完成项；非空即表示该域未收口 */
  pending?: readonly string[];
}

export const DOMAINS: readonly DomainDescriptor[] = [
  { id: 'pm', title: '任务、依赖、认领验收、周工作台与学习方向', group: 'core',
    packages: { contracts: 'pm', server: 'pm', console: ['pm', 'project', 'pool', 'dep-graph', 'timeline', 'workbench', 'direction'] },
    enabledBy: 'pm-core', routes: ['PmCore'], pages: ['feed', 'workbench', 'project', 'direction', 'timeline'] },
  { id: 'system', title: '初始化、会话、成员与设置', group: 'core',
    packages: { contracts: 'system', server: 'system', console: ['system', 'settings', 'identity', 'setup', 'overview'] },
    enabledBy: 'system', routes: ['System', 'Session', 'Setup'], pages: ['overview', 'settings'] },
  { id: 'inventory', title: '零件台账、单件与出入库动作', group: 'pillar',
    packages: { contracts: 'inventory', server: 'inventory', console: 'inv' },
    enabledBy: 'ledger', routes: ['Inventory'], pages: ['inv'] },
  { id: 'knowledge', title: '知识库摄入、检索与结案回灌', group: 'pillar',
    packages: { contracts: 'knowledge', server: 'knowledge', console: 'kb' },
    enabledBy: 'knowledge-base', routes: ['Knowledge'], pages: ['knowledge'] },
  { id: 'reimburse', title: '报销条目、材料包、核对工作流与打款交付', group: 'pillar',
    packages: { contracts: 'reimburse', server: 'reimburse', console: 'reimburse' },
    enabledBy: 'ledger', routes: ['Reimburse'], pages: ['reimburse'] },
  { id: 'schedule', title: '排班、在场与机器人资源', group: 'support',
    packages: { contracts: 'schedule', server: 'schedule', console: ['schedule', 'resources'] },
    enabledBy: 'presence-schedule', routes: ['Schedule'], pages: ['schedule', 'fleet'] },
  // baseline/checklist 的路由由 registerPmCoreRoutes 消费，无独立注册函数与页面。
  { id: 'baseline', title: '倒排基准线与节奏派生', group: 'support',
    packages: { contracts: 'baseline', server: 'baseline', console: 'baseline' },
    enabledBy: 'pm-core' },
  { id: 'checklist', title: '门检查单与欠条', group: 'support',
    packages: { contracts: 'checklist', server: 'checklist', console: 'checklist' },
    enabledBy: 'pm-core' },
  { id: 'artifacts', title: '图纸档案元数据与文件旁路', group: 'support',
    packages: { contracts: 'artifacts', server: 'archive', console: 'archive' },
    enabledBy: 'archive', routes: ['Archive'], pages: ['archive'] },
  { id: 'integrations', title: '飞书/Hermes 集成边界', group: 'support',
    packages: { contracts: 'integrations', server: 'integrations' },
    routes: ['Lark'] },
  { id: 'reporting', title: '全局搜索、CSV 导出与全队汇报', group: 'support',
    packages: { server: 'reporting', console: 'search' },
    routes: ['Search', 'Export', 'GovReport'] },
] as const;