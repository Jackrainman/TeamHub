import type { HubApiClient } from '../../../api/client';
import type { ConsolePage, PageIdentityCtx } from '../../../console-pages';
import { BaselineOverview } from '../BaselineOverview';
import { ReportCountdownSection } from './ReportCountdownSection';
import { ProgressStripSection } from './ProgressStripSection';
import { StagePipelineStrip } from './StagePipelineStrip';

export function SeasonOverview({ client, source, identity, onNavigate }: {
  client: HubApiClient; source: string; identity: PageIdentityCtx; onNavigate?: (page: ConsolePage) => void;
}) {
  return <section className="overview-season">
    <ReportCountdownSection client={client} source={source} />
    <ProgressStripSection client={client} source={source} identity={identity} onNavigate={onNavigate} />
    <StagePipelineStrip client={client} source={source} />
    <BaselineOverview client={client} baselineClient={client} source={source} identity={identity} />
  </section>;
}
