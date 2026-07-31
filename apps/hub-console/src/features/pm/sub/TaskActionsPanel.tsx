import type {
  MemberPublic,
  TaskAcceptanceState,
  TaskWithMeta,
} from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { humanizeFormError } from '../../../utils';
import { Field } from '../../../components/Field';
import { Select } from '../../../components/Select';
import { FormBanner } from '../../../components/FormBanner';
import { memberOptionLabel } from '../../identity/identity-utils';
import { ownerGroupOf } from '../../pool/pool-utils';
import type { useTaskActions } from './useTaskActions';

export function TaskActionsPanel({
  actions,
  task,
  members,
  acceptance,
}: {
  actions: ReturnType<typeof useTaskActions>;
  task: TaskWithMeta;
  members: MemberPublic[];
  acceptance: TaskAcceptanceState;
}) {
  const { t } = useI18n();
  const ownerGroup = ownerGroupOf(members, task.ownerId);

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

  return (
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
  );
}
