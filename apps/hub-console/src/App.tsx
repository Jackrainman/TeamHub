import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { ROBOTICS_TENANT_CONFIG, type TenantConfig } from '@teamhub/hub-contracts';
import { createHubApiClient } from './api/client';
import { ConsoleLayout } from './components/layout/ConsoleLayout';
import {
  CONSOLE_PAGES,
  filterConsolePages,
  type ConsolePage,
  type PageIdentityCtx,
  type PageRenderCtx,
} from './console-pages';
import { setVocabularyOverrides, useI18n } from './i18n';
import { ROBOTICS_VOCAB_OVERRIDES } from './verticals/robotics';
import { APIBASE_KEY, WRITE_TOKEN_KEY } from './constants';
import { IdentityBar } from './features/identity/IdentityBar';
import { canWriteIdentity, identityCacheKey } from './features/identity/identity-utils';
// 单一真实后端：queryKey 维度保留稳定常量（曾区分 mock/real，现恒为 real），
// 避免改动各页 queryKey 形状。
const SOURCE = 'real';

/**
 * 装配点（PHASE2-CONSOLE-ASSEMBLY，D-081 已知延后项①②收口）：租户配置目前是编译期常量注入，
 * 不做运行期远程拉取（见 docs/design/modularization-feasibility.md §3.4-A「装配层必须极薄」+
 * §6.1「不引入 IoC 容器/插件市场/动态加载」）。robotics 默认 = 全 6 模块启用，与 hub-server
 * `buildHubServer` 的缺省 `tenantConfig ?? ROBOTICS_TENANT_CONFIG` 同一份常量、同口径。
 * 换租户（如游戏工作室）目前 = 换这一行常量，是本步刻意留的清晰接缝。
 */
const TENANT_CONFIG: TenantConfig = ROBOTICS_TENANT_CONFIG;
const ENABLED_PAGES = filterConsolePages(CONSOLE_PAGES, TENANT_CONFIG);

// 垂直包词汇覆盖接线（HUB-MODULARIZATION 第6步 i18n 通道，D-081 已知延后项②收口）：装配层在此
// 调用 setVocabularyOverrides，往下 translate() 读取才有真值可读。robotics 覆盖表恒为空
// （见 verticals/robotics.ts），故本行为与接线前逐字一致——机制先行验证，非视觉改动。
setVocabularyOverrides(ROBOTICS_VOCAB_OVERRIDES);

// 后端地址：localStorage 覆盖（设置页可改）> VITE_API_BASE > 同源 '/'。
function readApiBase(): string {
  const override = window.localStorage.getItem(APIBASE_KEY)?.trim();
  if (override) return override;
  return import.meta.env.VITE_API_BASE ?? '/';
}

// 写入令牌：设置页填入 localStorage；server 绑非 loopback 时写端点需带它（读端点不限）。
function readWriteToken(): string | undefined {
  return window.localStorage.getItem(WRITE_TOKEN_KEY)?.trim() || undefined;
}

export function App() {
  const { t } = useI18n();
  const [page, setPage] = useState<ConsolePage>('overview');

  // 单一真实后端：默认相对路径同源（dev 走 vite proxy → 本地 hub-server；同源部署直接命中 /api）。
  // VITE_API_BASE / 设置页 localStorage 可覆盖为绝对地址。
  const apiClient = useMemo(
    () =>
      createHubApiClient({
        baseUrl: readApiBase(),
        writeToken: readWriteToken(),
      }),
    [],
  );

  // 轻身份（IDENTITY-LITE，I2 console 接线）：两模式均可读，缺省 anonymous（GET /api/session
  // 报当前部署模式 + 当前身份），前端据此判断要不要渲染登录 UI / 收紧写门——不是另开一个开关。
  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: () => apiClient.getSession(),
  });
  const identityMode = sessionQuery.data?.mode ?? 'anonymous';
  const identitySession = sessionQuery.data?.session ?? null;
  const identity: PageIdentityCtx = {
    mode: identityMode,
    session: identitySession,
    isLoading: sessionQuery.isLoading,
    canWrite: canWriteIdentity(identityMode, identitySession),
  };

  // queryKey 身份维度（product-redefine §9-②）：拼进当前登录人 memberId（未登录/匿名模式归一
  // 'anon'）——身份切换后天然落进不同缓存桶，不会读到切换前那个人缓存下的数据。IdentityBar 登录/
  // 登出成功后另 invalidateQueries() 兜底刷新其它未按此维度分桶的查询（见该组件注释）。
  const overviewQuery = useQuery({
    queryKey: ['hub-overview', SOURCE, identityCacheKey(identitySession)],
    queryFn: () => apiClient.getOverview(),
  });

  // 页面注册表（console-pages.tsx）驱动渲染 + 标题——不再是 if-else 链（HUB-MODULARIZATION 第2步）。
  // 只在按 TenantConfig 过滤后的列表里找页：未启用模块的页在 ENABLED_PAGES 里不存在。
  const activePage = ENABLED_PAGES.find((p) => p.key === page);
  // 路由直达降级（PHASE2-CONSOLE-ASSEMBLY）：page 落在全量注册表里但被当前租户关掉的模块过滤掉——
  // 例如某组件的 onNavigate 指向一个本租户未启用的页。区别于"key 根本不存在"（TS 类型已堵死，理论不可达）。
  const disabledPage = !activePage ? CONSOLE_PAGES.find((p) => p.key === page) : undefined;
  const renderCtx: PageRenderCtx = {
    apiClient,
    source: SOURCE,
    onNavigate: setPage,
    overview: {
      isLoading: overviewQuery.isLoading,
      error: overviewQuery.error,
      data: overviewQuery.data,
    },
    identity,
  };

  return (
    <ConsoleLayout page={page} onNavigate={setPage} pages={ENABLED_PAGES}>
      <div className="console-toolbar">
        <div>
          <p className="eyebrow">{t('toolbar.eyebrow')}</p>
          <h1>
            {activePage
              ? t(activePage.titleKey)
              : disabledPage
                ? t('module.disabled.title')
                : null}
          </h1>
        </div>
        <div className="console-toolbar__actions">
          {/* 匿名模式（缺省）下本组件零 UI（return null），界面与今天逐字一致。 */}
          <IdentityBar client={apiClient} mode={identity.mode} session={identity.session} />
          {page === 'overview' ? (
            <button
              className="icon-button"
              type="button"
              onClick={() => void overviewQuery.refetch()}
              aria-label={t('toolbar.refresh')}
              title={t('toolbar.refresh')}
            >
              <RefreshCw aria-hidden="true" size={18} />
            </button>
          ) : null}
        </div>
      </div>
      {activePage ? (
        activePage.render(renderCtx)
      ) : disabledPage ? (
        <div className="state-band state-band-error" role="alert">
          {t('module.disabled.message')}
        </div>
      ) : null}
    </ConsoleLayout>
  );
}
