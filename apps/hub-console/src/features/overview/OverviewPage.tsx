import type {
  AdapterDescriptor,
  ArtifactRef,
  BridgeMemberState,
  GitRepoRef,
  HubEvent,
} from '@teamhub/hub-contracts';
import type { OverviewSnapshot } from '../../api/schemas/system';

interface OverviewPageProps {
  snapshot: OverviewSnapshot | undefined;
  isLoading: boolean;
  error: unknown;
}

export function OverviewPage({
  snapshot,
  isLoading,
  error,
}: OverviewPageProps) {
  if (isLoading) {
    return <div className="state-band">Loading console state</div>;
  }

  if (error || !snapshot) {
    return <div className="state-band state-band-error">Console state unavailable</div>;
  }

  return (
    <div className="overview-grid">
      <section className="summary-strip" aria-label="System summary">
        <Metric label="System" value={snapshot.health.status.toUpperCase()} />
        <Metric label="Adapters" value={`${snapshot.system.adapters.enabled}/${snapshot.system.adapters.total}`} />
        <Metric label="Bridge" value={`${blockedMembers(snapshot.bridgeMembers.members)}`} />
        <Metric label="Repos" value={`${snapshot.gitRepos.repos.length}`} />
        <Metric label="Artifacts" value={`${snapshot.artifacts.artifacts.length}`} />
      </section>

      <section className="panel panel-wide">
        <PanelHeader title="Adapters" meta={`${snapshot.system.adapters.unconfigured} unconfigured`} />
        <div className="adapter-grid">
          {snapshot.adapters.adapters.map((adapter) => (
            <AdapterRow adapter={adapter} key={adapter.id} />
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader title="Recent Events" meta={`${snapshot.events.events.length} events`} />
        <div className="stack-list">
          {snapshot.events.events.map((event) => (
            <EventRow event={event} key={event.id} />
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader title="Bridge" meta={`${snapshot.bridgeMembers.members.length} members`} />
        <div className="stack-list">
          {snapshot.bridgeMembers.members.map((member) => (
            <BridgeRow member={member} key={member.memberId} />
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader title="Git Repos" meta={`${snapshot.gitRepos.repos.length} indexed`} />
        <div className="stack-list">
          {snapshot.gitRepos.repos.map((repo) => (
            <RepoRow repo={repo} key={repo.id} />
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader title="Artifacts" meta={`${snapshot.artifacts.artifacts.length} indexed`} />
        <div className="stack-list">
          {snapshot.artifacts.artifacts.map((artifact) => (
            <ArtifactRow artifact={artifact} key={artifact.id} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <span>{meta}</span>
    </div>
  );
}

function AdapterRow({ adapter }: { adapter: AdapterDescriptor }) {
  return (
    <article className="adapter-row">
      <div>
        <strong>{adapter.displayName}</strong>
        <span>{adapter.capabilities.join(', ')}</span>
      </div>
      <StatusPill status={adapter.status} />
    </article>
  );
}

function EventRow({ event }: { event: HubEvent }) {
  return (
    <article className="data-row">
      <strong>{event.type}</strong>
      <span>{event.source}</span>
    </article>
  );
}

function BridgeRow({ member }: { member: BridgeMemberState }) {
  return (
    <article className="data-row">
      <strong>{member.displayName}</strong>
      <span>{member.status}{member.blockedOn ? ` - ${member.blockedOn}` : ''}</span>
    </article>
  );
}

function RepoRow({ repo }: { repo: GitRepoRef }) {
  return (
    <article className="data-row">
      <strong>{repo.name}</strong>
      <span>{repo.forge ?? 'unknown'} / {repo.defaultBranch}</span>
    </article>
  );
}

function ArtifactRow({ artifact }: { artifact: ArtifactRef }) {
  return (
    <article className="data-row">
      <strong>{artifact.name}</strong>
      <span>{artifact.kind} / {artifact.uri}</span>
    </article>
  );
}

function StatusPill({ status }: { status: AdapterDescriptor['status'] }) {
  return <span className={`status-pill status-${status}`}>{status}</span>;
}

function blockedMembers(members: BridgeMemberState[]): string {
  const blocked = members.filter((member) => member.status === 'blocked').length;
  return blocked === 0 ? '0 blocked' : `${blocked} blocked`;
}
