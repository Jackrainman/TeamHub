import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import type { AgentBackend, BotChannel, Season } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n, type TranslationKey } from '../../i18n';
import { useTheme } from '../../theme';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { MetaRow } from '../../components/MetaRow';
import { SegToggle } from '../../components/SegToggle';
import { APIBASE_KEY, WRITE_TOKEN_KEY } from '../../constants';
import { humanizeFormError } from '../../utils';

// 设置页：收纳此前散落各处的运行时设置——语言 / 集成 / 后端地址 / 关于。
// 语言复用 i18n 的同一份状态（无本地副本，故无同步问题）。单一真实后端，无数据源切换。

// Agent 后端 / 数据源共用生命周期状态枚举 → 文案键（枚举变更会在此处编译报错）。
const LIFECYCLE_STATUS_KEY: Record<AgentBackend['status'], TranslationKey> = {
  enabled: 'enum.adapter.enabled',
  disabled: 'enum.adapter.disabled',
  degraded: 'enum.adapter.degraded',
  unconfigured: 'enum.adapter.unconfigured',
};

// BOT 渠道用连接型状态枚举（独立文案）。
const BOT_CHANNEL_STATUS_KEY: Record<BotChannel['status'], TranslationKey> = {
  connected: 'enum.botChannel.connected',
  disconnected: 'enum.botChannel.disconnected',
  unconfigured: 'enum.botChannel.unconfigured',
};

// tone 映射（design-language.md §3）：未配置=中性基色（非活跃信号），空串即 .badge 默认灰。
const BOT_CHANNEL_PILL_CLASS: Record<BotChannel['status'], string> = {
  connected: 'badge--green',
  disconnected: 'badge--red',
  unconfigured: '',
};

// Agent 后端 / 数据源生命周期状态 → tone（原 `status-${status}` 字符串拼接类）。
const LIFECYCLE_PILL_CLASS: Record<AgentBackend['status'], string> = {
  enabled: 'badge--green',
  degraded: 'badge--amber',
  disabled: 'badge--red',
  unconfigured: '',
};

// 语言选项——扩展时须同步 i18n 键（settings.language.<value>）与 Lang 类型。
const LANG_OPTIONS = [
  { value: 'zh' as const, labelKey: 'settings.language.zh' as const },
  { value: 'en' as const, labelKey: 'settings.language.en' as const },
];

// 主题选项——扩展时须同步 i18n 键（settings.theme.<value>）与 Theme 类型。
const THEME_OPTIONS = [
  { value: 'tech' as const, labelKey: 'settings.theme.tech' as const },
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

      <SeasonsSection client={client} source={source} />
      <IntegrationsSection client={client} source={source} />
      <ConnectionSection />
      <AboutSection client={client} source={source} />
    </div>
  );
}

