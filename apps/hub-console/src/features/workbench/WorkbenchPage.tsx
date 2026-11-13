import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { WeekWorkspace } from '../pm/week/WeekWorkspace';

// 任务页（四页成品里的工作台）：本周任务 + 自报 + 详情抽屉，页内无跨页跳转。
export function WorkbenchPage({ client, source, projectId, identity }: {
  client: HubApiClient; source: string; projectId: string; identity: PageIdentityCtx;
}) {
  return <WeekWorkspace client={client} source={source} projectId={projectId} identity={identity} />;
}
