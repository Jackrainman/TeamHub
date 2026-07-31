import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Hand, Search, UserPlus } from 'lucide-react';
import type {
  ActorRef,
  Group,
  MemberPublic,
  TaskStatus,
  TaskWithMeta,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n, type TranslationKey } from '../../i18n';
import { humanizeFormError } from '../../utils';
import { Field } from '../../components/Field';
import { Select } from '../../components/Select';
import { FormBanner } from '../../components/FormBanner';
import { memberOptionLabel, toActor } from '../identity/identity-utils';
import { useQueryGuard } from '../../shared/QueryGate';
import { useTasks, useTasksSearch } from '../../hooks/useTasks';
import { useMembers, useGroups } from '../../hooks/useRoster';
import {
  POOL_STALE_DAYS,
  isStalePosted,
  sortedPostedTasks,
  stalenessDays,
} from './pool-utils';

/**
 * 挂单池视图（TASK-POST-CLAIM，D-088 设计 §3"过夜登记处" / §6）：项目页第三视图。两块——
 * ① 上：**"看谁做过"关键词搜索**（GET /api/tasks?q=）→ 事实卡结果列表（title/状态/负责人显名/时间），
 *    "找到做过的人，自己去联系"。红线：结果永不聚合成技能画像/花名册，不按人筛选。
 * ② 下：**挂单池**（isPostedTask 过滤、按滞留时长降序）——一键认领（本人/匿名选人）+ 组长指派入口
 *    （owner 选人 + 理由必填）。**滞留=对事可见**（"这单挂两周没人领"），绝无"谁闲着"的按人视图。
 */

const STATUS_KEY: Record<TaskStatus, TranslationKey> = {
  pending: 'pm.status.pending',
  inProgress: 'pm.status.inProgress',
  blocked: 'pm.status.blocked',
  done: 'pm.status.done',
  shelved: 'pm.status.shelved',
};

