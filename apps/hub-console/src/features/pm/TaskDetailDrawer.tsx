import type {
  Group,
  MemberPublic,
  TaskAcceptanceState,
  TaskStatus,
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
import { ownerGroupOf } from '../pool/pool-utils';
import { useTaskActions } from './sub/useTaskActions';

const STATUS_KEY: Record<TaskStatus, TranslationKey> = {
  pending: 'pm.status.pending',
  inProgress: 'pm.status.inProgress',
  blocked: 'pm.status.blocked',
  done: 'pm.status.done',
  shelved: 'pm.status.shelved',
};

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
  const actions = useTaskActions(client, source, task, members, identity);

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
        {actions.partnerWanted ? (
          <span className="badge badge--amber">{t('pool.badge.needPartner')}</span>
        ) : null}
        {actions.crossWanted ? (
          <span className="badge badge--neutral">{t('pool.badge.needConfirm')}</span>
        ) : null}
      </div>

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

      {task.transitions && task.transitions.length > 0 ? (
        <div className="tl-wrap">
          <h4 className="tl-title">{t('pool.timeline.title')}</h4>
          <ol className="tl-list">
            {task.transitions.map((tr, i) => (
              <li key={i} className="tl-item">
                <span className="tl-status">
                  {tr.from ? `${t(STATUS_KEY[tr.from])} → ` : ''}{t(STATUS_KEY[tr.to])}
                </span>
                <span className="tl-at">{formatDay(tr.at)}</span>
                {tr.by ? <span className="tl-by">{tr.by.displayName}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="task-detail__actions">
        {actions.writeLocked ? (
          <p className="task-detail__hint">{t('identity.writeHint')}</p>
        ) : (
          <>
            {actions.partnerWanted || task.partnerMemberId ? (
              actions.partnerOpen ? (
                <div className="task-detail__panel">
                  <Field label={t('pool.action.partnerPick')} hint={t('pool.action.partnerHint')}>
                    <Select
                      value={actions.partnerId}
                      onChange={actions.setPartnerId}
                      options={actions.sameGroupMembers.map((m) => m.id)}
                      renderOption={(id) => memberOptionLabel(members, id)}
                      placeholder={t('pool.picker.placeholder')}
                      ariaLabel={t('pool.action.partnerPick')}
                    />
                  </Field>
                  <div className="task-detail__panel-btns">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={!actions.partnerId || actions.partnerMutation.isPending}
                      onClick={() => actions.partnerMutation.mutate(actions.partnerId)}
                    >
                      {t('pool.action.partnerConfirm')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => actions.setPartnerOpen(false)}
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
                    actions.setPartnerOpen(true);
                    actions.setPartnerId(task.partnerMemberId ?? '');
                  }}
                >
                  {task.partnerMemberId
                    ? t('pool.action.partnerChange')
                    : t('pool.action.partnerAdd')}
                </button>
              )
            ) : null}

            {actions.crossWanted ? (
              <div className="task-detail__panel">
                {!actions.isIdentity
                  ? renderOperatorPicker(
                      actions.groupLeads,
                      actions.confirmActorId,
                      actions.setConfirmActorId,
                      t('pool.action.confirmOperator'),
                      t('pool.action.confirmOperatorHint'),
                      t('pool.gate.noLead'),
                    )
                  : null}
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={
                    actions.confirmMutation.isPending ||
                    (actions.isIdentity ? !actions.canConfirmLead : !actions.confirmActorId)
                  }
                  title={
                    actions.isIdentity && !actions.canConfirmLead
                      ? t('pool.gate.confirmNeedsLead')
                      : undefined
                  }
                  onClick={() => actions.confirmMutation.mutate(actions.confirmActor())}
                >
                  {t('pool.action.confirm')}
                </button>
              </div>
            ) : null}

            {task.status !== 'done' && task.status !== 'shelved' ? (
              <div className="task-detail__panel">
                {!actions.isIdentity ? (
                  <Field label={t('pool.action.operator')} hint={t('pool.action.operatorHint')}>
                    <Select
                      value={actions.completeActorId}
                      onChange={actions.setCompleteActorId}
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
                    actions.completeMutation.isPending || (!actions.isIdentity && !actions.completeActorId)
                  }
                  onClick={() => actions.completeMutation.mutate(actions.completeActor())}
                >
                  {t('pool.action.complete')}
                </button>
              </div>
            ) : null}

            {acceptance === 'awaitingReview' || acceptance === 'selfDone' ? (
              <div className="task-detail__panel">
                {!actions.isIdentity
                  ? renderOperatorPicker(
                      actions.reviewers,
                      actions.reviewActorId,
                      actions.setReviewActorId,
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
                      actions.reviewMutation.isPending || (actions.isIdentity ? !actions.canReview : !actions.reviewActorId)
                    }
                    title={
                      actions.isIdentity && !actions.canReview ? t('pool.gate.reviewNeedsReviewer') : undefined
                    }
                    onClick={() =>
                      actions.reviewMutation.mutate({ outcome: 'accept', actor: actions.reviewActor() })
                    }
                  >
                    {t('pool.action.accept')}
                  </button>
                ) : null}
                {actions.rejectOpen ? (
                  <div className="task-detail__panel">
                    <Field label={t('pool.action.rejectReason')} required>
                      <textarea
                        rows={2}
                        value={actions.rejectNote}
                        onChange={(e) => actions.setRejectNote(e.target.value)}
                        aria-required
                      />
                    </Field>
                    <div className="task-detail__panel-btns">
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        disabled={
                          !actions.rejectNote.trim() ||
                          actions.reviewMutation.isPending ||
                          (actions.isIdentity ? !actions.canReview : !actions.reviewActorId)
                        }
                        title={
                          actions.isIdentity && !actions.canReview
                            ? t('pool.gate.reviewNeedsReviewer')
                            : undefined
                        }
                        onClick={() =>
                          actions.reviewMutation.mutate({
                            outcome: 'reject',
                            note: actions.rejectNote.trim(),
                            actor: actions.reviewActor(),
                          })
                        }
                      >
                        {t('pool.action.rejectConfirm')}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => actions.setRejectOpen(false)}
                      >
                        {t('pool.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={actions.isIdentity && !actions.canReview}
                    title={
                      actions.isIdentity && !actions.canReview ? t('pool.gate.reviewNeedsReviewer') : undefined
                    }
                    onClick={() => actions.setRejectOpen(true)}
                  >
                    {acceptance === 'selfDone'
                      ? t('pool.action.spotReject')
                      : t('pool.action.reject')}
                  </button>
                )}
              </div>
            ) : null}

            {actions.actionError ? (
              <FormBanner
                kind="err"
                message={humanizeFormError(actions.actionError, t, 'pool.action.error')}
              />
            ) : null}
            {actions.crossWanted && ownerGroup ? (
              <p className="task-detail__hint">{t('pool.action.crossNote')}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
