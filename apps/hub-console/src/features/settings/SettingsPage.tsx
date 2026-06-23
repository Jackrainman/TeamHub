import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AgentBackend, BotChannel } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n, type TranslationKey } from '../../i18n';
import { useTheme } from '../../theme';
import { MetaRow } from '../../components/MetaRow';
import { SegToggle } from '../../components/SegToggle';
import { APIBASE_KEY, WRITE_TOKEN_KEY } from '../../constants';

// 设置页：收纳此前散落各处的运行时设置——语言 / 集成 / 后端地址 / 关于。
// 语言复用 i18n 的同一份状态（无本地副本，故无同步问题）。单一真实后端，无数据源切换。

// Agent 后端 / 数据源共用生命周期状态枚举 → 文案键（枚举变更会在此处编译报错）。
const LIFECYCLE_STATUS_KEY: Record<AgentBackend['status'], TranslationKey> = {
  enabled: 'enum.adapter.enabled',
  disabled: 'enum.adapter.disabled',
  degraded: 'enum.adapter.degraded',
  unconfigured: 'enum.adapter.unconfigured',
};

// BOT 渠道用连接型状态枚举（独立文案）。pill 颜色复用既有 status-* 样式，无需改 CSS。
const BOT_CHANNEL_STATUS_KEY: Record<BotChannel['status'], TranslationKey> = {
  connected: 'enum.botChannel.connected',
  disconnected: 'enum.botChannel.disconnected',
  unconfigured: 'enum.botChannel.unconfigured',
};

const BOT_CHANNEL_PILL_CLASS: Record<BotChannel['status'], string> = {
  connected: 'status-enabled',
  disconnected: 'status-disabled',
  unconfigured: 'status-unconfigured',
};

// 语言选项——扩展时须同步 i18n 键（settings.language.<value>）与 Lang 类型。
const LANG_OPTIONS = [
  { value: 'zh' as const, labelKey: 'settings.language.zh' as const },
  { value: 'en' as const, labelKey: 'settings.language.en' as const },
];

// 主题选项——扩展时须同步 i18n 键（settings.theme.<value>）与 Theme 类型。
const THEME_OPTIONS = [
  { value: 'classic' as const, labelKey: 'settings.theme.classic' as const },
  { value: 'warm' as const, labelKey: 'settings.theme.warm' as const },
  { value: 'dark' as const, labelKey: 'settings.theme.dark' as const },
];

// 服务端运行模式枚举文案（mock-first / real / hybrid）。枚举原值不翻译，title 作注释。
// 键名须在 translations.ts 中存在（settings.about.mode.mockFirst / .real / .hybrid）。
const MODE_LABEL: Record<'mock-first' | 'real' | 'hybrid', TranslationKey> = {
  'mock-first': 'settings.about.mode.mockFirst',
  real: 'settings.about.mode.real',
  hybrid: 'settings.about.mode.hybrid',
};

interface IntegrationRow {
  key: string;
  name: string;
  meta: string;
  statusLabel: string;
  pillClass: string;
}

export function SettingsPage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className="settings-page">
      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>{t('settings.section.language')}</h2>
        </div>
        <div className="settings-section">
          <p className="settings-desc">{t('settings.language.desc')}</p>
          {/* 语言 = 即时控件（FORM-UNIFY B3 / §1.3.7）：点选即 setLang、不套表单、无提交按钮。
              seg → SegToggle（吐同款 div.seg + seg__btn(segClass)，像素零变）。 */}
          <SegToggle
            value={lang}
            options={LANG_OPTIONS.map((opt) => ({
              value: opt.value,
              label: t(opt.labelKey),
            }))}
            onChange={setLang}
            ariaLabel={t('settings.section.language')}
          />
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>{t('settings.section.appearance')}</h2>
        </div>
        <div className="settings-section">
          <p className="settings-desc">{t('settings.appearance.desc')}</p>
          {/* 主题 = 即时控件（FORM-UNIFY B3 / §1.3.7）：点选即 setTheme、不套表单、无提交按钮。
              seg → SegToggle（吐同款 div.seg + seg__btn(segClass)，像素零变）。 */}
          <SegToggle
            value={theme}
            options={THEME_OPTIONS.map((opt) => ({
              value: opt.value,
              label: t(opt.labelKey),
            }))}
            onChange={setTheme}
            ariaLabel={t('settings.section.appearance')}
          />
        </div>
      </section>

      <IntegrationsSection client={client} source={source} />
      <ConnectionSection />
      <AboutSection client={client} source={source} />
    </div>
  );
}

