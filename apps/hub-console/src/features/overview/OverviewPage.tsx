import type {
  AdapterDescriptor,
  ArtifactRef,
  BridgeMemberState,
  GitRepoRef,
  HubEvent,
} from '@teamhub/hub-contracts';
import type { OverviewSnapshot } from '../../api/schemas/system';
import { useI18n, type TranslationKey } from '../../i18n';

// 后端枚举 → 文案键（类型安全：枚举变更会在此处编译报错）。仅翻译状态/类型等「界面语义」，
// 用户数据（displayName / uri / branch / capabilities 等）保持后端原样。
const HEALTH_KEY: Record<OverviewSnapshot['health']['status'], TranslationKey> = {
  ok: 'enum.health.ok',
};

const ADAPTER_STATUS_KEY: Record<AdapterDescriptor['status'], TranslationKey> = {
  enabled: 'enum.adapter.enabled',
  disabled: 'enum.adapter.disabled',
  degraded: 'enum.adapter.degraded',
  unconfigured: 'enum.adapter.unconfigured',
};

const MEMBER_STATUS_KEY: Record<BridgeMemberState['status'], TranslationKey> = {
  idle: 'enum.member.idle',
  working: 'enum.member.working',
  blocked: 'enum.member.blocked',
  offline: 'enum.member.offline',
};

const EVENT_TYPE_KEY: Record<HubEvent['type'], TranslationKey> = {
  'message.received': 'enum.event.message.received',
  'command.received': 'enum.event.command.received',
  'skill.requested': 'enum.event.skill.requested',
  'skill.completed': 'enum.event.skill.completed',
  'bridge.status.updated': 'enum.event.bridge.status.updated',
  'git.push': 'enum.event.git.push',
  'release.created': 'enum.event.release.created',
  'artifact.uploaded': 'enum.event.artifact.uploaded',
  'adapter.health.changed': 'enum.event.adapter.health.changed',
  'system.health.checked': 'enum.event.system.health.checked',
};

const ARTIFACT_KIND_KEY: Record<ArtifactRef['kind'], TranslationKey> = {
  firmware: 'enum.artifact.firmware',
  log: 'enum.artifact.log',
  rosbag: 'enum.artifact.rosbag',
  image: 'enum.artifact.image',
  video: 'enum.artifact.video',
  report: 'enum.artifact.report',
  other: 'enum.artifact.other',
};

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
      <section className="summary-strip" aria-label={t('overview.section.summary')}>
        <Metric
          label={t('overview.metric.system')}
          value={t(HEALTH_KEY[snapshot.health.status])}
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
  const { t } = useI18n();
  return (
    <article className="data-row">
      <strong>{t(EVENT_TYPE_KEY[event.type])}</strong>
      <span>{event.source}</span>
    </article>
  );
}

function BridgeRow({ member }: { member: BridgeMemberState }) {
  const { t } = useI18n();
  return (
    <article className="data-row">
      <strong>{member.displayName}</strong>
      <span>
        {t(MEMBER_STATUS_KEY[member.status])}
        {member.blockedOn ? ` · ${member.blockedOn}` : ''}
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
  const { t } = useI18n();
  return (
    <article className="data-row">
      <strong>{artifact.name}</strong>
      <span>
        {t(ARTIFACT_KIND_KEY[artifact.kind])} / {artifact.uri}
      </span>
    </article>
  );
}

function StatusPill({ status }: { status: AdapterDescriptor['status'] }) {
  const { t } = useI18n();
  return (
    <span className={`status-pill status-${status}`}>
      {t(ADAPTER_STATUS_KEY[status])}
    </span>
  );
}
