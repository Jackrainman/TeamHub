import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ActorRef,
  Group,
  MemberPublic,
  TaskAcceptanceState,
  TaskWithMeta,
} from '@teamhub/hub-contracts';
import { deriveTaskAcceptance } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n, type TranslationKey } from '../../i18n';
import { humanizeFormError } from '../../utils';
import { Field } from '../../components/Field';
import { Select } from '../../components/Select';
import { FormBanner } from '../../components/FormBanner';
import { memberOptionLabel } from '../identity/identity-utils';
import { needsCrossClaimConfirm, needsPartner, ownerGroupOf } from '../pool/pool-utils';

/**
 * 任务详情抽屉（TASK-POST-CLAIM，D-088 §4/§5 + D-085 名字三层 / 体检 D4 债授权）：任务卡纯展示挤不下
 * 认领/指派/搭档/确认/完成/验收六件事，收进本抽屉（照 ProjectPage SideDrawer 先例）。**事实卡 = D-085
 * 名字该显示的地方**：认领人、指派人+理由、搭档、跨组确认人、完成人、验收人全在**单条任务卡**可见。
 *
 * 徽章 + 事后留名，**只在门上有硬闸**（A1）：搭档黄标 / 跨组"待组长确认"中性徽章都只暴露缺口、不拦操作；
 * 两档验收（deriveTaskAcceptance）把"大活待学长验收"显式化。鉴权失败（组长确认 403 / 验收 403）以横幅
 * 如实告知（"权属该组组长 / 验收人名单"）。红线：本抽屉绝不做任何按人聚合/排行/按人筛选。
 */

const ACCEPTANCE_TONE: Record<TaskAcceptanceState, string> = {
  notDone: 'badge--neutral',
  selfDone: 'badge--green',
  awaitingReview: 'badge--amber',
  accepted: 'badge--green',
};
const ACCEPTANCE_KEY: Record<TaskAcceptanceState, TranslationKey> = {
  notDone: 'pool.acceptance.notDone',
  selfDone: 'pool.acceptance.selfDone',
  awaitingReview: 'pool.acceptance.awaitingReview',
  accepted: 'pool.acceptance.accepted',
};

