import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, X } from 'lucide-react';
import type { AppSettings, VerticalId } from '@teamhub/hub-contracts';
import { createHubApiClient, type HubApiClient } from './api/client';
import { queryKeys } from './api/queryKeys';
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
import { APIBASE_KEY, SETUP_LANDING_KEY, WRITE_TOKEN_KEY } from './constants';
import { IdentityBar } from './features/identity/IdentityBar';
import { SetupWizard } from './features/setup/SetupWizard';
import { BootstrapGate } from './features/setup/BootstrapGate';
import { ChecklistQuickRecord } from './features/checklist/ChecklistQuickRecord';
import { canWriteIdentity, identityCacheKey } from './shared/lib/identity-utils';
// 单一真实后端：queryKey 维度保留稳定常量（曾区分 mock/real，现恒为 real），
// 避免改动各页 queryKey 形状。
const SOURCE = 'real';

// 垂直包与模块列表都来自 SQLite app_settings。当前共享契约只注册 robotics；
// 未来增加垂直包时在这个窄装配点增加对应词汇表，不再引入编译期租户配置。
function configureVerticalVocabulary(verticalId: VerticalId): void {
  switch (verticalId) {
    case 'robotics':
      setVocabularyOverrides(ROBOTICS_VOCAB_OVERRIDES);
      return;
  }
}

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

/**
 * 启动闸只信 `GET /api/setup/state`：empty 进首启向导，unclaimed 阻塞误认领，
 * initialized 把服务端 AppSettings 交给正常 app。状态读不到时 fail closed，不再回退到编译期默认模块。
 */
export function App() {
  const apiClient = useMemo(
    () =>
      createHubApiClient({
        baseUrl: readApiBase(),
        writeToken: readWriteToken(),
      }),
    [],
  );

  const setupQuery = useQuery({
    queryKey: ['setup-state'],
    queryFn: () => apiClient.getSetupState(),
    retry: 1,
  });

  if (setupQuery.isLoading) return <SetupSplash />;
  if (setupQuery.error || !setupQuery.data) {
    return <SetupStateUnavailable onRetry={() => void setupQuery.refetch()} />;
  }
  if (!setupQuery.data.initialized) {
    return <SetupWizard client={apiClient} state={setupQuery.data} />;
  }
  configureVerticalVocabulary(setupQuery.data.settings.verticalId);
  return <ConsoleApp apiClient={apiClient} settings={setupQuery.data.settings} />;
}

// setup/state 未落定前的极简全屏占位（无 chrome、无 nav）：只一个转圈，避免闪现半截 app 或向导。
function SetupSplash() {
  return (
    <div className="setup-wizard setup-wizard--center" aria-hidden="true">
      <div className="setup-wizard__inner setup-wizard__status">
        <div className="setup-spinner" />
      </div>
    </div>
  );
}

function SetupStateUnavailable({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="setup-wizard setup-wizard--center" role="alert">
      <div className="setup-wizard__inner setup-wizard__status">
        <h1 className="setup-wizard__title">{t('setup.stateUnavailable.title')}</h1>
        <p className="setup-wizard__subtitle">{t('setup.stateUnavailable.desc')}</p>
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          {t('setup.stateUnavailable.retry')}
        </button>
      </div>
    </div>
  );
}

