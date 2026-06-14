import type {
  AdapterDescriptor,
  ArtifactRef,
  BridgeMemberState,
  GitRepoRef,
  HubEvent,
} from '@teamhub/hub-contracts';
import type { OverviewSnapshot } from '../../api/schemas/system';
import { useI18n } from '../../i18n';

interface OverviewPageProps {
  snapshot: OverviewSnapshot | undefined;
  isLoading: boolean;
  error: unknown;
}

export function OverviewPage({ snapshot, isLoading, error }: OverviewPageProps) {
  const { t } = useI18n();

  if (isLoading) {
    return <div className="state-band">{t('overview.loading')}</div>;
  }

  if (error || !snapshot) {
    return (
      <div className="state-band state-band-error">{t('overview.unavailable')}</div>
    );
  }

  const blocked = snapshot.bridgeMembers.members.filter(
    (member) => member.status === 'blocked',
  ).length;

  return (
    <div className="overview-grid">
      <section className="summary-strip" aria-label="System summary">
        <Metric
          label={t('overview.metric.system')}
          value={snapshot.health.status.toUpperCase()}
        />
        <Metric
          label={t('overview.metric.adapters')}
          value={`${snapshot.system.adapters.enabled}/${snapshot.system.adapters.total}`}
        />
        <Metric
          label={t('overview.metric.bridge')}
          value={t('overview.blocked', { n: blocked })}
        />
        <Metric
          label={t('overview.metric.repos')}
          value={`${snapshot.gitRepos.repos.length}`}
        />
        <Metric
          label={t('overview.metric.artifacts')}
          value={`${snapshot.artifacts.artifacts.length}`}
        />
      </section>

      <section className="panel panel-wide">
        <PanelHeader
          title={t('overview.panel.adapters')}
          meta={t('overview.meta.unconfigured', {
            n: snapshot.system.adapters.unconfigured,
          })}
        />
        <div className="adapter-grid">
          {snapshot.adapters.adapters.map((adapter) => (
            <AdapterRow adapter={adapter} key={adapter.id} />
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader
          title={t('overview.panel.events')}
          meta={t('overview.meta.events', { n: snapshot.events.events.length })}
        />
        <div className="stack-list">
          {snapshot.events.events.map((event) => (
            <EventRow event={event} key={event.id} />
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader
          title={t('overview.panel.bridge')}
          meta={t('overview.meta.members', {
            n: snapshot.bridgeMembers.members.length,
          })}
        />
        <div className="stack-list">
          {snapshot.bridgeMembers.members.map((member) => (
            <BridgeRow member={member} key={member.memberId} />
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader
          title={t('overview.panel.gitRepos')}
          meta={t('overview.meta.indexed', { n: snapshot.gitRepos.repos.length })}
        />
        <div className="stack-list">
          {snapshot.gitRepos.repos.map((repo) => (
            <RepoRow repo={repo} key={repo.id} />
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader
          title={t('overview.panel.artifacts')}
          meta={t('overview.meta.indexed', {
            n: snapshot.artifacts.artifacts.length,
          })}
        />
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
      <span>
        {member.status}
        {member.blockedOn ? ` - ${member.blockedOn}` : ''}
      </span>
    </article>
  );
}

function RepoRow({ repo }: { repo: GitRepoRef }) {
  const { t } = useI18n();
  return (
    <article className="data-row">
      <strong>{repo.name}</strong>
      <span>
        {repo.forge ?? t('overview.unknown')} / {repo.defaultBranch}
      </span>
    </article>
  );
}

function ArtifactRow({ artifact }: { artifact: ArtifactRef }) {
  return (
    <article className="data-row">
      <strong>{artifact.name}</strong>
      <span>
        {artifact.kind} / {artifact.uri}
      </span>
    </article>
  );
}

function StatusPill({ status }: { status: AdapterDescriptor['status'] }) {
  return <span className={`status-pill status-${status}`}>{status}</span>;
}
