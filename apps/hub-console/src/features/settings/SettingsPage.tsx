import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AgentBackend, BotChannel } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n, type TranslationKey } from '../../i18n';
import { useTheme } from '../../theme';
import { segClass } from '../../utils';
import { MetaRow } from '../../components/MetaRow';
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
          <div
            className="seg"
            role="group"
            aria-label={t('settings.section.language')}
          >
            <button
              type="button"
              className={segClass(lang === 'zh')}
              onClick={() => setLang('zh')}
            >
              {t('settings.language.zh')}
            </button>
            <button
              type="button"
              className={segClass(lang === 'en')}
              onClick={() => setLang('en')}
            >
              {t('settings.language.en')}
            </button>
          </div>
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>{t('settings.section.appearance')}</h2>
        </div>
        <div className="settings-section">
          <p className="settings-desc">{t('settings.appearance.desc')}</p>
          <div
            className="seg"
            role="group"
            aria-label={t('settings.section.appearance')}
          >
            <button
              type="button"
              className={segClass(theme === 'classic')}
              onClick={() => setTheme('classic')}
            >
              {t('settings.theme.classic')}
            </button>
            <button
              type="button"
              className={segClass(theme === 'warm')}
              onClick={() => setTheme('warm')}
            >
              {t('settings.theme.warm')}
            </button>
          </div>
        </div>
      </section>

      <IntegrationsSection client={client} source={source} />
      <ApiBaseSection />
      <WriteTokenSection />
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

// 后端地址：localStorage 覆盖 VITE_API_BASE。改动后 reload 让 client 按新 base 重建。
function ApiBaseSection() {
  const { t } = useI18n();
  const stored = window.localStorage.getItem(APIBASE_KEY) ?? '';
  const [value, setValue] = useState(stored);
  const effective = stored.trim() || (import.meta.env.VITE_API_BASE ?? '/');

  function apply() {
    const next = value.trim();
    if (next) window.localStorage.setItem(APIBASE_KEY, next);
    else window.localStorage.removeItem(APIBASE_KEY);
    window.location.reload();
  }

  function reset() {
    window.localStorage.removeItem(APIBASE_KEY);
    window.location.reload();
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.apiBase')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.apiBase.desc')}</p>
        <label className="kb-field">
          <span>{t('settings.apiBase.label')}</span>
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('settings.apiBase.placeholder')}
          />
        </label>
        <p className="settings-current">
          {t('settings.apiBase.current', { value: effective })}
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="kb-submit"
            onClick={apply}
            disabled={value.trim() === stored.trim()}
          >
            {t('settings.apiBase.apply')}
          </button>
          <button
            type="button"
            className="settings-btn"
            onClick={reset}
            disabled={stored.trim() === ''}
          >
            {t('settings.apiBase.reset')}
          </button>
        </div>
      </div>
    </section>
  );
}

// 写入令牌：server 绑非 loopback（0.0.0.0）时写端点（登记图纸 / 录入任务等 POST）须带
// Authorization: Bearer <token>。把服务启动日志里那串 TEAMHUB_WRITE_TOKEN 粘进来即可。
// 与"后端地址"同套路：存 localStorage，改动后 reload 让 client 带上令牌重建。
function WriteTokenSection() {
  const { t } = useI18n();
  const stored = window.localStorage.getItem(WRITE_TOKEN_KEY) ?? '';
  const [value, setValue] = useState(stored);

  function apply() {
    const next = value.trim();
    if (next) window.localStorage.setItem(WRITE_TOKEN_KEY, next);
    else window.localStorage.removeItem(WRITE_TOKEN_KEY);
    window.location.reload();
  }

  function reset() {
    window.localStorage.removeItem(WRITE_TOKEN_KEY);
    window.location.reload();
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.writeToken')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.writeToken.desc')}</p>
        <label className="kb-field">
          <span>{t('settings.writeToken.label')}</span>
          <input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('settings.writeToken.placeholder')}
            autoComplete="off"
          />
        </label>
        <p className="settings-current">
          {value.trim()
            ? t('settings.writeToken.set')
            : t('settings.writeToken.unset')}
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="kb-submit"
            onClick={apply}
            disabled={value.trim() === stored.trim()}
          >
            {t('settings.writeToken.apply')}
          </button>
          <button
            type="button"
            className="settings-btn"
            onClick={reset}
            disabled={stored.trim() === ''}
          >
            {t('settings.writeToken.reset')}
          </button>
        </div>
      </div>
    </section>
  );
}

// 关于：service · version · 服务端模式取 /api/system/status。单一真实后端，无数据源回显。
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
              value={statusQuery.data.mode}
              mono
            />
          </dl>
        )}
      </div>
    </section>
  );
}