// 集成（只读）：地基重建后按物种三分——BOT 渠道（飞书/微信/QQ）/ Agent 后端（Hermes/OpenClaw/
// Claude Code）/ 数据源（Git/图纸库）。复用总览数据（同 queryKey 共享缓存），展示在设置页。
function IntegrationsSection({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const overviewQuery = useQuery({
    queryKey: ['hub-overview', source],
    queryFn: () => client.getOverview(),
  });
  const data = overviewQuery.data;

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.integrations')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.integrations.desc')}</p>
        {overviewQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : overviewQuery.error || !data ? (
          <p className="form-hint form-hint--warn">
            {t('settings.integrations.unavailable')}
          </p>
        ) : (
          <>
            <IntegrationGroup
              title={t('settings.integrations.botChannels')}
              rows={data.botChannels.botChannels.map(
                (channel): IntegrationRow => ({
                  key: channel.id,
                  name: channel.displayName,
                  meta: botChannelMeta(channel),
                  statusLabel: t(BOT_CHANNEL_STATUS_KEY[channel.status]),
                  pillClass: BOT_CHANNEL_PILL_CLASS[channel.status],
                }),
              )}
            />
            <IntegrationGroup
              title={t('settings.integrations.agentBackends')}
              rows={data.agentBackends.agentBackends.map(
                (backend): IntegrationRow => ({
                  key: backend.id,
                  name: backend.displayName,
                  meta: `${backend.mode} · ${backend.capabilities.join(', ')}`,
                  statusLabel: t(LIFECYCLE_STATUS_KEY[backend.status]),
                  pillClass: `status-${backend.status}`,
                }),
              )}
            />
            <IntegrationGroup
              title={t('settings.integrations.dataSources')}
              rows={data.dataSources.dataSources.map(
                (ds): IntegrationRow => ({
                  key: ds.id,
                  name: ds.displayName,
                  meta: `${ds.kind} · ${ds.sourceRef}`,
                  statusLabel: t(LIFECYCLE_STATUS_KEY[ds.status]),
                  pillClass: `status-${ds.status}`,
                }),
              )}
            />
          </>
        )}
      </div>
    </section>
  );
}

// BOT 渠道副标题：平台 + 收/发能力（数据值，不翻译）。
function botChannelMeta(channel: BotChannel): string {
  const dirs = [channel.inbound ? '收' : null, channel.outbound ? '发' : null]
    .filter((d): d is string => d !== null)
    .join('/');
  return dirs ? `${channel.platform} · ${dirs}` : channel.platform;
}

