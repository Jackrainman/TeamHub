import type { MemberPublic, TaskAcceptanceState, TaskWithMeta } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { humanizeFormError } from '../../../utils';
import { Field } from '../../../components/Field';
import { Select } from '../../../components/Select';
import { FormBanner } from '../../../components/FormBanner';
import { memberOptionLabel } from '../../../shared/lib/identity-utils';
import type { useTaskActions } from './useTaskActions';

export function TaskActionsPanel({ actions, task, members, acceptance }: {
  actions: ReturnType<typeof useTaskActions>;
  task: TaskWithMeta;
  members: MemberPublic[];
  acceptance: TaskAcceptanceState;
}) {
  const { t } = useI18n();
  return <div className="task-detail__actions">
    {actions.writeLocked ? <p className="task-detail__hint">{t('identity.writeHint')}</p> : <>
      {!task.ownerId && task.status !== 'done' && task.status !== 'shelved' ? <button type="button" className="btn btn--primary btn--sm" disabled={actions.claimMutation.isPending} onClick={() => actions.claimMutation.mutate()}>{t('pool.action.claim')}</button> : null}
      {task.status !== 'done' && task.status !== 'shelved' && actions.canComplete ? <div className="task-detail__panel">
        {!actions.isIdentity ? <Field label={t('pool.action.operator')} hint={t('pool.action.operatorHint')}>
          <Select value={actions.completeActorId} onChange={actions.setCompleteActorId} options={members.map(m => m.id)} renderOption={id => memberOptionLabel(members, id)} placeholder={t('pool.picker.placeholder')} ariaLabel={t('pool.action.operator')} />
        </Field> : null}
        <button type="button" className="btn btn--secondary btn--sm" disabled={actions.completeMutation.isPending || (!actions.isIdentity && !actions.completeActorId)} onClick={() => actions.completeMutation.mutate(actions.completeActor())}>{t('pool.action.complete')}</button>
      </div> : null}
      {actions.selfAccept ? <button type="button" className="btn btn--primary btn--sm" onClick={() => actions.setSelfAcceptOpen(true)}>{t('rail.selfAccept.action')}</button> : null}
      {acceptance === 'awaitingReview' && !actions.selfAccept ? <div className="task-detail__panel">
        {!actions.isIdentity ? <Field label={t('pool.action.reviewOperator')} hint={t('pool.action.reviewOperatorHint')}>
          <Select value={actions.reviewActorId} onChange={actions.setReviewActorId} options={actions.reviewers.map(m => m.id)} renderOption={id => memberOptionLabel(members, id)} placeholder={t('pool.picker.placeholder')} ariaLabel={t('pool.action.reviewOperator')} />
        </Field> : null}
        <button type="button" className="btn btn--primary btn--sm" disabled={actions.reviewMutation.isPending || (actions.isIdentity ? !actions.canReview : !actions.reviewActorId)} onClick={() => actions.reviewMutation.mutate({ outcome: 'accept', actor: actions.reviewActor() })}>{t('pool.action.accept')}</button>
        {actions.rejectOpen ? <div className="task-detail__panel"><Field label={t('pool.action.rejectReason')} required>
          <textarea rows={2} value={actions.rejectNote} onChange={event => actions.setRejectNote(event.target.value)} aria-required />
        </Field><div className="task-detail__panel-btns">
          <button type="button" className="btn btn--danger btn--sm" disabled={!actions.rejectNote.trim() || actions.reviewMutation.isPending || (actions.isIdentity ? !actions.canReview : !actions.reviewActorId)} onClick={() => actions.reviewMutation.mutate({ outcome: 'reject', note: actions.rejectNote.trim(), actor: actions.reviewActor() })}>{t('pool.action.rejectConfirm')}</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => actions.setRejectOpen(false)}>{t('pool.cancel')}</button>
        </div></div> : <button type="button" className="btn btn--secondary btn--sm" disabled={actions.isIdentity && !actions.canReview} onClick={() => actions.setRejectOpen(true)}>{t('pool.action.reject')}</button>}
      </div> : null}
      {actions.actionError ? <FormBanner kind="err" message={humanizeFormError(actions.actionError, t, 'pool.action.error')} /> : null}
    </>}
  </div>;
}
