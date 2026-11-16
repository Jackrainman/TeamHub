import { useEffect, useState } from 'react';
import type { BaselineMilestonePublic, MemberPublic, Project, Season } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import { SideDrawer } from '../../../components/SideDrawer';
import { useI18n } from '../../../i18n';
import { memberOptionLabel } from '../../../shared/lib/identity-utils';
import { Select } from '../../../shared/ui/Select';
import { useCalendarParticipantMutation } from './hooks';
import { dateKeyOf, dayNumber, STAGE_LABEL_KEYS } from './model';

export type CalendarSelection =
  | { type: 'project'; project: Project }
  | { type: 'milestone'; milestone: BaselineMilestonePublic; season: Season | null };

export function CalendarDrawer({
  selection,
  today,
  canWrite,
  client,
  members,
  me,
  canManageParticipants,
  onClose,
  onNavigateSettings,
}: {
  selection: CalendarSelection | null;
  today: string;
  canWrite: boolean;
  client: HubApiClient;
  members: MemberPublic[];
  me: string | null;
  canManageParticipants: boolean;
  onClose: () => void;
  onNavigateSettings: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const title = selection?.type === 'project'
    ? selection.project.name
    : selection ? `${t('calendar.drawer.milestone')} · ${selection.milestone.title}` : '';
  return <SideDrawer open={selection !== null} onClose={onClose} title={title}>
    {selection?.type === 'project' ? <>
      <ProjectDetails project={selection.project} today={today} />
      <ProjectParticipants
        project={selection.project}
        client={client}
        members={members}
        me={me}
        canManage={canManageParticipants}
      />
    </> : null}
    {selection?.type === 'milestone' ? <dl className="calendar-details">
      <Detail label={t('calendar.drawer.milestone')} value={selection.milestone.title} />
      <Detail label={t('calendar.drawer.season')} value={selection.season?.name ?? '—'} />
      <Detail label={t('calendar.drawer.kind')} value={t(`calendar.drawer.kind.${selection.milestone.kind}`)} />
      <Detail label={t('calendar.drawer.plannedAt')} value={selection.milestone.plannedAt.slice(0, 10)} />
      <Detail label={t('calendar.drawer.stage')} value={selection.milestone.stage ? t(STAGE_LABEL_KEYS[selection.milestone.stage]) : '—'} />
      <Detail label={t('calendar.drawer.version')} value={selection.milestone.robotVersion ?? '—'} />
      <Detail label={t('calendar.drawer.status')} value={t(`calendar.drawer.status.${selection.milestone.status}`)} />
      {selection.milestone.note ? <Detail label={t('calendar.drawer.note')} value={selection.milestone.note} /> : null}
    </dl> : null}
    {canWrite ? <button type="button" className="btn" onClick={onNavigateSettings}>{t('calendar.drawer.editInSettings')}</button> : null}
  </SideDrawer>;
}

function ProjectDetails({ project, today }: { project: Project; today: string }): JSX.Element {
  const { t } = useI18n();
  const start = dateKeyOf(project.startsAt);
  const end = dateKeyOf(project.endsAt);
  const duration = start ? dayNumber(end ?? today) - dayNumber(start) + 1 : null;
  return <dl className="calendar-details">
    <Detail label={t('calendar.drawer.project')} value={project.name} />
    <Detail label={t('calendar.drawer.range')} value={`${start ?? t('calendar.noStart')} → ${end ?? t('calendar.ongoing')}`} />
    {duration !== null && duration > 0 ? <Detail label={t('calendar.drawer.duration', { days: duration })} value={`${duration}`} /> : null}
  </dl>;
}

function ProjectParticipants({ project, client, members, me, canManage }: {
  project: Project;
  client: HubApiClient;
  members: MemberPublic[];
  me: string | null;
  canManage: boolean;
}): JSX.Element {
  const { t } = useI18n();
  const [candidateId, setCandidateId] = useState('');
  const mutation = useCalendarParticipantMutation(client);
  const participantIds = project.memberIds ?? [];
  const candidates = members.filter(member => !participantIds.includes(member.id));

  useEffect(() => {
    setCandidateId('');
    mutation.reset();
  }, [project.id]);

  function save(memberIds: string[], clearCandidate = false): void {
    mutation.mutate({ projectId: project.id, memberIds }, {
      onSuccess: () => {
        if (clearCandidate) setCandidateId('');
      },
    });
  }

  return <section className="calendar-participants">
    <p className="calendar-participants-title">{t('calendar.drawer.participants')}</p>
    {participantIds.length > 0 ? <ul className="calendar-participant-list">
      {participantIds.map(memberId => {
        const name = memberOptionLabel(members, memberId);
        return <li className="calendar-participant-chip" key={memberId} data-current={memberId === me || undefined}>
          <span>{name}</span>
          {canManage ? <button
            type="button"
            className="calendar-participant-remove"
            aria-label={t('calendar.drawer.participants.remove', { name })}
            disabled={mutation.isPending}
            onClick={() => save(participantIds.filter(id => id !== memberId))}
          >×</button> : null}
        </li>;
      })}
    </ul> : <p className="calendar-participants-empty">{t('calendar.drawer.participants.empty')}</p>}
    {canManage ? <div className="calendar-participant-controls">
      <Select
        aria-label={t('calendar.drawer.participants')}
        value={candidateId}
        disabled={mutation.isPending}
        onChange={event => {
          setCandidateId(event.target.value);
          mutation.reset();
        }}
      >
        <option value="">{t('calendar.drawer.participants.select')}</option>
        {candidates.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}
      </Select>
      <button
        type="button"
        className="btn"
        disabled={!candidateId || mutation.isPending}
        onClick={() => save([...participantIds, candidateId], true)}
      >{t('calendar.drawer.participants.add')}</button>
    </div> : null}
    {mutation.isError ? <p className="calendar-participants-error" role="alert">{t('calendar.drawer.participants.error')}</p> : null}
  </section>;
}

function Detail({ label, value }: { label: string; value: string }): JSX.Element {
  return <><dt>{label}</dt><dd>{value}</dd></>;
}
