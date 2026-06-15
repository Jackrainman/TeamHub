import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdapterDescriptor } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n, type TranslationKey } from '../../i18n';

// 设置页：收纳此前散落各处的运行时设置——语言 / 集成 / 后端地址 / 关于。
// 语言复用 i18n 的同一份状态（无本地副本，故无同步问题）。单一真实后端，无数据源切换。
const APIBASE_KEY = 'teamhub.apiBase';

// 集成状态枚举 → 文案键（与总览同一份枚举；枚举变更会在此处编译报错）。
const INTEGRATION_STATUS_KEY: Record<AdapterDescriptor['status'], TranslationKey> = {
  enabled: 'enum.adapter.enabled',
  disabled: 'enum.adapter.disabled',
  degraded: 'enum.adapter.degraded',
  unconfigured: 'enum.adapter.unconfigured',
};

function segClass(active: boolean): string {
  return active ? 'seg__btn seg__btn--active' : 'seg__btn';
}

export function SettingsPage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t, lang, setLang } = useI18n();

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

      <IntegrationsSection client={client} source={source} />
      <ApiBaseSection />
      <AboutSection client={client} source={source} />
    </div>
  );
}

// 集成（只读）：飞书 / Hermes / Git 等外部应用对接状态。复用总览的 adapter 数据
// （同 queryKey 共享缓存），但展示挪到设置页——总览只留指标 + 一行「去设置查看」。
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
  const adapters = overviewQuery.data?.adapters.adapters ?? [];

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.integrations')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.integrations.desc')}</p>
        {overviewQuery.isLoading ? (
          <p className="settings-desc">…</p>
        ) : overviewQuery.error || !overviewQuery.data ? (
          <p className="form-hint form-hint--warn">
            {t('settings.integrations.unavailable')}
          </p>
        ) : adapters.length === 0 ? (
          <p className="settings-desc">{t('settings.integrations.empty')}</p>
        ) : (
          <div className="adapter-grid">
            {adapters.map((adapter) => (
              <article className="adapter-row" key={adapter.id}>
                <div>
                  <strong>{adapter.displayName}</strong>
                  <span>{adapter.capabilities.join(', ')}</span>
                </div>
                <span className={`status-pill status-${adapter.status}`}>
                  {t(INTEGRATION_STATUS_KEY[adapter.status])}
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
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
          <p className="settings-desc">…</p>
        ) : statusQuery.error || !statusQuery.data ? (
          <p className="form-hint form-hint--warn">
            {t('settings.about.unavailable')}
          </p>
        ) : (
          <dl className="kb-meta">
            <AboutRow
              label={t('settings.about.service')}
              value={statusQuery.data.service}
            />
            <AboutRow
              label={t('settings.about.version')}
              value={statusQuery.data.version}
              mono
            />
            <AboutRow
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

function AboutRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="kb-meta__row">
      <dt>{label}</dt>
      <dd className={mono ? 'kb-mono' : undefined}>{value}</dd>
    </div>
  );
}
