import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { WeekWorkspace } from '../pm/week/WeekWorkspace';

export function WorkbenchPage({ client, source, identity }: {
  client: HubApiClient; source: string; identity: PageIdentityCtx;
}) {
  return <WeekWorkspace client={client} source={source} identity={identity} />;
}
