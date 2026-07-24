import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import type {
  AgentBackend,
  BotChannel,
  ConfigIdentityMode,
  Group,
  MemberGrade,
  MemberPublic,
  MemberRole,
  RosterImportReport,
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
import { GroupLeadConfirm } from './GroupLeadConfirm';
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

// 成员角色枚举 → 文案键（K1 权限地基 + MEMBER-PM-FLAG 刀②b 收窄两档；枚举变更会在此处编译报错）。
// 项目管理权限不走本下拉——每行另有「项目管理」开关（PUT project-manager）。
const ROLE_KEY: Record<MemberRole, TranslationKey> = {
  groupAdmin: 'settings.members.role.groupAdmin',
  member: 'settings.members.role.member',
};
const MEMBER_ROLE_OPTIONS: readonly MemberRole[] = ['groupAdmin', 'member'];

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

// 分区写权限判定（K8 复审留档 nit 收口 + MEMBER-PM-FLAG 刀②b）：区分「未登录」与「身份模式已登录但未持
// 项目管理旗标」两种锁态，各给对应说明（照 K2 前置资格判先例——写控件禁用 + 说明，不隐藏、保可发现性）。
// 匿名模式恒不锁（现状不变）。旗标吃会话快照（登录当刻定格），服务端敏感门另读实时名册。
function sectionPermission(
  identity: PageIdentityCtx,
  t: (key: TranslationKey) => string,
): { writeLocked: boolean; adminLocked: boolean; lockHint: string | null } {
  const loggedOutLocked = !identity.canWrite;
  const adminLocked =
    identity.mode === 'identity' &&
    !!identity.session &&
    identity.session.projectManager !== true;
  const writeLocked = loggedOutLocked || adminLocked;
  const lockHint = loggedOutLocked
    ? t('identity.writeHint')
    : adminLocked
      ? t('settings.permission.adminOnly')
      : null;
  return { writeLocked, adminLocked, lockHint };
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
      <DeploymentConfigSection client={client} source={source} identity={identity} />
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
          // SETUP-WIZARD 刀③：切换登录方式的入口已从「启动 env」改为下方「部署配置」写区（改完自动重启
          // 生效），此处只留一句指路，不再展示已退役的模式类 env。
          <p className="settings-desc">{t('settings.identity.anon.body')}</p>
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
  // 写门锁（照 PoolPage 先例）+ 管理员前置资格判（复审留档 nit 收口，照 K2 前置资格判先例）：
  // 未登录 = loggedOutLocked；身份模式已登录但非 superAdmin = adminLocked（此前只判「是否登录」、漏了
  // 「是否管理员」，导致非管理员点了才撞服务端 403）。两者任一 → 写控件禁用 + 说明。
  const { writeLocked, lockHint } = sectionPermission(identity, t);
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
        {lockHint ? <p className="task-detail__hint">{lockHint}</p> : null}
        <form className="pm-form" onSubmit={submit} title={lockHint ?? undefined}>
          <FormGrid cols={3}>
            <Field label={t('settings.seasons.field.name')} required>
              <input
                value={name}
                placeholder={t('settings.seasons.field.namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
                disabled={writeLocked}
                aria-required
              />
            </Field>
            <Field label={t('settings.seasons.field.startsAt')} required>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                disabled={writeLocked}
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
                disabled={writeLocked}
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

// 成员与权限（K1 权限地基 + GATE-CHECKLIST-IOU，D-087 拍板② + MEMBER-PM-FLAG 刀②b）：一张名单表——
// 每个成员一行，含角色两档下拉（PUT /api/members/:id/role，组织身份）+ 项目管理开关
// （PUT /api/members/:id/project-manager，原 superAdmin 的正交旗标）+ 验收人开关
// （PUT /api/members/:id/gate-reviewer，豁免权属名单内成员=大三，每年换届更新）。身份模式且名册无持旗成员时，
// 顶部显示「初始化管理员」引导卡（调 setup 路由）。
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
  // 写门锁 + 管理员前置资格判（复审留档 nit 收口，照 K2 前置资格判先例）：未登录 或 身份模式已登录但非
  // superAdmin → 写控件禁用 + 说明（此前只判「是否登录」、漏了「是否管理员」，非管理员点了才撞 403）。
  const { writeLocked, lockHint } = sectionPermission(identity, t);
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
  // 名册导入还会自动建组，故连同 groups 一并失效（下拉/组名映射同步）。
  const invalidateRoster = () => {
    invalidateMembers();
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
  };

  const roleMutation = useMutation({
    mutationFn: (vars: { id: string; role: MemberRole }) =>
      client.setMemberRole(vars.id, { role: vars.role }),
    onSuccess: invalidateMembers,
  });
  // 项目管理旗标授 / 收（MEMBER-PM-FLAG 刀②b）：与 role 正交——队长兼组长 = groupAdmin + 旗标。
  const pmMutation = useMutation({
    mutationFn: (vars: { id: string; projectManager: boolean }) =>
      client.setMemberProjectManager(vars.id, { projectManager: vars.projectManager }),
    onSuccess: invalidateMembers,
  });
  const reviewerMutation = useMutation({
    mutationFn: (vars: { id: string; gateReviewer: boolean }) =>
      client.setMemberGateReviewer(vars.id, { gateReviewer: vars.gateReviewer }),
    onSuccess: invalidateMembers,
  });
  // 重置 PIN（公测余项⑦）：superAdmin 清目标 pinHash → 该成员回免 PIN 态、下次登录自行重设。
  // 仅身份模式渲染（匿名模式端点 404、无身份概念）；二次确认防误点（重置后旧 PIN 立即失效）。
  const clearPinMutation = useMutation({
    mutationFn: (vars: { id: string }) => client.clearMemberPin(vars.id),
    onSuccess: invalidateMembers,
  });

  const members = membersQuery.data?.members ?? [];
  const groups = groupsQuery.data?.groups ?? [];
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id;
  const hasPm = members.some((m) => m.projectManager === true);
  // 名册是否为空（确已加载才判——加载中不当空板，避免闪现「首次可直接上传」）。空板 = 导入引导豁免态。
  const emptyRoster = !membersQuery.isLoading && members.length === 0;
  // 引导卡：仅身份模式 + 名册确已加载且无任何持旗成员时显示（匿名模式无身份概念、有管理员后自动消失）。
  const showSetup = identity.mode === 'identity' && !membersQuery.isLoading && !hasPm;

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.members')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.members.desc')}</p>
        {/* 名册导入块（K8）：模板下载 + 上传 CSV + 导入报告。空板豁免——名册为空时上传免锁。 */}
        <RosterImportBlock
          client={client}
          emptyRoster={emptyRoster}
          sectionWriteLocked={writeLocked}
          lockHint={lockHint}
          members={members}
          groups={groups}
          onImported={invalidateRoster}
        />
        {lockHint ? <p className="task-detail__hint">{lockHint}</p> : null}
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
                <div
                  className="settings-member__controls"
                  title={writeLocked ? (lockHint ?? undefined) : undefined}
                >
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
                      checked={member.projectManager === true}
                      disabled={
                        writeLocked ||
                        (pmMutation.isPending && pmMutation.variables?.id === member.id)
                      }
                      onChange={(e) =>
                        pmMutation.mutate({
                          id: member.id,
                          projectManager: e.target.checked,
                        })
                      }
                    />
                    <span>{t('settings.members.pm.toggle')}</span>
                  </label>
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
                  {identity.mode === 'identity' ? (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={
                        writeLocked ||
                        (clearPinMutation.isPending &&
                          clearPinMutation.variables?.id === member.id)
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            t('settings.members.resetPin.confirm', {
                              name: member.displayName,
                            }),
                          )
                        ) {
                          clearPinMutation.mutate({ id: member.id });
                        }
                      }}
                    >
                      {t('settings.members.resetPin')}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
        {clearPinMutation.isSuccess ? (
          <p className="form-hint">{t('settings.members.resetPin.done')}</p>
        ) : null}
        {clearPinMutation.error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(clearPinMutation.error, t, 'settings.members.resetPin.error')}
          </p>
        ) : null}
        {roleMutation.error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(roleMutation.error, t, 'settings.members.role.error')}
          </p>
        ) : null}
        {pmMutation.error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(pmMutation.error, t, 'settings.members.pm.error')}
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

