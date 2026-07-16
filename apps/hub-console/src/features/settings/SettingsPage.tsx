import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import type {
  AgentBackend,
  BotChannel,
  MemberGrade,
  MemberRole,
  Season,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n, type TranslationKey } from '../../i18n';
import { useTheme } from '../../theme';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { MetaRow } from '../../components/MetaRow';
import { SegToggle } from '../../components/SegToggle';
import { Select } from '../../components/Select';
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

// 成员年级枚举 → 文案键（枚举变更会在此处编译报错）。验收人名单说明「豁免权属大三」，年级作辅助元信息。
const GRADE_KEY: Record<MemberGrade, TranslationKey> = {
  freshman: 'settings.reviewers.grade.freshman',
  sophomore: 'settings.reviewers.grade.sophomore',
  junior: 'settings.reviewers.grade.junior',
  senior: 'settings.reviewers.grade.senior',
  graduate: 'settings.reviewers.grade.graduate',
};

// 成员角色枚举 → 文案键（K1 权限地基；枚举变更会在此处编译报错）。三档下拉选项顺序钉高→低。
const ROLE_KEY: Record<MemberRole, TranslationKey> = {
  superAdmin: 'settings.members.role.superAdmin',
  groupAdmin: 'settings.members.role.groupAdmin',
  member: 'settings.members.role.member',
};
const MEMBER_ROLE_OPTIONS: readonly MemberRole[] = ['superAdmin', 'groupAdmin', 'member'];

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

// 数据域标识 → 人话标签键（K3 部署信息）。deployment.storage 的 domain 是稳定机器键
// （gov/kb/inv/baseline/checklist），此处映射到 i18n；未知域回落显示原始 domain 串。
const DEPLOY_DOMAIN_KEY: Record<string, TranslationKey> = {
  gov: 'settings.deployment.domain.gov',
  kb: 'settings.deployment.domain.kb',
  inv: 'settings.deployment.domain.inv',
  baseline: 'settings.deployment.domain.baseline',
  checklist: 'settings.deployment.domain.checklist',
};

// 落盘后端 → 徽章文案键（K3）。file/sqlite = 落盘（绿）；memory = 内存（琥珀警示）。
const DEPLOY_BACKEND_KEY: Record<'file' | 'sqlite' | 'memory', TranslationKey> = {
  file: 'settings.deployment.backend.file',
  sqlite: 'settings.deployment.backend.sqlite',
  memory: 'settings.deployment.backend.memory',
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
  identity,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className="settings-page">
      <IdentitySection identity={identity} />

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

      <SeasonsSection client={client} source={source} identity={identity} />
      <MembersPermissionsSection client={client} source={source} identity={identity} />
      <IntegrationsSection client={client} source={source} />
      <ConnectionSection />
      <DeploymentSection client={client} source={source} />
      <AboutSection client={client} source={source} />
    </div>
  );
}

// 身份（K2 身份体验刀）：只读展示这台服务器当前的登录模式——匿名模式（缺省）附「怎么启用登录」说明；
// 登录模式显示登录状态 + 「重启后需重登」提示。数据吃 App 已装配好的 identity 槽（GET /api/session），
// 本分区不发任何写请求（改模式只能改服务器启动环境变量，不在界面里）。
function IdentitySection({ identity }: { identity: PageIdentityCtx }) {
  const { t } = useI18n();
  const isIdentityMode = identity.mode === 'identity';
  const session = identity.session;

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.identity')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.identity.desc')}</p>
        <p>
          <span className={`badge badge--wide${isIdentityMode ? ' badge--green' : ''}`}>
            {t(
              isIdentityMode
                ? 'settings.identity.mode.identity'
                : 'settings.identity.mode.anonymous',
            )}
          </span>
        </p>
        {identity.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : isIdentityMode ? (
          <>
            <p className="settings-desc">
              {session
                ? t('settings.identity.identity.loggedIn', {
                    name: session.displayName,
                    role: t(ROLE_KEY[session.role]),
                  })
                : t('settings.identity.identity.loggedOut')}
            </p>
            <p className="settings-desc">{t('settings.identity.identity.restartNote')}</p>
          </>
        ) : (
          <>
            <p className="settings-desc">{t('settings.identity.anon.body')}</p>
            <p className="settings-current">
              <code>TEAMHUB_IDENTITY_MODE=identity</code>
            </p>
          </>
        )}
      </div>
    </section>
  );
}

