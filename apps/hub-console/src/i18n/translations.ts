// Team Hub Console 多语言文案。中文为默认，英文可切换。
// 只翻译「界面文案」（chrome）；任务名 / 负责人 / 资料标题等**用户数据**保持后端原样，不做机器翻译。
// 参数占位用 {name}，由 t(key, params) 插值。

export type Lang = 'zh' | 'en';

const zh = {
  // 品牌 / 导航
  'brand.subtitle.mock': 'Mock 数据',
  'brand.subtitle.real': '真实 API',
  'nav.overview': '总览',
  'nav.depGraph': '依赖图',
  'nav.adapters': '适配器',
  'nav.events': '事件',
  'nav.bridge': '协作桥',
  'nav.git': 'Git 仓库',
  'nav.artifacts': '图纸档案',
  'nav.settings': '设置',
  'nav.soon': '即将上线',

  // 顶部工具条
  'toolbar.eyebrow': 'Team Hub',
  'toolbar.title.overview': '运维总览',
  'toolbar.title.depGraph': '依赖链 · 阻塞归因',
  'toolbar.refresh': '刷新总览',

  // 侧栏开关
  'control.language': '语言',
  'control.language.title': '切换语言（中文 / English）',
  'control.source': '数据源',
  'control.source.live': '真实',
  'control.source.mock': 'Mock',
  'control.source.title': '切换数据源（真实 API / Mock 演示）',

  // 总览
  'overview.loading': '正在加载控制台状态…',
  'overview.unavailable': '控制台状态不可用（后端没连上？可切到 Mock 看界面）',
  'overview.metric.system': '系统',
  'overview.metric.adapters': '适配器',
  'overview.metric.bridge': '协作桥',
  'overview.metric.repos': '仓库',
  'overview.metric.artifacts': '图纸',
  'overview.panel.adapters': '适配器',
  'overview.panel.events': '最近事件',
  'overview.panel.bridge': '协作桥',
  'overview.panel.gitRepos': 'Git 仓库',
  'overview.panel.artifacts': '图纸档案',
  'overview.meta.unconfigured': '{n} 个未配置',
  'overview.meta.events': '{n} 条事件',
  'overview.meta.members': '{n} 人',
  'overview.meta.indexed': '已索引 {n}',
  'overview.blocked': '{n} 被卡',
  'overview.unknown': '未知',

  // 依赖图
  'depgraph.loading': '正在加载依赖图…',
  'depgraph.unavailable': '依赖图不可用（后端没连上？可切到 Mock 看界面）',
  'depgraph.status.working': '进行中',
  'depgraph.status.blockedIdle': '被卡 · 等待',
  'depgraph.status.freeIdle': '可接任务',
  'depgraph.status.done': '完成',
  'depgraph.status.gap': '缺口',
  'depgraph.complexity.trivial': '简单',
  'depgraph.complexity.normal': '常规',
  'depgraph.complexity.hard': '复杂',
  'depgraph.summary.critical': '关键链',
  'depgraph.summary.blocked': '缺口 / 卡点',
  'depgraph.summary.blockedIdle': '空闲 · 被卡',
  'depgraph.summary.freeIdle': '空闲 · 自由',
  'depgraph.node.unassigned': '未指派',
  'depgraph.node.blockedBy': '被「{label}」卡住',
  'depgraph.node.criticalChain': '关键链',
  'depgraph.detail.title': '节点详情',
  'depgraph.detail.clickAny': '点击任意任务',
  'depgraph.detail.empty':
    '点击图中的任务节点，查看负责人、状态、被谁卡住，以及被卡时这段时间可以看的资料。',
  'depgraph.detail.ownerGroup': '负责人 · 组',
  'depgraph.detail.robotComplexity': '机器人 · 难度',
  'depgraph.detail.blockedBy': '被什么卡住',
  'depgraph.detail.blockedByValue': '「{label}」未完成（卡的是任务，不是人）',
  'depgraph.detail.unmetNeeds': '未满足的需求',
  'depgraph.detail.criticalChain': '关键链',
  'depgraph.detail.criticalChainValue': '在收敛到总联调的主链上',
  'depgraph.detail.learnTitle': '这段时间可以看的资料',
  'depgraph.detail.myMap': '查看我的知识地图',
} as const;

