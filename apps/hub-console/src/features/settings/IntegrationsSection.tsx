import { useState, type FormEvent } from 'react';
import type { BotChannel } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { OverviewView } from '../../console-pages';
import { useI18n } from '../../i18n';
import { Field } from '../../components/Field';
import { FormGrid } from '../../components/FormGrid';
import { MetaRow } from '../../components/MetaRow';
import {
  BOT_CHANNEL_PILL_CLASS,
  BOT_CHANNEL_STATUS_KEY,
  LIFECYCLE_PILL_CLASS,
  LIFECYCLE_STATUS_KEY,
  type IntegrationRow,
} from './settings-constants';
import { useLarkConfig } from './sub/useSettingsQueries';
import { useLarkMutations } from './sub/useSettingsMutations';

// 集成（只读）：地基重建后按物种三分——BOT 渠道（飞书/微信/QQ）/ Agent 后端（Hermes/OpenClaw/
// Claude Code）/ 数据源（Git/图纸库）。复用 App 已取的总览（overview 透传，同份缓存），展示在设置页。
export function IntegrationsSection({
  overview,
}: {
  overview: OverviewView;
}) {
  const { t } = useI18n();
  const { isLoading, error, data } = overview;

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.integrations')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.integrations.desc')}</p>
        {isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : error || !data ? (
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
                  pillClass: LIFECYCLE_PILL_CLASS[backend.status],
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
                  pillClass: LIFECYCLE_PILL_CLASS[ds.status],
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
              <span className={`badge badge--wide ${row.pillClass}`.trim()}>
                {row.statusLabel}
              </span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function LarkIntegrationSection({ client }: { client: HubApiClient }) {
  const { t } = useI18n();
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [chatId, setChatId] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const configQuery = useLarkConfig(client);

  const { saveMutation, resetMutation } = useLarkMutations(client, {
    appId,
    appSecret,
    chatId,
    onSaveSuccess: (res) => {
      setFeedback(res.ok
        ? { ok: true, msg: t('settings.integrations.lark.saved') }
        : { ok: false, msg: res.error ?? t('settings.integrations.lark.error') });
    },
    onSaveError: (err: Error) => setFeedback({ ok: false, msg: err.message }),
    onResetSuccess: () => {
      setFeedback(null);
      setAppId(''); setAppSecret(''); setChatId('');
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    saveMutation.mutate();
  }

  function handleReset() {
    if (!window.confirm(t('settings.integrations.lark.resetConfirm'))) return;
    resetMutation.mutate();
  }

  const config = configQuery.data;
  const statusLabel = config
    ? config.status === 'connected'
      ? t('settings.integrations.lark.connected')
      : config.status === 'error'
        ? t('settings.integrations.lark.error')
        : t('settings.integrations.lark.unconfigured')
    : t('settings.integrations.lark.unconfigured');
  const pillClass = config?.status === 'connected'
    ? 'badge--green'
    : config?.status === 'error'
      ? 'badge--red'
      : 'badge--amber';

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.integrations.lark.title')}</h2>
        <span className={`badge badge--wide ${pillClass}`}>{statusLabel}</span>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.integrations.lark.desc')}</p>
        {config?.configured && (
          <MetaRow label={t('settings.integrations.lark.appId')} value={config.appId ?? ''} />
        )}
        {config?.configured && config.appSecretMasked && (
          <MetaRow label={t('settings.integrations.lark.appSecret')} value={config.appSecretMasked} />
        )}
        {config?.configured && (
          <MetaRow label={t('settings.integrations.lark.chatId')} value={config.chatId ?? ''} />
        )}
        {config?.error && (
          <p className="form-hint form-hint--warn">{config.error}</p>
        )}
        <form onSubmit={handleSubmit}>
          <FormGrid>
            <Field label={t('settings.integrations.lark.appId')}>
              <input
                className="input"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder={config?.appId ?? 'cli_xxxx'}
                required
              />
            </Field>
            <Field label={t('settings.integrations.lark.appSecret')}>
              <input
                className="input"
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>
            <Field label={t('settings.integrations.lark.chatId')}>
              <input
                className="input"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder={config?.chatId ?? 'oc_xxxx'}
                required
              />
            </Field>
          </FormGrid>
          <p className="form-hint">{t('settings.integrations.lark.hint')}</p>
          {feedback && (
            <p className={`form-hint ${feedback.ok ? 'form-hint--ok' : 'form-hint--warn'}`}>
              {feedback.msg}
            </p>
          )}
          <div className="pm-form__footer">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending
                ? t('settings.integrations.lark.saving')
                : t('settings.integrations.lark.save')}
            </button>
            {config?.configured && (
              <button
                className="btn btn--danger"
                type="button"
                onClick={handleReset}
                disabled={resetMutation.isPending}
              >
                {t('settings.integrations.lark.reset')}
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