// 赛季（SEASON-CREATE 补链路）：总览页空态文案"先在设置里建一个赛季"此前指向不存在的入口，
// 本分区兑现它——列现有赛季 + 新建表单。新建 = 宣告新的当前赛季（status 服务端钉 active、
// 旧 active 同笔归档，一届一个当前赛季）；queryKey 与总览 BaselineOverview 共享（['seasons', source]），
// 新建成功后 invalidate，总览首屏立即切到新赛季。
function SeasonsSection({
  client,
  source,
  identity,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  // 身份模式未登录 = 写门锁（匿名模式 canWrite 恒 true，writeLocked 恒 false，现状不变）。照 PoolPage 先例。
  const writeLocked = !identity.canWrite;
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
  const valid = Boolean(name.trim() && startsAt && orderOk) && !writeLocked;

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
        {writeLocked ? (
          <p className="task-detail__hint">{t('identity.writeHint')}</p>
        ) : null}
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

// 成员与权限（K1 权限地基 + GATE-CHECKLIST-IOU，D-087 拍板②）：一张名单表——每个成员一行，含角色三档
// 下拉（PUT /api/members/:id/role）+ 验收人开关（PUT /api/members/:id/gate-reviewer，豁免权属名单内成员=大三，
// 每年换届更新）。身份模式且名册无 superAdmin 时，顶部显示「初始化管理员」引导卡（调 setup 路由）。
// **绝不做任何按人统计**（红线 I0：本域无按人聚合/排行）；名单只决定「谁是管理员 / 谁能签字豁免」，非考勤非画像。
function MembersPermissionsSection({
  client,
  source,
  identity,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  // 身份模式未登录 = 写门锁；匿名模式恒可写（现状不变）。照 PoolPage 先例（识别层 canWrite）。
  const writeLocked = !identity.canWrite;
  const membersQuery = useQuery({
    queryKey: ['members', 'settings-members', source],
    queryFn: () => client.getMembers(),
  });
  const groupsQuery = useQuery({
    queryKey: ['groups', source],
    queryFn: () => client.getGroups(),
  });

  const invalidateMembers = () =>
    // 前缀失效所有成员查询（本表 + 门检查单卡的匿名选人候选 + 其它页），名单改动处处同步。
    void queryClient.invalidateQueries({ queryKey: ['members'] });

  const roleMutation = useMutation({
    mutationFn: (vars: { id: string; role: MemberRole }) =>
      client.setMemberRole(vars.id, { role: vars.role }),
    onSuccess: invalidateMembers,
  });
  const reviewerMutation = useMutation({
    mutationFn: (vars: { id: string; gateReviewer: boolean }) =>
      client.setMemberGateReviewer(vars.id, { gateReviewer: vars.gateReviewer }),
    onSuccess: invalidateMembers,
  });

  const members = membersQuery.data?.members ?? [];
  const groups = groupsQuery.data?.groups ?? [];
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id;
  const hasSuperAdmin = members.some((m) => m.role === 'superAdmin');
  // 引导卡：仅身份模式 + 名册确已加载且无任何 superAdmin 时显示（匿名模式无身份概念、有管理员后自动消失）。
  const showSetup = identity.mode === 'identity' && !membersQuery.isLoading && !hasSuperAdmin;

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.members')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.members.desc')}</p>
        {writeLocked ? (
          <p className="task-detail__hint">{t('identity.writeHint')}</p>
        ) : null}
        {showSetup ? (
          <SetupAdminCard client={client} writeLocked={writeLocked} onDone={invalidateMembers} />
        ) : null}
        {membersQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : members.length === 0 ? (
          <p className="settings-desc">{t('settings.members.empty')}</p>
        ) : (
          <div className="adapter-grid">
            {members.map((member) => (
              <article className="adapter-row" key={member.id}>
                <div>
                  <strong>{member.displayName}</strong>
                  <span>
                    {t(GRADE_KEY[member.grade])} · {groupName(member.groupId)}
                  </span>
                </div>
                <div className="settings-member__controls">
                  <Select
                    value={member.role}
                    onChange={(role) => roleMutation.mutate({ id: member.id, role })}
                    options={MEMBER_ROLE_OPTIONS}
                    renderOption={(r) => t(ROLE_KEY[r])}
                    ariaLabel={t('settings.members.role.label')}
                    disabled={
                      writeLocked ||
                      (roleMutation.isPending && roleMutation.variables?.id === member.id)
                    }
                  />
                  <label className="pm-check">
                    <input
                      type="checkbox"
                      checked={Boolean(member.gateReviewer)}
                      disabled={
                        writeLocked ||
                        (reviewerMutation.isPending &&
                          reviewerMutation.variables?.id === member.id)
                      }
                      onChange={(e) =>
                        reviewerMutation.mutate({
                          id: member.id,
                          gateReviewer: e.target.checked,
                        })
                      }
                    />
                    <span>{t('settings.reviewers.toggle')}</span>
                  </label>
                </div>
              </article>
            ))}
          </div>
        )}
        {roleMutation.error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(roleMutation.error, t, 'settings.members.role.error')}
          </p>
        ) : null}
        {reviewerMutation.error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(reviewerMutation.error, t, 'settings.reviewers.error')}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// 初始化首个管理员引导卡（K1 权限地基）：身份模式且名册无 superAdmin 时显示——填 PIN → POST /api/setup/super-admin