export type TranslationKey = keyof typeof zh;

const en: Record<TranslationKey, string> = {
  'brand.subtitle.mock': 'Mock data',
  'brand.subtitle.real': 'Live API',
  'nav.overview': 'Overview',
  'nav.depGraph': 'Dep graph',
  'nav.adapters': 'Adapters',
  'nav.events': 'Events',
  'nav.bridge': 'Bridge',
  'nav.git': 'Git repos',
  'nav.artifacts': 'Artifacts',
  'nav.settings': 'Settings',
  'nav.soon': 'Coming soon',

  'toolbar.eyebrow': 'Team Hub',
  'toolbar.title.overview': 'Operations Console',
  'toolbar.title.depGraph': 'Dependency · Blocking',
  'toolbar.refresh': 'Refresh overview',

  'control.language': 'Language',
  'control.language.title': 'Switch language (中文 / English)',
  'control.source': 'Data source',
  'control.source.live': 'Live',
  'control.source.mock': 'Mock',
  'control.source.title': 'Toggle data source (Live API / Mock demo)',

  'overview.loading': 'Loading console state…',
  'overview.unavailable':
    'Console state unavailable (backend not reachable? switch to Mock to preview the UI)',
  'overview.metric.system': 'System',
  'overview.metric.adapters': 'Adapters',
  'overview.metric.bridge': 'Bridge',
  'overview.metric.repos': 'Repos',
  'overview.metric.artifacts': 'Artifacts',
  'overview.panel.adapters': 'Adapters',
  'overview.panel.events': 'Recent Events',
  'overview.panel.bridge': 'Bridge',
  'overview.panel.gitRepos': 'Git Repos',
  'overview.panel.artifacts': 'Artifacts',
  'overview.meta.unconfigured': '{n} unconfigured',
  'overview.meta.events': '{n} events',
  'overview.meta.members': '{n} members',
  'overview.meta.indexed': '{n} indexed',
  'overview.blocked': '{n} blocked',
  'overview.unknown': 'unknown',

  'depgraph.loading': 'Loading dependency graph…',
  'depgraph.unavailable':
    'Dependency graph unavailable (backend not reachable? switch to Mock to preview the UI)',
  'depgraph.status.working': 'In progress',
  'depgraph.status.blockedIdle': 'Blocked · waiting',
  'depgraph.status.freeIdle': 'Available',
  'depgraph.status.done': 'Done',
  'depgraph.status.gap': 'Gap',
  'depgraph.complexity.trivial': 'Trivial',
  'depgraph.complexity.normal': 'Normal',
  'depgraph.complexity.hard': 'Hard',
  'depgraph.summary.critical': 'Critical chain',
  'depgraph.summary.blocked': 'Gaps / blocks',
  'depgraph.summary.blockedIdle': 'Idle · blocked',
  'depgraph.summary.freeIdle': 'Idle · free',
  'depgraph.node.unassigned': 'Unassigned',
  'depgraph.node.blockedBy': 'Blocked by “{label}”',
  'depgraph.node.criticalChain': 'Critical chain',
  'depgraph.detail.title': 'Node detail',
  'depgraph.detail.clickAny': 'Click any task',
  'depgraph.detail.empty':
    "Click a task node to see its owner, status, what's blocking it, and what to read while waiting.",
  'depgraph.detail.ownerGroup': 'Owner · group',
  'depgraph.detail.robotComplexity': 'Robot · complexity',
  'depgraph.detail.blockedBy': 'Blocked by',
  'depgraph.detail.blockedByValue':
    "“{label}” not done (it's the task that's blocked, not the person)",
  'depgraph.detail.unmetNeeds': 'Unmet needs',
  'depgraph.detail.criticalChain': 'Critical chain',
  'depgraph.detail.criticalChainValue': 'On the main path converging to integration',
  'depgraph.detail.learnTitle': 'What to read while waiting',
  'depgraph.detail.myMap': 'View my knowledge map',
};

export const translations: Record<Lang, Record<TranslationKey, string>> = {
  zh,
  en,
};

export function translate(
  lang: Lang,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const template = translations[lang][key] ?? translations.zh[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