// 初始化首个管理员引导卡（K1 权限地基 + MEMBER-PM-FLAG 旗标化）：身份模式且名册无持旗成员时显示——
// 填 PIN → POST /api/setup/super-admin 给登录本人授项目管理旗标 + 同笔设 pinHash。须先登录（写门锁时禁用
// 提交、复用 identity.writeHint 说明）。成功后 onDone 刷新名册（有管理员后本卡自动消失）。
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

// 名册导入块（ROSTER-IMPORT，K8 + 刀③ 导入后确认组长）：下载 CSV 模板（直链 GET）+ 上传 CSV
// （multipart）+ 导入后渲染六段报告 + 确认组长块（GroupLeadConfirm——刀③ 起 CSV 不含组长列，
// 导入完成后逐组从该组成员选组长）。**空板豁免**：名册为空时上传免锁（解开身份模式空板死锁——
// 无人可选→无法登录→无法初始化管理员）；否则跟随分区权限（未登录 / 非管理员则禁用 + 说明）。
// 模板下载按钮恒可用（读端点无鉴权）。
function RosterImportBlock({
  client,
  emptyRoster,
  sectionWriteLocked,
  lockHint,
  members,
  groups,
  onImported,
}: {
  client: HubApiClient;
  emptyRoster: boolean;
  sectionWriteLocked: boolean;
  lockHint: string | null;
  members: readonly MemberPublic[];
  groups: readonly Group[];
  onImported: () => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 确认组长块按「本次导入」开合：再次导入重新出现（leadsDone 复位）。
  const [leadsDone, setLeadsDone] = useState(false);
  const mutation = useMutation({
    mutationFn: (file: File) => client.importRoster(file),
    onSuccess: () => {
      setLeadsDone(false);
      onImported();
    },
  });
  // 空板豁免：名册为空时上传免锁；否则跟随分区写权限（未登录 / 非管理员锁）。
  const uploadLocked = emptyRoster ? false : sectionWriteLocked;
  const report = mutation.data;

  return (
    <div className="roster-import">
      <div className="roster-import__head">
        <strong>{t('settings.roster.title')}</strong>
        <p className="settings-desc">{t('settings.roster.desc')}</p>
      </div>
      <div className="roster-import__actions">
        {/* 模板下载 = 直链 GET（浏览器原生下载，不走 fetch）。 */}
        <a className="btn btn--secondary btn--sm" href={client.rosterTemplateUrl()} download>
          {t('settings.roster.downloadTemplate')}
        </a>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadLocked || mutation.isPending}
          title={uploadLocked ? (lockHint ?? undefined) : undefined}
        >
          {mutation.isPending ? t('settings.roster.importing') : t('settings.roster.upload')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) mutation.mutate(file);
            e.target.value = ''; // 允许同名文件再次触发 change
          }}
        />
      </div>
      {emptyRoster ? (
        <p className="settings-desc">{t('settings.roster.firstHint')}</p>
      ) : null}
      {mutation.error ? (
        <p className="form-hint form-hint--warn">
          {humanizeFormError(mutation.error, t, 'settings.roster.error')}
        </p>
      ) : null}
      {report ? <RosterReportView report={report} /> : null}
      {/* 刀③：导入完成 → 确认各组组长（有成员的叶子组必选、默认建议现任组长 ?? 第一行成员，空组不出现）。 */}
      {report && !leadsDone ? (
        <GroupLeadConfirm
          client={client}
          members={members}
          groups={groups}
          onConfirmed={() => {
            setLeadsDone(true);
            onImported();
          }}
        />
      ) : null}
    </div>
  );
}