export function PoolPage({
  client,
  source,
  identity,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const now = useMemo(() => new Date(), []);
  const [search, setSearch] = useState('');
  const q = search.trim();

  const tasksQuery = useTasks(client, source);
  const membersQuery = useMembers(client, 'pool');
  const groupsQuery = useGroups(client, 'pool');
  const searchQuery = useTasksSearch(client, source, q);

  const members = membersQuery.data?.members ?? [];
  const groups = groupsQuery.data?.groups ?? [];

  const tasksGate = useQueryGuard(tasksQuery, t('pm.loading'), t('pm.error'));
  if (tasksGate.guard) return tasksGate.guard;

  const posted = sortedPostedTasks(tasksGate.data.tasks);

  return (
    <div className="pool-page">
      {/* ── "看谁做过"搜索（设计 §3）───────────────────────────────────────────────── */}
      <section className="pool-search" aria-label={t('pool.search.aria')}>
        <div className="pool-search__box">
          <Search size={16} aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('pool.search.placeholder')}
            aria-label={t('pool.search.aria')}
          />
        </div>
        <p className="pool-search__note">{t('pool.search.note')}</p>
        {q.length > 0 ? (
          searchQuery.isLoading ? (
            <p className="gaps-note">{t('pm.loading')}</p>
          ) : searchQuery.data && searchQuery.data.tasks.length > 0 ? (
            <ul className="pool-results">
              {searchQuery.data.tasks.map((task) => (
                <li key={task.id} className="pool-result">
                  <div className="pool-result__head">
                    <strong>{task.title}</strong>
                    <span className="badge badge--xs">{t(STATUS_KEY[task.status])}</span>
                  </div>
                  <p className="pool-result__meta">
                    {t('pool.result.owner', {
                      name: task.ownerId
                        ? memberOptionLabel(members, task.ownerId)
                        : t('pool.result.unowned'),
                    })}
                    {' · '}
                    {new Date(task.updatedAt).toISOString().slice(0, 10)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="gaps-note">{t('pool.search.empty')}</p>
          )
        ) : null}
      </section>

      {/* ── 挂单池（设计 §3/§6）────────────────────────────────────────────────────── */}
      <section aria-label={t('pool.list.aria')}>
        <p className="gaps-intro">{t('pool.list.intro', { n: posted.length })}</p>
        {posted.length === 0 ? (
          <div className="pm-coldstart">
            <h3>{t('pool.list.emptyTitle')}</h3>
            <p>{t('pool.list.emptyBody')}</p>
          </div>
        ) : (
          <div className="pool-list">
            {posted.map((task) => (
              <PoolCard
                key={task.id}
                client={client}
                source={source}
                task={task}
                members={members}
                groups={groups}
                identity={identity}
                now={now}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PoolCard({
  client,
  source,
  task,
  members,
  groups,
  identity,
  now,
}: {
  client: HubApiClient;
  source: string;
  task: TaskWithMeta;
  members: MemberPublic[];
  groups: Group[];
  identity: PageIdentityCtx;
  now: Date;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isIdentity = identity.mode === 'identity' && identity.session != null;
  const writeLocked = !identity.canWrite;
  // 指派权属该组组长（镜像服务端 isGroupLeadOf：role==='groupAdmin' && groupId===task.groupId；
  // 项目管理旗标不算某组组长，故不放行——与 server.ts /assign 鉴权逐条对齐，避免"点了才 403"）。
  const groupLeads = members.filter(
    (m) => m.role === 'groupAdmin' && m.groupId === task.groupId,
  );
  // 身份模式前置资格：本人是否为本组组长（登录会话的角色/组快照）。匿名模式无身份可判 → 不前置判、只过滤选人器。
  const sessionCanAssign =
    isIdentity &&
    identity.session?.role === 'groupAdmin' &&
    identity.session?.groupId === task.groupId;

  const [claimOpen, setClaimOpen] = useState(false);
  const [claimId, setClaimId] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [ownerId, setOwnerId] = useState('');
  const [reason, setReason] = useState('');
  const [leadId, setLeadId] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks(source) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.depGraph(source) });
  };

  const claimMutation = useMutation({
    mutationFn: (memberId: string | undefined) =>
      client.claimTask(task.id, memberId ? { memberId } : {}),
    onSuccess: () => {
      setClaimOpen(false);
      setClaimId('');
      invalidate();
    },
  });
  const assignMutation = useMutation({
    mutationFn: (vars: { ownerId: string; reason: string; assignedBy?: ActorRef }) =>
      client.assignTask(task.id, vars),
    onSuccess: () => {
      setAssignOpen(false);
      setOwnerId('');
      setReason('');
      setLeadId('');
      invalidate();
    },
  });

  const days = stalenessDays(task.createdAt, now);
  const stale = isStalePosted(days);
  const groupName = groups.find((g) => g.id === task.groupId)?.name ?? task.groupId;

  const onClaimClick = () => {
    if (writeLocked) return;
    if (isIdentity) {
      claimMutation.mutate(undefined);
    } else {
      setClaimOpen(true);
      setClaimId('');
    }
  };
  const submitClaim = () => {
    if (!claimId) return;
    claimMutation.mutate(claimId);
  };
  const submitAssign = () => {
    if (!ownerId || !reason.trim()) return;
    if (!isIdentity && !leadId) return;
    assignMutation.mutate({
      ownerId,
      reason: reason.trim(),
      assignedBy: isIdentity ? undefined : toActor(members, leadId),
    });
  };

  return (
    <article className={`pool-card${stale ? ' pool-card--stale' : ''}`}>
      <div className="pool-card__head">
        <h3 className="pool-card__title">{task.title}</h3>
        <span className={`badge badge--xs ${stale ? 'badge--red' : 'badge--faint'}`}>
          {t('pool.card.staleDays', { n: days })}
        </span>
      </div>
      <p className="pool-card__summary">{task.rawSummary}</p>
      <div className="pool-card__badges">
        <span className="badge">{groupName}</span>
        {task.isBig ? (
          <span className="badge badge--blue" title={t('pool.big.hint')}>
            {t('pool.badge.big')}
          </span>
        ) : null}
        {stale ? (
          <span className="badge badge--red">
            {t('pool.card.staleWarn', { days: POOL_STALE_DAYS })}
          </span>
        ) : null}
      </div>

      <div className="pool-card__actions">
        {writeLocked ? (
          <p className="task-detail__hint">{t('identity.writeHint')}</p>
        ) : (
          <>
            {/* 一键认领：即生效免确认（§3；唯一硬闸在门上）。 */}
            {claimOpen ? (
              <div className="task-detail__panel">
                <Field label={t('pool.claim.picker')}>
                  <Select
                    value={claimId}
                    onChange={setClaimId}
                    options={members.map((m) => m.id)}
                    renderOption={(id) => memberOptionLabel(members, id)}
                    placeholder={t('pool.picker.placeholder')}
                    ariaLabel={t('pool.claim.picker')}
                  />
                </Field>
                <div className="task-detail__panel-btns">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={!claimId || claimMutation.isPending}
                    onClick={submitClaim}
                  >
                    {t('pool.claim.confirm')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setClaimOpen(false)}
                  >
                    {t('pool.cancel')}
                  </button>
                </div>
                {claimMutation.error ? (
                  <p className="form-hint form-hint--warn">
                    {humanizeFormError(claimMutation.error, t, 'pool.claim.error')}
                  </p>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={claimMutation.isPending}
                onClick={onClaimClick}
              >
                <Hand size={14} aria-hidden="true" /> {t('pool.claim.button')}
              </button>
            )}

            {/* 组长指派入口：owner 选人 + 理由必填（分配=显式培养投资，多一格摩擦）。 */}
            {assignOpen ? (
              <div className="task-detail__panel">
                <Field label={t('pool.assign.owner')} required>
                  <Select
                    value={ownerId}
                    onChange={setOwnerId}
                    options={members.map((m) => m.id)}
                    renderOption={(id) => memberOptionLabel(members, id)}
                    placeholder={t('pool.picker.placeholder')}
                    ariaLabel={t('pool.assign.owner')}
                  />
                </Field>
                <Field label={t('pool.assign.reason')} required hint={t('pool.assign.reasonHint')}>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    aria-required
                  />
                </Field>
                {!isIdentity ? (
                  groupLeads.length === 0 ? (
                    <p className="task-detail__hint">{t('pool.gate.noLead')}</p>
                  ) : (
                    <Field label={t('pool.assign.lead')} hint={t('pool.assign.leadHint')}>
                      <Select
                        value={leadId}
                        onChange={setLeadId}
                        options={groupLeads.map((m) => m.id)}
                        renderOption={(id) => memberOptionLabel(members, id)}
                        placeholder={t('pool.picker.placeholder')}
                        ariaLabel={t('pool.assign.lead')}
                      />
                    </Field>
                  )
                ) : null}
                <div className="task-detail__panel-btns">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={
                      !ownerId ||
                      !reason.trim() ||
                      (!isIdentity && !leadId) ||
                      assignMutation.isPending
                    }
                    onClick={submitAssign}
                  >
                    {t('pool.assign.confirm')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setAssignOpen(false)}
                  >
                    {t('pool.cancel')}
                  </button>
                </div>
                {assignMutation.error ? (
                  <p className="form-hint form-hint--warn">
                    {humanizeFormError(assignMutation.error, t, 'pool.assign.error')}
                  </p>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                // 身份模式非本组组长 → 禁用 + title 说明（不隐藏，保可发现性）。匿名模式恒可开（选人器再过滤）。
                disabled={isIdentity && !sessionCanAssign}
                title={
                  isIdentity && !sessionCanAssign ? t('pool.gate.assignNeedsLead') : undefined
                }
                onClick={() => setAssignOpen(true)}
              >
                <UserPlus size={14} aria-hidden="true" /> {t('pool.assign.button')}
              </button>
            )}

            {claimMutation.error ? (
              <FormBanner
                kind="err"
                message={humanizeFormError(claimMutation.error, t, 'pool.claim.error')}
              />
            ) : null}
            {assignMutation.error ? (
              <FormBanner
                kind="err"
                message={humanizeFormError(assignMutation.error, t, 'pool.assign.error')}
              />
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}