// 赛季（SEASON-CREATE 补链路）：总览页空态文案"先在设置里建一个赛季"此前指向不存在的入口，
// 本分区兑现它——列现有赛季 + 新建表单。新建 = 宣告新的当前赛季（status 服务端钉 active、
// 旧 active 同笔归档，一届一个当前赛季）；queryKey 与总览 BaselineOverview 共享（['seasons', source]），
// 新建成功后 invalidate，总览首屏立即切到新赛季。
function SeasonsSection({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const seasonsQuery = useQuery({
    queryKey: ['seasons', source],
    queryFn: () => client.getSeasons(),
  });

  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      client.createSeason({
        name: name.trim(),
        startsAt: `${startsAt}T00:00:00.000Z`,
        endsAt: endsAt ? `${endsAt}T00:00:00.000Z` : null,
      }),
    onSuccess: () => {
      setName('');
      setStartsAt('');
      setEndsAt('');
      void queryClient.invalidateQueries({ queryKey: ['seasons', source] });
    },
  });

  // 结束日期可留空（开季时常未知）；填了则须晚于开始日期（与 server 同判据，前端先挡一层）。
  const orderOk = !startsAt || !endsAt || endsAt > startsAt;
  const valid = Boolean(name.trim() && startsAt && orderOk);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    mutation.mutate();
  }

  const seasons = seasonsQuery.data?.seasons ?? [];

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.seasons')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.seasons.desc')}</p>
        {seasonsQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : seasons.length === 0 ? (
          <p className="settings-desc">{t('settings.seasons.empty')}</p>
        ) : (
          <div className="adapter-grid">
            {seasons.map((season) => (
              <SeasonRow key={season.id} season={season} />
            ))}
          </div>
        )}
        <form className="pm-form" onSubmit={submit}>
          <FormGrid cols={3}>
            <Field label={t('settings.seasons.field.name')} required>
              <input
                value={name}
                placeholder={t('settings.seasons.field.namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
                aria-required
              />
            </Field>
            <Field label={t('settings.seasons.field.startsAt')} required>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                aria-required
              />
            </Field>
            <Field
              label={t('settings.seasons.field.endsAt')}
              error={!orderOk ? t('settings.seasons.dateOrder') : undefined}
            >
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </Field>
          </FormGrid>
          <FormActions
            submitLabel={t('settings.seasons.submit')}
            submittingLabel={t('settings.seasons.submitting')}
            submitting={mutation.isPending}
            disabled={!valid}
            error={
              mutation.error
                ? humanizeFormError(mutation.error, t, 'settings.seasons.error')
                : null
            }
            success={
              mutation.isSuccess
                ? t('settings.seasons.success', { name: mutation.data.season.name })
                : null
            }
          />
        </form>
      </div>
    </section>
  );
}

function SeasonRow({ season }: { season: Season }) {
  const { t } = useI18n();
  const range = `${season.startsAt.slice(0, 10)} → ${season.endsAt ? season.endsAt.slice(0, 10) : '…'}`;
  return (
    <article className="adapter-row">
      <div>
        <strong>{season.name}</strong>
        <span>{range}</span>
      </div>
      {/* 已归档=中性灰（U3：非错误态不用红）；进行中=绿。 */}
      <span
        className={`badge badge--wide${season.status === 'active' ? ' badge--green' : ''}`}
      >
        {t(
          season.status === 'active'
            ? 'settings.seasons.status.active'
            : 'settings.seasons.status.archived',
        )}
      </span>
    </article>
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
    if (!window.confirm(t('settings.connection.reloadConfirm'))) return;
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
  const [tokenVisible, setTokenVisible] = useState(false);

  function applyToken(event: FormEvent) {
    event.preventDefault();
    if (tokenValue.trim() === storedToken.trim()) return;
    if (!window.confirm(t('settings.connection.reloadConfirm'))) return;
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
              className="btn btn--primary"
              disabled={baseValue.trim() === storedBase.trim()}
            >
              {t('settings.apiBase.apply')}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
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
            <span className="settings-token-row">
              <input
                type={tokenVisible ? 'text' : 'password'}
                value={tokenValue}
                onChange={(event) => setTokenValue(event.target.value)}
                placeholder={t('settings.writeToken.placeholder')}
                autoComplete="off"
              />
              <button
                type="button"
                className="today-plan-table__rowBtn"
                onClick={() => setTokenVisible((v) => !v)}
                aria-label={
                  tokenVisible ? t('settings.writeToken.hide') : t('settings.writeToken.show')
                }
                title={
                  tokenVisible ? t('settings.writeToken.hide') : t('settings.writeToken.show')
                }
              >
                {tokenVisible ? (
                  <EyeOff size={14} aria-hidden="true" />
                ) : (
                  <Eye size={14} aria-hidden="true" />
                )}
              </button>
            </span>
          </label>
          <p className="settings-current">
            {tokenValue.trim()
              ? t('settings.writeToken.set')
              : t('settings.writeToken.unset')}
          </p>
          <div className="settings-actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={tokenValue.trim() === storedToken.trim()}
            >
              {t('settings.writeToken.apply')}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
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