// 导入报告渲染（K8）：六段名单事实——failed（坏行=行号+原因，醒目告警底）+ created/updated/自动建组/
// 自动验收人/库里有但表里没有（绝不删）。全是回显给操作者本人的名单事实（I0 无聚合统计）。
function RosterReportView({ report }: { report: RosterImportReport }) {
  const { t } = useI18n();
  const segs: Array<{ key: string; labelKey: TranslationKey; names: readonly string[] }> = [
    { key: 'created', labelKey: 'settings.roster.report.created', names: report.created },
    { key: 'updated', labelKey: 'settings.roster.report.updated', names: report.updated },
    {
      key: 'createdGroups',
      labelKey: 'settings.roster.report.createdGroups',
      names: report.createdGroups,
    },
    {
      key: 'autoReviewers',
      labelKey: 'settings.roster.report.autoReviewers',
      names: report.autoReviewers,
    },
    {
      key: 'missingFromSheet',
      labelKey: 'settings.roster.report.missingFromSheet',
      names: report.missingFromSheet,
    },
  ];
  const anyContent = report.failed.length > 0 || segs.some((s) => s.names.length > 0);

  return (
    <div className="roster-report" role="status" aria-live="polite">
      <p className="roster-report__title">{t('settings.roster.report.title')}</p>
      {report.failed.length > 0 ? (
        <div className="roster-report__fail">
          <strong>
            {t('settings.roster.report.failed', { count: report.failed.length })}
          </strong>
          <ul>
            {report.failed.map((f, i) => (
              <li key={i}>
                {t('settings.roster.report.failedRow', { line: f.line, reason: f.reason })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {segs.map((s) =>
        s.names.length > 0 ? (
          <p className="roster-report__seg" key={s.key}>
            <span className="roster-report__label">{t(s.labelKey)}</span>
            <span>{s.names.join('、')}</span>
          </p>
        ) : null,
      )}
      {!anyContent ? (
        <p className="settings-desc">{t('settings.roster.report.empty')}</p>
      ) : null}
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

// ── 部署配置写区（SETUP-WIZARD 刀③，setup-wizard.md §6）───────────────────────────────────────
// 重启轮询节奏（同刀② 向导）：约定 exit 42 → start 脚本 / compose 拉起正常模式，重启约 10 秒，
// 45×1s 上限留足冗余。正常模式两态皆 initialized:true，故复活信号取「端口重新可达」——先等一段宽限
// （服务端延迟 ~500ms 退出，避免探到正要死的旧进程），再轮询 getSetupState 首次成功即复活。
const DEPLOY_POLL_INTERVAL_MS = 1000;
const DEPLOY_POLL_MAX_ATTEMPTS = 45;
const DEPLOY_RESTART_GRACE_MS = 1500;
const deploySleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function pollUntilRestarted(client: HubApiClient): Promise<void> {
  await deploySleep(DEPLOY_RESTART_GRACE_MS);
  for (let attempt = 0; attempt < DEPLOY_POLL_MAX_ATTEMPTS; attempt += 1) {
    try {
      await client.getSetupState();
      return; // 新进程已在服
    } catch {
      // 重启窗口内端口暂不可达，预期，继续轮询。
    }
    await deploySleep(DEPLOY_POLL_INTERVAL_MS);
  }
  throw new Error('restart-timeout');
}

// 部署配置写区：登录方式切换（匿名 ⇄ 身份）+「结束试驾，转正式」（仅 dataMode=demo 显示）。两动作都走
// 「确认弹窗 → 调写 API → 服务端 exit 42 自动重启 → 前端轮询复活 → 整页刷新」流（§6）。dataMode /
// identityMode 取 /api/system/status 的 deployment 字段（与「部署信息」/「关于」共享 query 缓存）。
// 鉴权镜像服务端：身份模式须 superAdmin（sectionPermission 的 adminLocked）、匿名模式恒可写（走写门）。
function DeploymentConfigSection({
  client,
  source,
  identity,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const { writeLocked, lockHint } = sectionPermission(identity, t);
  const statusQuery = useQuery({
    queryKey: ['system-status', source],
    queryFn: () => client.getSystemStatus(),
  });
  const deployment = statusQuery.data?.deployment;

  // applying = 提交后到整页刷新之间的过渡态（轮询重启复活）；error = config 多半已写但复活超时 / 真失败，
  // 统一给「重新加载」兜底（reload 后按新配置重判）。
  const [phase, setPhase] = useState<'idle' | 'applying' | 'error'>('idle');
  const [timedOut, setTimedOut] = useState(false);

  async function applyRestart(action: () => Promise<unknown>): Promise<void> {
    if (phase === 'applying') return;
    setTimedOut(false);
    setPhase('applying');
    try {
      await action();
      await pollUntilRestarted(client);
      window.location.reload();
    } catch (err) {
      setTimedOut(/restart-timeout/.test(String(err)));
      setPhase('error');
    }
  }

  function switchIdentity(next: ConfigIdentityMode): void {
    if (writeLocked || !deployment || next === deployment.identityMode) return;
    // 身份→匿名：警示留名 / 会话失效；匿名→身份：提示重启后需名册 + 管理员初始化（若未做过）。
    const confirmMsg =
      next === 'anonymous'
        ? t('settings.deployConfig.identity.toAnonConfirm')
        : t('settings.deployConfig.identity.toIdentityConfirm');
    if (!window.confirm(confirmMsg)) return;
    void applyRestart(() => client.setConfig({ identityMode: next }));
  }

  function graduate(): void {
    if (writeLocked) return;
    if (!window.confirm(t('settings.deployConfig.graduate.confirm'))) return;
    void applyRestart(() => client.graduate());
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.deployConfig')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.deployConfig.desc')}</p>
        {phase === 'applying' ? (
          <div className="setup-wizard__status" role="status" aria-live="polite">
            <div className="setup-spinner" aria-hidden="true" />
            <p className="settings-desc">{t('settings.deployConfig.applying')}</p>
          </div>
        ) : phase === 'error' ? (
          <>
            <p className="form-hint form-hint--warn">
              {timedOut
                ? t('settings.deployConfig.error.timeout')
                : t('settings.deployConfig.error.desc')}
            </p>
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => window.location.reload()}
              >
                {t('settings.deployConfig.reload')}
              </button>
            </div>
          </>
        ) : statusQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : statusQuery.error || !deployment ? (
          <p className="form-hint form-hint--warn">{t('settings.deployment.unavailable')}</p>
        ) : (
          <>
            {/* 登录方式切换（匿名 ⇄ 身份） */}
            <h3 className="integration-group__title">
              {t('settings.deployConfig.identity.title')}
            </h3>
            <p className="settings-desc">
              {t('settings.deployConfig.identity.current', {
                mode: t(
                  deployment.identityMode === 'identity'
                    ? 'settings.identity.mode.identity'
                    : 'settings.identity.mode.anonymous',
                ),
              })}
            </p>
            {lockHint ? <p className="task-detail__hint">{lockHint}</p> : null}
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={writeLocked}
                title={lockHint ?? undefined}
                onClick={() =>
                  switchIdentity(
                    deployment.identityMode === 'identity' ? 'anonymous' : 'identity',
                  )
                }
              >
                {t(
                  deployment.identityMode === 'identity'
                    ? 'settings.deployConfig.identity.toAnon'
                    : 'settings.deployConfig.identity.toIdentity',
                )}
              </button>
            </div>

            {/* 结束试驾，转正式（单向门，仅演示态显示） */}
            {deployment.dataMode === 'demo' ? (
              <>
                <h3 className="integration-group__title settings-desc--spaced">
                  {t('settings.deployConfig.graduate.title')}
                </h3>
                <p className="settings-desc">{t('settings.deployConfig.graduate.desc')}</p>
                {lockHint ? <p className="task-detail__hint">{lockHint}</p> : null}
                <div className="settings-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={writeLocked}
                    title={lockHint ?? undefined}
                    onClick={graduate}
                  >
                    {t('settings.deployConfig.graduate.cta')}
                  </button>
                </div>
              </>
            ) : null}

            {/* 常驻底注：改部署配置会自动重启。 */}
            <p className="settings-desc settings-desc--spaced">
              {t('settings.deployConfig.restartNote')}
            </p>
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