function IntegrationGroup({
  title,
  rows,
}: {
  title: string;
  rows: IntegrationRow[];
}) {
  const { t } = useI18n();
  return (
    <div className="integration-group">
      <h3 className="integration-group__title">{title}</h3>
      {rows.length === 0 ? (
        <p className="settings-desc">{t('settings.integrations.empty')}</p>
      ) : (
        <div className="adapter-grid">
          {rows.map((row) => (
            <article className="adapter-row" key={row.key}>
              <div>
                <strong>{row.name}</strong>
                <span>{row.meta}</span>
              </div>
              <span className={`status-pill ${row.pillClass}`}>
                {row.statusLabel}
              </span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// 连接：后端地址 + 写入令牌合并为单一 panel，减少滚动。
// 后端地址覆盖 VITE_API_BASE；写入令牌在 server 绑公网时保证写端点授权。
// 改动后 reload 让 client 按新配置重建。
function ConnectionSection() {
  const { t } = useI18n();

  // --- 后端地址状态 ---
  const storedBase = window.localStorage.getItem(APIBASE_KEY) ?? '';
  const [baseValue, setBaseValue] = useState(storedBase);
  const effectiveBase = storedBase.trim() || (import.meta.env.VITE_API_BASE ?? '/');

  // FORM-UNIFY B3：apply 改 form 提交语义（type=submit）；行为与旧 onClick 逐字一致——
  // 写 localStorage + reload。preventDefault 防原生导航。disabled 守卫与按钮一致（无变更不提交）。
  function applyBase(event: FormEvent) {
    event.preventDefault();
    if (baseValue.trim() === storedBase.trim()) return;
    const next = baseValue.trim();
    if (next) window.localStorage.setItem(APIBASE_KEY, next);
    else window.localStorage.removeItem(APIBASE_KEY);
    window.location.reload();
  }

  function resetBase() {
    window.localStorage.removeItem(APIBASE_KEY);
    window.location.reload();
  }

  // --- 写入令牌状态 ---
  const storedToken = window.localStorage.getItem(WRITE_TOKEN_KEY) ?? '';
  const [tokenValue, setTokenValue] = useState(storedToken);

  function applyToken(event: FormEvent) {
    event.preventDefault();
    if (tokenValue.trim() === storedToken.trim()) return;
    const next = tokenValue.trim();
    if (next) window.localStorage.setItem(WRITE_TOKEN_KEY, next);
    else window.localStorage.removeItem(WRITE_TOKEN_KEY);
    window.location.reload();
  }

  function resetToken() {
    window.localStorage.removeItem(WRITE_TOKEN_KEY);
    window.location.reload();
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.connection')}</h2>
      </div>
      <div className="settings-section">
        {/* 后端地址：apply 改真 <form onSubmit>（FORM-UNIFY B3）。form 用 display:contents——
            其盒子从布局消失，label/current/actions 仍作 .settings-section 的直接 flex 项（12px gap 不变），
            像素零变；同时获得真表单语义（Enter 提交、type=submit）。reset 留 type=button（非提交动作）。
            注意：本 section 无外层 form，不会 form 嵌套。 */}
        <form style={{ display: 'contents' }} onSubmit={applyBase}>
          {/* 后端地址 */}
          <p className="settings-desc">{t('settings.apiBase.desc')}</p>
          <label className="kb-field">
            <span>{t('settings.apiBase.label')}</span>
            <input
              type="text"
              value={baseValue}
              onChange={(event) => setBaseValue(event.target.value)}
              placeholder={t('settings.apiBase.placeholder')}
            />
          </label>
          <p className="settings-current">
            {t('settings.apiBase.current', { value: effectiveBase })}
          </p>
          <div className="settings-actions">
            <button
              type="submit"
              className="kb-submit"
              disabled={baseValue.trim() === storedBase.trim()}
            >
              {t('settings.apiBase.apply')}
            </button>
            <button
              type="button"
              className="settings-btn"
              onClick={resetBase}
              disabled={storedBase.trim() === ''}
            >
              {t('settings.apiBase.reset')}
            </button>
          </div>
        </form>

        {/* 写入令牌：同上，独立 display:contents form（spaced desc 作首个 flex 项保留 gap）。 */}
        <form style={{ display: 'contents' }} onSubmit={applyToken}>
          {/* 写入令牌 */}
          <p className="settings-desc settings-desc--spaced">{t('settings.writeToken.desc')}</p>
          <label className="kb-field">
            <span>{t('settings.writeToken.label')}</span>
            <input
              type="password"
              value={tokenValue}
              onChange={(event) => setTokenValue(event.target.value)}
              placeholder={t('settings.writeToken.placeholder')}
              autoComplete="off"
            />
          </label>
          <p className="settings-current">
            {tokenValue.trim()
              ? t('settings.writeToken.set')
              : t('settings.writeToken.unset')}
          </p>
          <div className="settings-actions">
            <button
              type="submit"
              className="kb-submit"
              disabled={tokenValue.trim() === storedToken.trim()}
            >
              {t('settings.writeToken.apply')}
            </button>
            <button
              type="button"
              className="settings-btn"
              onClick={resetToken}
              disabled={storedToken.trim() === ''}
            >
              {t('settings.writeToken.reset')}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

// 关于：service · version · 服务端模式取 /api/system/status。
// mode 枚举原值（mock-first / real / hybrid）附带 title 说明，方便快速理解含义。
function AboutSection({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const statusQuery = useQuery({
    queryKey: ['system-status', source],
    queryFn: () => client.getSystemStatus(),
  });

  // 安全地将 mode 映射到 i18n 键；未知值直接回显原值。
  function modeLabel(mode: string): string {
    if (mode === 'mock-first' || mode === 'real' || mode === 'hybrid') {
      return `${mode} — ${t(MODE_LABEL[mode])}`;
    }
    return mode;
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.about')}</h2>
      </div>
      <div className="settings-section">
        {statusQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : statusQuery.error || !statusQuery.data ? (
          <p className="form-hint form-hint--warn">
            {t('settings.about.unavailable')}
          </p>
        ) : (
          <dl className="kb-meta">
            <MetaRow
              label={t('settings.about.service')}
              value={statusQuery.data.service}
            />
            <MetaRow
              label={t('settings.about.version')}
              value={statusQuery.data.version}
              mono
            />
            <MetaRow
              label={t('settings.about.mode')}
              value={modeLabel(statusQuery.data.mode)}
              mono
            />
          </dl>
        )}
      </div>
    </section>
  );
}