// 匿名模式选人 → ActorRef（source='console'，同 GateChecklistCard/DepGraphPage 的 confirmedBy 先例）。
function toActor(members: readonly MemberPublic[], id: string): ActorRef {
  return { id, displayName: memberOptionLabel(members, id), source: 'console' };
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

export function TaskDetailDrawer({
  client,
  source,
  task,
  members,
  groups,
  identity,
}: {
  client: HubApiClient;
  source: string;
  task: TaskWithMeta;
  members: MemberPublic[];
  groups: Group[];
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  // 身份模式已登录 → 服务端从会话注入 actor（本人/组长/验收人）；匿名模式选人供名。
  const isIdentity = identity.mode === 'identity' && identity.session != null;
  const writeLocked = !identity.canWrite;

  // 匿名模式操作人分动作各持（K2 身份体验刀）：三动作鉴权不同——组长确认属本组组长、完成属任何人、
  // 验收属验收人名单，候选各异，故不再共用一个选人器（旧共用会让人选到会 403 的操作人）。
  const [confirmActorId, setConfirmActorId] = useState('');
  const [completeActorId, setCompleteActorId] = useState('');
  const [reviewActorId, setReviewActorId] = useState('');
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerId, setPartnerId] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['tasks', source] });
    void queryClient.invalidateQueries({ queryKey: ['dep-graph', source] });
  };
  const afterAction = () => {
    setPartnerOpen(false);
    setPartnerId('');
    setRejectOpen(false);
    setRejectNote('');
    setConfirmActorId('');
    setCompleteActorId('');
    setReviewActorId('');
    invalidate();
  };

  const partnerMutation = useMutation({
    mutationFn: (memberId: string) =>
      client.setTaskPartner(task.id, { partnerMemberId: memberId }),
    onSuccess: afterAction,
  });
  const confirmMutation = useMutation({
    mutationFn: (actor: ActorRef | undefined) =>
      client.confirmCrossClaim(task.id, actor ? { confirmedBy: actor } : {}),
    onSuccess: afterAction,
  });
  const completeMutation = useMutation({
    mutationFn: (actor: ActorRef | undefined) =>
      client.completeTask(task.id, actor ? { completedBy: actor } : {}),
    onSuccess: afterAction,
  });
  const reviewMutation = useMutation({
    mutationFn: (vars: { outcome: 'accept' | 'reject'; note?: string; actor?: ActorRef }) =>
      client.reviewTask(task.id, {
        outcome: vars.outcome,
        reviewedBy: vars.actor,
        note: vars.note,
      }),
    onSuccess: afterAction,
  });

  const actionError =
    partnerMutation.error ??
    confirmMutation.error ??
    completeMutation.error ??
    reviewMutation.error ??
    null;

  // 选人器候选过滤 = 镜像服务端鉴权（避免"点了才 403"）：跨组确认属本组组长（isGroupLeadOf：
  // role==='groupAdmin' && 同组，项目管理旗标不算某组组长故不入列）、验收属验收人名单（gateReviewer）。
  const groupLeads = members.filter(
    (m) => m.role === 'groupAdmin' && m.groupId === task.groupId,
  );
  const reviewers = members.filter((m) => m.gateReviewer);
  // 身份模式前置资格（登录会话快照，镜像服务端）：确认需本组组长、验收需验收人。匿名模式无身份可判、不前置判。
  const canConfirmLead =
    identity.session?.role === 'groupAdmin' && identity.session?.groupId === task.groupId;
  const canReview = identity.session?.gateReviewer === true;

  // 匿名模式各动作操作人 → ActorRef；身份模式服务端从会话注入（undefined）。
  const confirmActor = (): ActorRef | undefined =>
    isIdentity ? undefined : toActor(members, confirmActorId);
  const completeActor = (): ActorRef | undefined =>
    isIdentity ? undefined : toActor(members, completeActorId);
  const reviewActor = (): ActorRef | undefined =>
    isIdentity ? undefined : toActor(members, reviewActorId);

  // 分动作 scoped 选人器（匿名模式）：候选空 → 引导去设置任命、不给能选到会 403 的人。
  const renderOperatorPicker = (
    candidates: MemberPublic[],
    value: string,
    onChange: (v: string) => void,
    label: string,
    hint: string,
    emptyHint: string,
  ) =>
    candidates.length === 0 ? (
      <p className="task-detail__hint">{emptyHint}</p>
    ) : (
      <Field label={label} hint={hint}>
        <Select
          value={value}
          onChange={onChange}
          options={candidates.map((m) => m.id)}
          renderOption={(id) => memberOptionLabel(members, id)}
          placeholder={t('pool.picker.placeholder')}
          ariaLabel={label}
        />
      </Field>
    );

  const groupName = groups.find((g) => g.id === task.groupId)?.name ?? task.groupId;
  const ownerName = task.ownerId
    ? memberOptionLabel(members, task.ownerId)
    : null;
  const ownerGroup = ownerGroupOf(members, task.ownerId);
  const acceptance = deriveTaskAcceptance(task, task.isBig);
  const partnerWanted = needsPartner(task, members);
  const crossWanted = needsCrossClaimConfirm(task, task.isBig, members);
  // 本组搭档候选 = 与任务同组的成员（"本组必须也有人领"）。
  const sameGroupMembers = members.filter((m) => m.groupId === task.groupId);
  // 被打回态（reviewTask reject：status 退回 + reviewNote 记打回理由）——非 accepted 但已有 reviewNote。
  const rejected =
    task.status !== 'done' && task.reviewNote != null && task.reviewedBy != null;

  return (
    <div className="task-detail">
      <p className="task-detail__summary">{task.rawSummary}</p>
      <div className="task-detail__badges">
        <span className="badge">{groupName}</span>
        {task.isBig ? (
          <span className="badge badge--blue" title={t('pool.big.hint')}>
            {t('pool.badge.big')}
          </span>
        ) : null}
        <span className={`badge ${ACCEPTANCE_TONE[acceptance]}`}>
          {t(ACCEPTANCE_KEY[acceptance])}
        </span>
        {partnerWanted ? (
          <span className="badge badge--amber">{t('pool.badge.needPartner')}</span>
        ) : null}
        {crossWanted ? (
          <span className="badge badge--neutral">{t('pool.badge.needConfirm')}</span>
        ) : null}
      </div>

      {/* ── 事实卡留名（D-085 事实层永远带名，只在本单卡可见）─────────────────────────── */}
      <dl className="task-detail__facts">
        {ownerName ? (
          <div className="task-detail__fact">
            <dt>{t('pool.fact.owner')}</dt>
            <dd>{ownerName}</dd>
          </div>
        ) : null}
        {task.claimedAt ? (
          <div className="task-detail__fact">
            <dt>{t('pool.fact.claimed')}</dt>
            <dd>{formatDay(task.claimedAt)}</dd>
          </div>
        ) : null}
        {task.assignReason ? (
          <div className="task-detail__fact">
            <dt>{t('pool.fact.assigned')}</dt>
            <dd>
              {t('pool.fact.assignedBy', {
                name: task.assignedBy?.displayName ?? '—',
                reason: task.assignReason,
              })}
            </dd>
          </div>
        ) : null}
        {task.partnerMemberId ? (
          <div className="task-detail__fact">
            <dt>{t('pool.fact.partner')}</dt>
            <dd>{memberOptionLabel(members, task.partnerMemberId)}</dd>
          </div>
        ) : null}
        {task.crossClaimConfirmedBy ? (
          <div className="task-detail__fact">
            <dt>{t('pool.fact.confirmed')}</dt>
            <dd>{task.crossClaimConfirmedBy.displayName}</dd>
          </div>
        ) : null}
        {acceptance === 'selfDone' && task.completedBy ? (
          <div className="task-detail__fact">
            <dt>{t('pool.fact.completed')}</dt>
            <dd>{task.completedBy.displayName}</dd>
          </div>
        ) : null}
        {acceptance === 'accepted' && task.reviewedBy ? (
          <div className="task-detail__fact">
            <dt>{t('pool.fact.reviewed')}</dt>
            <dd>
              {task.reviewedBy.displayName}
              {task.reviewNote ? ` · ${task.reviewNote}` : ''}
            </dd>
          </div>
        ) : null}
        {rejected ? (
          <div className="task-detail__fact task-detail__fact--warn">
            <dt>{t('pool.fact.rejected')}</dt>
            <dd>
              {t('pool.fact.rejectedBy', {
                name: task.reviewedBy?.displayName ?? '—',
                note: task.reviewNote ?? '',
              })}
            </dd>
          </div>
        ) : null}
      </dl>

      {/* ── 动作区（事后留名 / 暴露缺口，不做启动闸）────────────────────────────────── */}
      <div className="task-detail__actions">
        {writeLocked ? (
          <p className="task-detail__hint">{t('identity.writeHint')}</p>
        ) : (
          <>
            {/* 本组搭档补位（师傅 / 对接人）：外组认领后本组须有人补位。 */}
            {partnerWanted || task.partnerMemberId ? (
              partnerOpen ? (
                <div className="task-detail__panel">
                  <Field label={t('pool.action.partnerPick')} hint={t('pool.action.partnerHint')}>
                    <Select
                      value={partnerId}
                      onChange={setPartnerId}
                      options={sameGroupMembers.map((m) => m.id)}
                      renderOption={(id) => memberOptionLabel(members, id)}
                      placeholder={t('pool.picker.placeholder')}
                      ariaLabel={t('pool.action.partnerPick')}
                    />
                  </Field>
                  <div className="task-detail__panel-btns">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={!partnerId || partnerMutation.isPending}
                      onClick={() => partnerMutation.mutate(partnerId)}
                    >
                      {t('pool.action.partnerConfirm')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setPartnerOpen(false)}
                    >
                      {t('pool.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => {
                    setPartnerOpen(true);
                    setPartnerId(task.partnerMemberId ?? '');
                  }}
                >
                  {task.partnerMemberId
                    ? t('pool.action.partnerChange')
                    : t('pool.action.partnerAdd')}
                </button>
              )
            ) : null}

            {/* 跨组大任务组长确认（事后留名，不拦操作）：属本组组长——身份模式非组长禁用+title，匿名模式选人器只列组长。 */}
            {crossWanted ? (
              <div className="task-detail__panel">
                {!isIdentity
                  ? renderOperatorPicker(
                      groupLeads,
                      confirmActorId,
                      setConfirmActorId,
                      t('pool.action.confirmOperator'),
                      t('pool.action.confirmOperatorHint'),
                      t('pool.gate.noLead'),
                    )
                  : null}
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={
                    confirmMutation.isPending ||
                    (isIdentity ? !canConfirmLead : !confirmActorId)
                  }
                  title={
                    isIdentity && !canConfirmLead
                      ? t('pool.gate.confirmNeedsLead')
                      : undefined
                  }
                  onClick={() => confirmMutation.mutate(confirmActor())}
                >
                  {t('pool.action.confirm')}
                </button>
              </div>
            ) : null}

            {/* 标记完成（§5 本人标完成留名）：无鉴权（任何人可标完成），匿名模式选人器列全员。 */}
            {task.status !== 'done' && task.status !== 'shelved' ? (
              <div className="task-detail__panel">
                {!isIdentity ? (
                  <Field label={t('pool.action.operator')} hint={t('pool.action.operatorHint')}>
                    <Select
                      value={completeActorId}
                      onChange={setCompleteActorId}
                      options={members.map((m) => m.id)}
                      renderOption={(id) => memberOptionLabel(members, id)}
                      placeholder={t('pool.picker.placeholder')}
                      ariaLabel={t('pool.action.operator')}
                    />
                  </Field>
                ) : null}
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={
                    completeMutation.isPending || (!isIdentity && !completeActorId)
                  }
                  onClick={() => completeMutation.mutate(completeActor())}
                >
                  {t('pool.action.complete')}
                </button>
              </div>
            ) : null}

            {/* 两档验收：大活 done → 待学长验收（验收 / 打回）；简单活 done → 已完成 + 抽查打回权。
                属验收人名单——身份模式非验收人禁用+title，匿名模式选人器只列验收人。 */}
            {acceptance === 'awaitingReview' || acceptance === 'selfDone' ? (
              <div className="task-detail__panel">
                {!isIdentity
                  ? renderOperatorPicker(
                      reviewers,
                      reviewActorId,
                      setReviewActorId,
                      t('pool.action.reviewOperator'),
                      t('pool.action.reviewOperatorHint'),
                      t('pool.gate.noReviewer'),
                    )
                  : null}
                {acceptance === 'awaitingReview' ? (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={
                      reviewMutation.isPending || (isIdentity ? !canReview : !reviewActorId)
                    }
                    title={
                      isIdentity && !canReview ? t('pool.gate.reviewNeedsReviewer') : undefined
                    }
                    onClick={() =>
                      reviewMutation.mutate({ outcome: 'accept', actor: reviewActor() })
                    }
                  >
                    {t('pool.action.accept')}
                  </button>
                ) : null}
                {rejectOpen ? (
                  <div className="task-detail__panel">
                    <Field label={t('pool.action.rejectReason')} required>
                      <textarea
                        rows={2}
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        aria-required
                      />
                    </Field>
                    <div className="task-detail__panel-btns">
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        disabled={
                          !rejectNote.trim() ||
                          reviewMutation.isPending ||
                          (isIdentity ? !canReview : !reviewActorId)
                        }
                        title={
                          isIdentity && !canReview
                            ? t('pool.gate.reviewNeedsReviewer')
                            : undefined
                        }
                        onClick={() =>
                          reviewMutation.mutate({
                            outcome: 'reject',
                            note: rejectNote.trim(),
                            actor: reviewActor(),
                          })
                        }
                      >
                        {t('pool.action.rejectConfirm')}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setRejectOpen(false)}
                      >
                        {t('pool.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={isIdentity && !canReview}
                    title={
                      isIdentity && !canReview ? t('pool.gate.reviewNeedsReviewer') : undefined
                    }
                    onClick={() => setRejectOpen(true)}
                  >
                    {acceptance === 'selfDone'
                      ? t('pool.action.spotReject')
                      : t('pool.action.reject')}
                  </button>
                )}
              </div>
            ) : null}

            {actionError ? (
              <FormBanner
                kind="err"
                message={humanizeFormError(actionError, t, 'pool.action.error')}
              />
            ) : null}
            {/* ownerGroup 仅用于跨组事实语义提示，不作任何按人聚合。 */}
            {crossWanted && ownerGroup ? (
              <p className="task-detail__hint">{t('pool.action.crossNote')}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