// 把登录本人升 superAdmin + 同笔设 pinHash。须先登录（写门锁时禁用提交、复用 identity.writeHint 说明）。
// 成功后 onDone 刷新名册（有管理员后本卡自动消失）。
function SetupAdminCard({
  client,
  writeLocked,
  onDone,
}: {
  client: HubApiClient;
  writeLocked: boolean;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const mutation = useMutation({
    mutationFn: () => client.setupSuperAdmin({ pin }),
    onSuccess: () => {
      setPin('');
      onDone();
    },
  });
  // PIN 家庭影院级最低 4 位（与 server SetupSuperAdminRequestSchema.min(4) 同判据，前端先挡一层）。
  const valid = pin.trim().length >= 4 && !writeLocked;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    mutation.mutate();
  }

  return (
    <form className="setup-admin-card" onSubmit={submit}>
      <div>
        <strong>{t('settings.members.setup.title')}</strong>
        <p className="settings-desc">{t('settings.members.setup.desc')}</p>
      </div>
      <Field label={t('settings.members.setup.pinLabel')} required>
        <input
          type="password"
          value={pin}
          placeholder={t('settings.members.setup.pinPlaceholder')}
          onChange={(e) => setPin(e.target.value)}
          autoComplete="new-password"
          aria-required
        />
      </Field>
      <FormActions
        submitLabel={t('settings.members.setup.submit')}
        submittingLabel={t('settings.members.setup.submitting')}
        submitting={mutation.isPending}
        disabled={!valid}
        error={
          mutation.error
            ? humanizeFormError(mutation.error, t, 'settings.members.setup.error')
            : null
        }
        success={mutation.isSuccess ? t('settings.members.setup.success') : null}
      />
    </form>
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

// 部署信息（K3 部署信息刀）：只读展示这台服务器真实怎么跑的——五个数据域各走落盘 / 内存（内存态醒目
// 警示「重启即丢」）、登录模式、启用模块、构建标识、运行时长（人话化）、图纸上传是否可用。数据取
// /api/system/status 的 deployment 字段（与「关于」共享同一 query 缓存）；旧后端不回该字段 → 显示不可用兜底。
// **改这些只能改服务器启动环境变量，界面不提供开关**（同身份分区纪律）。I0：本分区无任何按人维度。
function DeploymentSection({
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
  const deployment = statusQuery.data?.deployment;

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.deployment')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.deployment.desc')}</p>
        {statusQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : statusQuery.error || !statusQuery.data ? (
          <p className="form-hint form-hint--warn">{t('settings.about.unavailable')}</p>
        ) : !deployment ? (
          <p className="form-hint form-hint--warn">{t('settings.deployment.unavailable')}</p>
        ) : (
          <>
            {/* 五域落盘 / 内存逐行：内存态用琥珀警示徽章 + 「重启即丢」文案，落盘态显示路径（mono）。 */}
            <h3 className="integration-group__title">
              {t('settings.deployment.storage.title')}
            </h3>
            <div className="adapter-grid">
              {deployment.storage.map((entry) => {
                const domainKey = DEPLOY_DOMAIN_KEY[entry.domain];
                const domainLabel = domainKey ? t(domainKey) : entry.domain;
                const isMemory = entry.backend === 'memory';
                return (
                  <article className="adapter-row" key={entry.domain}>
                    <div>
                      <strong>{domainLabel}</strong>
                      {isMemory ? (
                        <span>{t('settings.deployment.memory.warn')}</span>
                      ) : entry.path ? (
                        <span className="kb-mono">{entry.path}</span>
                      ) : null}
                    </div>
                    <span
                      className={`badge badge--wide${isMemory ? ' badge--amber' : ' badge--green'}`}
                    >
                      {t(DEPLOY_BACKEND_KEY[entry.backend])}
                    </span>
                  </article>
                );
              })}
            </div>
            <dl className="kb-meta">
              <MetaRow
                label={t('settings.deployment.identityMode')}
                value={t(
                  deployment.identityMode === 'identity'
                    ? 'settings.identity.mode.identity'
                    : 'settings.identity.mode.anonymous',
                )}
              />
              <MetaRow
                label={t('settings.deployment.modules')}
                value={deployment.enabledModules.join(' · ')}
                mono
              />
              <MetaRow
                label={t('settings.deployment.buildId')}
                value={deployment.buildId}
                mono
              />
              <MetaRow
                label={t('settings.deployment.uptime')}
                value={humanizeUptime(statusQuery.data.uptimeSeconds, t)}
              />
              <MetaRow
                label={t('settings.deployment.artifactUpload')}
                value={t(
                  deployment.artifactUploadEnabled
                    ? 'settings.deployment.artifactUpload.enabled'
                    : 'settings.deployment.artifactUpload.disabled',
                )}
              />
            </dl>
          </>
        )}
      </div>
    </section>
  );
}

// 运行时长人话化（K3）：秒 → 「X 天 X 小时」/「X 小时 X 分」/「X 分钟」。单位随语言（i18n 键）。
function humanizeUptime(
  totalSeconds: number,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return t('settings.deployment.uptime.days', { d: days, h: hours });
  if (hours > 0) return t('settings.deployment.uptime.hours', { h: hours, m: mins });
  return t('settings.deployment.uptime.mins', { m: mins });
}

// 关于：service · version 取 /api/system/status（部署运维事实已上移「部署信息」分区，此处只留身份标识）。
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
          </dl>
        )}
      </div>
    </section>
  );
}
