import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deriveLeafGroups,
  type Group,
  type MemberPublic,
  type MemberRole,
  type RosterImportRow,
  type RosterPreviewResponse,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useMembers, useGroups } from '../../hooks/useRoster';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { GRADE_KEY, RosterReportView } from '../../shared/roster';
import { Select } from '../../components/Select';
import { GroupLeadConfirm } from './GroupLeadConfirm';
import { canShowMemberPin } from './pin-visibility';
import { RosterPreviewTable } from './RosterPreviewTable';
import { humanizeFormError } from '../../utils';
import { MEMBER_ROLE_OPTIONS, ROLE_KEY } from './settings-constants';
import { sectionPermission } from './section-permission';

// 成员与权限（K1 权限地基 + GATE-CHECKLIST-IOU，D-087 拍板② + MEMBER-PM-FLAG 刀②b + 打磨轮刀⑧）：
// 一张名单表——每个成员一行（刀⑧③ 单列布局，一行一人），含角色两档下拉（PUT /api/members/:id/role，
// 组织身份）+ 项目管理开关（PUT /api/members/:id/project-manager，原 superAdmin 的正交旗标）+
// 验收人**只读徽标**（刀⑧① 纯年级派生：大三及以上自动，去手勾——PUT gate-reviewer 端点保留但 UI 不消费）+
// 「显示PIN」（刀⑧②，仅身份模式 + 本人/持旗管理员行可见）。身份模式且名册无持旗成员时，
// 顶部显示「初始化管理员」引导卡（调 setup 路由）。
// **绝不做任何按人统计**（红线 I0：本域无按人聚合/排行）；名单只决定「谁是管理员 / 谁能签字豁免」，非考勤非画像。
export function MembersPermissionsSection({
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
  const membersQuery = useMembers(client, 'settings-members');
  const groupsQuery = useGroups(client, source);

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
          // 刀⑧③ 一行一人：成员名单单列布局（adapter-grid--members），双列网格把名字列压到显示不下。
          <div className="adapter-grid adapter-grid--members">
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
                      onChange={(e) => {
                        const grant = e.target.checked;
                        if (
                          !grant &&
                          !window.confirm(
                            t('settings.members.pm.revokeConfirm', {
                              name: member.displayName,
                            }),
                          )
                        )
                          return;
                        pmMutation.mutate({
                          id: member.id,
                          projectManager: grant,
                        });
                      }}
                    />
                    <span>{t('settings.members.pm.toggle')}</span>
                  </label>
                  {/* 验收人只读徽标（刀⑧① 纯年级派生，去手勾）：大三及以上（含研）自动获得，
                      PUT gate-reviewer 端点保留但 UI 不再消费。 */}
                  {member.gateReviewer ? (
                    <span className="badge badge--wide badge--green">
                      {t('settings.reviewers.badge.auto')}
                    </span>
                  ) : null}
                  {identity.mode === 'identity' && canShowMemberPin(identity, member.id) ? (
                    <MemberPinReveal client={client} memberId={member.id} />
                  ) : null}
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
      </div>
    </section>
  );
}

