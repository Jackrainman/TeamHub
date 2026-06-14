import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import type { DataSource } from '../../components/layout/ConsoleLayout';
import { useI18n } from '../../i18n';

// 设置页：收纳此前散落各处的运行时设置——数据源 / 语言 / 后端地址 / 关于。
// 数据源、语言复用 App / i18n 的同一份状态（无本地副本，故无同步问题）。
const APIBASE_KEY = 'teamhub.apiBase';

function segClass(active: boolean): string {
  return active ? 'seg__btn seg__btn--active' : 'seg__btn';
}

export function SettingsPage({
  client,
  source,
  onChangeSource,
}: {
  client: HubApiClient;
  source: DataSource;
  onChangeSource: (next: DataSource) => void;
}) {
  const { t, lang, setLang } = useI18n();

  return (
    <div className="settings-page">
      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>{t('settings.section.dataSource')}</h2>
        </div>
        <div className="settings-section">
          <p className="settings-desc">{t('settings.dataSource.desc')}</p>
          <div
            className="seg"
            role="group"
            aria-label={t('settings.section.dataSource')}
          >
            <button
              type="button"
              className={segClass(source === 'real')}
              onClick={() => onChangeSource('real')}
            >
              {t('settings.dataSource.real')}
            </button>
            <button
              type="button"
              className={segClass(source === 'mock')}
              onClick={() => onChangeSource('mock')}
            >
              {t('settings.dataSource.mock')}
            </button>
          </div>
        </div>
      </section>

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

      <ApiBaseSection source={source} />
      <AboutSection client={client} source={source} />
    </div>
  );
}

// 后端地址：localStorage 覆盖 VITE_API_BASE。改动后 reload 让 client 按新 base 重建。
function ApiBaseSection({ source }: { source: DataSource }) {
  const { t } = useI18n();
  const stored = window.localStorage.getItem(APIBASE_KEY) ?? '';
  const [value, setValue] = useState(stored);
  const isMock = source === 'mock';
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
        {isMock ? (
          <p className="form-hint form-hint--warn">{t('settings.apiBase.mockNote')}</p>
        ) : null}
        <label className="kb-field">
          <span>{t('settings.apiBase.label')}</span>
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('settings.apiBase.placeholder')}
            disabled={isMock}
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
            disabled={isMock || value.trim() === stored.trim()}
          >
            {t('settings.apiBase.apply')}
          </button>
          <button
            type="button"
            className="settings-btn"
            onClick={reset}
            disabled={isMock || stored.trim() === ''}
          >
            {t('settings.apiBase.reset')}
          </button>
        </div>
      </div>
    </section>
  );
}

// 关于：service · version · 服务端模式取 /api/system/status；数据源回显 client.mode。
function AboutSection({
  client,
  source,
}: {
  client: HubApiClient;
  source: DataSource;
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
            <AboutRow
              label={t('settings.section.dataSource')}
              value={client.mode}
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