// 正常运行态的 console 主壳（原 App 主体，apiClient 由启动闸创建后下传，避免重复构造）。
function ConsoleApp({ apiClient, settings }: { apiClient: HubApiClient; settings: AppSettings }) {
  const { t } = useI18n();
  const enabledPages = useMemo(
    () => filterConsolePages(CONSOLE_PAGES, settings),
    [settings],
  );

  // 首启动向导落点（SETUP-WIZARD 刀②，setup-wizard.md §5 末段）：正式+登录制重启回来后，落设置页并亮出
  // 「三步走：导入名册 → 登录本人 → 初始化管理员」引导横幅（复用现有名册导入 / 初始化管理员流程，向导不
  // 重复实现）。标记经 localStorage 跨整页刷新传递，读到即清除——只出现一次，刷新 / 再进不复现。
  const [setupLanding] = useState<boolean>(() => {
    const flag = window.localStorage.getItem(SETUP_LANDING_KEY);
    if (flag) window.localStorage.removeItem(SETUP_LANDING_KEY);
    return flag === 'roster';
  });
  const [page, setPage] = useState<ConsolePage>(setupLanding ? 'settings' : 'overview');
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(setupLanding);

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
    queryKey: queryKeys.hubOverview(SOURCE, identityCacheKey(identitySession)),
    queryFn: () => apiClient.getOverview(),
  });

  // 全屏初始化门（SETUP-WIZARD-ROSTER 刀②）：identity 模式且名册无任何持「项目管理」旗标成员 →
  // 整屏换 BootstrapGate（①你是谁→bootstrap 一笔建人+授旗+PIN+登录态 ②导入 CSV ③确认组长 ④进 app），
  // 完成才渲染正常 shell。匿名 / demo 路径不出现（匿名无身份概念；demo fixtures 自带持旗成员 m-progA）。
  // 读端点无鉴权，未登录也能读名册做判定。gateDone = 本标签页走完门后不再出现（刷新后条件已假：
  // 门第①步已授旗——中途刷新则直接进 app，后续可经设置页补导入/确认）。
  const [gateDone, setGateDone] = useState(false);
  const gateShownRef = useRef(false);
  const gateMembersQuery = useQuery({
    queryKey: ['members', 'bootstrap-gate'],
    queryFn: () => apiClient.getMembers(),
    enabled: identityMode === 'identity',
  });
  const gateConditionMet =
    identityMode === 'identity' &&
    !gateDone &&
    !sessionQuery.isLoading &&
    !gateMembersQuery.isLoading &&
    !(gateMembersQuery.data?.members.some((m) => m.projectManager === true) ?? true);
  if (gateConditionMet) gateShownRef.current = true;
  const needsBootstrapGate = gateConditionMet || (gateShownRef.current && !gateDone);
  if (needsBootstrapGate) {
    return <BootstrapGate client={apiClient} onDone={() => { gateShownRef.current = false; setGateDone(true); }} />;
  }

  // 页面注册表（console-pages.tsx）驱动渲染 + 标题——不再是 if-else 链（HUB-MODULARIZATION 第2步）。
  // 只在按服务端 AppSettings 过滤后的列表里找页：未启用模块的页不存在。
  const activePage = enabledPages.find((p) => p.key === page);
  // 路由直达降级（PHASE2-CONSOLE-ASSEMBLY）：page 落在全量注册表里但被当前租户关掉的模块过滤掉——
  // 例如某组件的 onNavigate 指向一个本租户未启用的页。区别于"key 根本不存在"（TS 类型已堵死，理论不可达）。
  const disabledPage = !activePage ? CONSOLE_PAGES.find((p) => p.key === page) : undefined;
  const renderCtx: PageRenderCtx = {
    apiClient,
    source: SOURCE,
    projectId: settings.projectId,
    onNavigate: setPage,
    overview: {
      isLoading: overviewQuery.isLoading,
      error: overviewQuery.error,
      data: overviewQuery.data,
      refetch: () => void overviewQuery.refetch(),
    },
    identity,
  };

  return (
    <ConsoleLayout page={page} onNavigate={setPage} pages={enabledPages} client={apiClient}>
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
          {/* 全局「快记欠条」入口（GATE-CHECKLIST-IOU 设计 §3，D-087）：任何人一句话贴条，默认挂下一道
              整车级门。无基准线时组件自身 return null（IdentityBar 同位先例）。 */}
          <ChecklistQuickRecord client={apiClient} source={SOURCE} identity={identity} />
          {/* 匿名模式（缺省）下本组件零 UI（return null），界面与今天逐字一致。 */}
          <IdentityBar client={apiClient} mode={identity.mode} session={identity.session} />
          {/* 刷新按钮归一进正常注册机制（AUDIT-DEBT-2026-07 §9-④ 审计债⑤）：不再按 page key
              字面量特判，改问 activePage 自己是否声明了 onRefresh——今天仍只有总览页声明，
              渲染结果与改动前逐字一致，差别是判断权归了页面注册表。 */}
          {activePage?.onRefresh ? (
            <button
              className="icon-button"
              type="button"
              onClick={() => activePage.onRefresh?.(renderCtx)}
              aria-label={t('toolbar.refresh')}
              title={t('toolbar.refresh')}
            >
              <RefreshCw aria-hidden="true" size={18} />
            </button>
          ) : null}
        </div>
      </div>
      {/* 首启动向导落点引导横幅（SETUP-WIZARD 刀②）：正式+登录制装完落设置页时亮出「三步走」，
          可关闭；离开设置页自动隐藏。指向的名册导入 / 登录 / 初始化管理员均是设置页现有流程。 */}
      {activePage?.key === 'settings' && showSetupGuide ? (
        <div className="setup-guide-banner" role="status">
          <div className="setup-guide-banner__body">
            <strong>{t('setup.landing.title')}</strong>
            <p>{t('setup.landing.steps')}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => setShowSetupGuide(false)}
            aria-label={t('setup.landing.dismiss')}
            title={t('setup.landing.dismiss')}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
      ) : null}
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
