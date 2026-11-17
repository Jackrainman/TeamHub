import type { Group, MemberPublic } from '@teamhub/hub-contracts';
import { SideDrawer } from '../../../components/SideDrawer';
import { useI18n } from '../../../i18n';
import { SelfReportForm } from '../week/SelfReportForm';
import { useWeekActions } from '../hooks';
import type { HubApiClient } from '../../../api/client';

export function CalendarTaskDrawer({ client, open, week, groups, members, memberId, onClose }: {
  client: HubApiClient; open: boolean; week: string; groups: Group[]; members: MemberPublic[];
  memberId: string; onClose: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const actions = useWeekActions(client, onClose);
  return <SideDrawer open={open} onClose={onClose} title={t('calendar.task.create')}>
    {open && memberId ? <SelfReportForm groups={groups} defaultGroupId={groups[0]?.id} members={members} memberId={memberId}
      pending={actions.create.isPending} onSubmit={input => actions.create.mutate({ weekKey: week, input })} /> : null}
  </SideDrawer>;
}
