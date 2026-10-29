import type { HubApiClient } from '../../api/client';
import type { ConsolePage, PageIdentityCtx } from '../../console-pages';
import { WeekWorkspace } from '../pm/week/WeekWorkspace';

export function WorkbenchPage({ client, source, projectId, identity }: {
  client: HubApiClient; source: string; projectId: string; identity: PageIdentityCtx;
  onNavigate: (page: ConsolePage) => void; availablePages?: ConsolePage[];
}) {
  return <WeekWorkspace client={client} source={source} projectId={projectId} identity={identity} />;
}
