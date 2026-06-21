import type { PropsWithChildren } from 'react';
import {
  BookOpen,
  Bot,
  Boxes,
  Compass,
  FileStack,
  Home,
  LayoutGrid,
  Settings,
} from 'lucide-react';
import { useI18n, type TranslationKey } from '../../i18n';

export type ConsolePage =
  | 'overview'
  | 'project'
  | 'knowledge'
  | 'archive'
  | 'inv'
  | 'fleet'
  | 'gaps'
  | 'settings';

interface NavItem {
  labelKey: TranslationKey;
  icon: typeof Home;
  page?: ConsolePage;
  // 无 page 时该项灰禁用；tooltipKey 覆盖默认的 nav.soon 提示（如库存/BOM 标「开发中」）
  tooltipKey?: TranslationKey;
}

// 扁平导航（IA D-077）：按数据域从上到下排，无分组、无折叠（用户拍板：洞察不该可收、摊开）。
// 终态顺序固定：总览 → 项目 → 知识库 → 图纸档案 → 库存 → 机器人队 → 缺人方向 → 设置。
const navItems: NavItem[] = [
  { labelKey: 'nav.overview', icon: Home, page: 'overview' },
  // 项目（IA 阶段 2 / D-076 续 D-077）：任务看板 + 依赖图视图切换（任务域单页，组合不重写）。
  { labelKey: 'nav.project', icon: LayoutGrid, page: 'project' },
  // 知识库 = 相似 Bug 检索（跨赛季召回）。与「图纸档案」是两个数据域，D-077 拆开各自顶级项。
  { labelKey: 'nav.knowledge', icon: BookOpen, page: 'knowledge' },
  // 图纸档案（A8）：图纸提交日志 / 版本时间线，读治理快照 artifacts。独立页（非并入知识库）。
  { labelKey: 'nav.archive', icon: FileStack, page: 'archive' },
  // 第三支柱：库存 / BOM（INV-BOM-CORE）。零件×机器人 矩阵 + 一句话快记 + 缺料告警。
  { labelKey: 'nav.inv', icon: Boxes, page: 'inv' },
  // 机器人队（IA 阶段 1 / D-075）：机器人管理 + 在场排班接力画布合一（机器人域单页）。
  { labelKey: 'nav.fleet', icon: Bot, page: 'fleet' },
  // 缺人方向（S2，D-069）：组级派生缺口，只到组、不指向人（A1）。只读洞察、置于末尾。
  { labelKey: 'nav.gaps', icon: Compass, page: 'gaps' },
  { labelKey: 'nav.settings', icon: Settings, page: 'settings' },
];

interface ConsoleLayoutProps {
  page: ConsolePage;
  onNavigate: (page: ConsolePage) => void;
}

export function ConsoleLayout({
  children,
  page,
  onNavigate,
}: PropsWithChildren<ConsoleLayoutProps>) {
  const { t } = useI18n();

  return (
    <div className="console-shell">
      <aside className="console-sidebar" aria-label={t('layout.sidebar.nav')}>
        <div className="console-brand">
          <span className="brand-mark">TH</span>
          <div>
            <strong>Team Hub</strong>
            <span>{t('brand.subtitle.real')}</span>
          </div>
        </div>
        <nav className="console-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.page !== undefined && item.page === page;
            const disabled = item.page === undefined;
            return (
              <button
                className={isActive ? 'nav-item nav-item-active' : 'nav-item'}
                type="button"
                key={item.labelKey}
                onClick={() => item.page && onNavigate(item.page)}
                disabled={disabled}
                title={disabled ? t(item.tooltipKey ?? 'nav.soon') : undefined}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon aria-hidden="true" size={17} />
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="console-main" id="console-main">
        {children}
      </main>
    </div>
  );
}