// 「显示PIN」行内揭示（打磨轮刀⑧②）：点一下调 GET /api/members/:id/pin 揭示明文（等宽字体），
// 再点遮回；404「未设置 PIN」（旧数据无 pinPlaintext 副本 / 从未设）→ 行内显示「未设置 PIN」。
// 可见性由 canShowMemberPin 在上层判（本人或持旗管理员、仅身份模式），服务端 403 兜底。
function MemberPinReveal({ client, memberId }: { client: HubApiClient; memberId: string }) {
  const { t } = useI18n();
  const [pin, setPin] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'unset' | 'error'>('idle');

  async function reveal() {
    setState('loading');
    try {
      const data = await client.getMemberPin(memberId);
      setPin(data.pin);
      setState('idle');
    } catch (err) {
      // fetchJson 错误串前缀带状态码（"404: …"）：404 = 未设置/无副本，其余 = 真实失败给提示。
      setState(err instanceof Error && err.message.startsWith('404') ? 'unset' : 'error');
    }
  }

  if (state === 'unset') {
    return <span className="settings-member__pin">{t('settings.members.showPin.unset')}</span>;
  }
  if (pin !== null) {
    return (
      <span className="settings-member__pin">
        <code>{t('settings.members.showPin.revealed', { pin })}</code>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => setPin(null)}
        >
          {t('settings.members.showPin.hide')}
        </button>
      </span>
    );
  }
  return (
    <span className="settings-member__pin">
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        disabled={state === 'loading'}
        onClick={() => void reveal()}
      >
        {t('settings.members.showPin')}
      </button>
      {state === 'error' ? (
        <span className="form-hint form-hint--warn">{t('settings.members.showPin.error')}</span>
      ) : null}
    </span>
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

// 名册导入块（ROSTER-IMPORT，K8 + 刀③ 导入后确认组长 + 刀⑦ 预览表可编辑）：下载 CSV 模板（直链 GET）+
// 上传 CSV → **preview 只解析不落库** → RosterPreviewTable 行内编辑（年级下拉七档 / 组 datalist 预填
// 叶子组，可手打新组名）→ 确认后 JSON 导入 → 渲染六段报告 + 确认组长块（GroupLeadConfirm——刀③ 起
// CSV 不含组长列，导入完成后逐组从该组成员选组长）。**空板豁免**：名册为空时上传免锁（解开身份模式
// 空板死锁——无人可选→无法登录→无法初始化管理员）；否则跟随分区权限（未登录 / 非管理员则禁用 + 说明）。
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
  // 刀⑦：上传 → 预览（不落库）→ 编辑确认 → 导入。preview 非空时展示可编辑预览表。
  const [preview, setPreview] = useState<RosterPreviewResponse | null>(null);
  const previewMutation = useMutation({
    mutationFn: (file: File) => client.previewRoster(file),
    onSuccess: (data) => setPreview(data),
  });
  const importMutation = useMutation({
    mutationFn: (rows: RosterImportRow[]) => client.importRosterRows(rows),
    onSuccess: () => {
      setPreview(null);
      setLeadsDone(false);
      onImported();
    },
  });
  // 空板豁免：名册为空时上传免锁；否则跟随分区写权限（未登录 / 非管理员锁）。
  const uploadLocked = emptyRoster ? false : sectionWriteLocked;
  // 组 datalist 候选 = 叶子组名（deriveLeafGroups 结构派生，排非叶子+哨兵；可手打新组名=自动建组）。
  const leafGroupNames = useMemo(() => {
    const leaf = new Set(deriveLeafGroups([...groups]));
    return groups.filter((g) => leaf.has(g.id)).map((g) => g.name);
  }, [groups]);
  const report = importMutation.data;
  const error = previewMutation.error ?? importMutation.error;

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
          disabled={uploadLocked || previewMutation.isPending || importMutation.isPending}
          title={uploadLocked ? (lockHint ?? undefined) : undefined}
        >
          {previewMutation.isPending ? t('settings.roster.importing') : t('settings.roster.upload')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) previewMutation.mutate(file);
            e.target.value = ''; // 允许同名文件再次触发 change
          }}
        />
      </div>
      {emptyRoster ? (
        <p className="settings-desc">{t('settings.roster.firstHint')}</p>
      ) : null}
      {error ? (
        <p className="form-hint form-hint--warn">
          {humanizeFormError(error, t, 'settings.roster.error')}
        </p>
      ) : null}
      {/* 刀⑦：预览表（不落库）→ 行内编辑 → 确认后 JSON 导入；坏行红标不参与提交。 */}
      {preview ? (
        <RosterPreviewTable
          preview={preview}
          groupNames={leafGroupNames}
          pending={importMutation.isPending}
          onConfirm={(rows) => importMutation.mutate(rows)}
          onCancel={() => setPreview(null)}
        />
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
