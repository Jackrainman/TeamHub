import { useEffect, useState, type Dispatch } from 'react';
import { deriveTaskAcceptance } from '@teamhub/hub-contracts';
import { Inbox, Plus } from 'lucide-react';
import { Field } from '../../../../components/Field';
import { FormActions } from '../../../../components/FormActions';
import { FormGrid } from '../../../../components/FormGrid';
import { useI18n } from '../../../../i18n';
import { segClass } from '../../../../utils';
import { TaskFacts } from '../../sub/TaskFacts';
import { TaskTimeline } from '../../sub/TaskTimeline';
import { WeekTaskCard } from '../../week/WeekTaskCard';
import {
  TUTORIAL_OWNER_ID,
  TUTORIAL_REVIEWER_ID,
  TUTORIAL_TASK_SUMMARY,
  TUTORIAL_TASK_TITLE,
  tutorialGroup,
  tutorialMembers,
} from '../fixtures';
import type { TaskTutorialAction, TaskTutorialState } from '../tutorial-machine';

export function TutorialScene({ state, dispatch }: {
  state: TaskTutorialState;
  dispatch: Dispatch<TaskTutorialAction>;
}) {
  const { t } = useI18n();
  const [rejectReason, setRejectReason] = useState('');
  useEffect(() => {
    if (state.phase === 'intro') setRejectReason('');
  }, [state.phase]);

  const acceptance = state.task ? deriveTaskAcceptance(state.task, state.task.isBig) : 'notDone';
  const formOpen = state.phase === 'reviewer' || state.phase === 'submit';
  const canSwitchOwner = state.phase === 'rejectSwitchOwner';
  const canSwitchReviewer = state.phase === 'switchReviewer' || state.phase === 'rejectSwitchReviewer';

  return <div className="task-tutorial__scene week-workspace">
    <div className="task-tutorial__rolebar" aria-label={t('taskTutorial.role')}>
      <span>{t('taskTutorial.role')}</span>
      <div className="seg" role="group" aria-label={t('taskTutorial.role')}>
        <button type="button" data-tutorial-target="owner-role" className={segClass(state.actorId === TUTORIAL_OWNER_ID)}
          aria-pressed={state.actorId === TUTORIAL_OWNER_ID} disabled={!canSwitchOwner}
          onClick={() => dispatch({ type: 'switchActor', memberId: TUTORIAL_OWNER_ID })}>
          {t('taskTutorial.ownerRole')}
        </button>
        <button type="button" data-tutorial-target="reviewer-role" className={segClass(state.actorId === TUTORIAL_REVIEWER_ID)}
          aria-pressed={state.actorId === TUTORIAL_REVIEWER_ID} disabled={!canSwitchReviewer}
          onClick={() => dispatch({ type: 'switchActor', memberId: TUTORIAL_REVIEWER_ID })}>
          {t('taskTutorial.reviewerRole')}
        </button>
      </div>
    </div>

    <header className="week-header">
      <div><h2>{t('team.title')}</h2><p className="week-note">{t('taskTutorial.subtitle')}</p></div>
      <button type="button" className="btn btn--primary" data-tutorial-target="create"
        disabled={state.phase !== 'create'} onClick={() => dispatch({ type: 'openCreate' })}>
        <Plus size={16} aria-hidden="true" />{t('week.selfReport')}
      </button>
    </header>

    {formOpen ? <form className="week-form card task-tutorial__form" onSubmit={event => {
      event.preventDefault();
      dispatch({ type: 'submit' });
    }}>
      <p className="week-note">{t('taskTutorial.formHint')}</p>
      <FormGrid>
        <Field label={t('week.group')}><input value={tutorialGroup.name} readOnly /></Field>
        <Field label={t('week.taskTitle')}><input value={TUTORIAL_TASK_TITLE} readOnly /></Field>
        <Field label={t('week.summary')} className="span-all"><textarea rows={3} value={TUTORIAL_TASK_SUMMARY} readOnly /></Field>
      </FormGrid>
      <Field label={t('team.reviewers')} hint={t('taskTutorial.reviewerRequired')} required as="fieldset">
        <div data-tutorial-target="reviewer" className="task-tutorial__reviewer">
          <label><input type="checkbox" checked={state.selectedReviewerIds.includes(TUTORIAL_REVIEWER_ID)}
            disabled={state.phase !== 'reviewer'}
            onChange={() => dispatch({ type: 'toggleReviewer', memberId: TUTORIAL_REVIEWER_ID })} />
            {tutorialMembers.find(member => member.id === TUTORIAL_REVIEWER_ID)?.displayName} · {tutorialGroup.name}
          </label>
        </div>
      </Field>
      <div data-tutorial-target="submit" className="task-tutorial__submit">
        <FormActions submitLabel={t('week.submit')} submittingLabel={t('week.saving')}
          submitting={false} disabled={state.phase !== 'submit'} />
      </div>
    </form> : null}

    {state.task ? <div className="task-grid task-grid--3 task-tutorial__grid">
      <div data-tutorial-target="open-task">
        <WeekTaskCard task={state.task} members={tutorialMembers} groupName={tutorialGroup.name}
          onOpen={() => dispatch({ type: 'openDetail' })}>
          {(state.phase === 'complete' || state.phase === 'completeAgain') ? <button type="button"
            className="btn btn--secondary btn--sm" data-tutorial-target="complete"
            onClick={() => dispatch({ type: 'complete' })}>{t('pool.action.complete')}</button> : null}
        </WeekTaskCard>
      </div>
    </div> : <div className="empty-state task-tutorial__empty"><Inbox size={30} aria-hidden="true" /><p>{t('taskTutorial.noTask')}</p></div>}

    {state.detailOpen && state.task ? <section className="card task-tutorial__detail" aria-label={t('week.details')}>
      <h3>{state.task.title}</h3>
      <TaskFacts task={state.task} members={tutorialMembers} acceptance={acceptance} />
      {acceptance === 'awaitingReview' ? <p className="task-tutorial__notice">{t('taskTutorial.pendingNotice')}</p> : null}
      {acceptance === 'accepted' ? <p className="task-tutorial__notice task-tutorial__notice--accepted">{t('taskTutorial.acceptedNotice')}</p> : null}
      {state.phase === 'review' ? <button type="button" className="btn btn--primary" data-tutorial-target="accept"
        onClick={() => dispatch({ type: 'accept' })}>{t('taskTutorial.accept')}</button> : null}
      {state.rejectOpen ? <form className="task-tutorial__reject" data-tutorial-target="reject" onSubmit={event => {
        event.preventDefault();
        dispatch({ type: 'reject', reason: rejectReason });
      }}>
        <Field label={t('pool.action.rejectReason')} required>
          <textarea rows={3} value={rejectReason} onChange={event => setRejectReason(event.target.value)} required autoFocus />
        </Field>
        <button type="submit" className="btn btn--danger" disabled={!rejectReason.trim()}>{t('pool.action.rejectConfirm')}</button>
      </form> : null}
      <TaskTimeline task={state.task} members={tutorialMembers} />
    </section> : null}
  </div>;
}
