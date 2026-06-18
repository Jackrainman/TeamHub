import type { ArtifactRef, GitRepoRef, HubEvent } from '@teamhub/hub-contracts';
import type { OverviewSnapshot } from '../../api/schemas/system';
import type { ConsolePage } from '../../components/layout/ConsoleLayout';
import { useI18n, type TranslationKey } from '../../i18n';

// 后端枚举 → 文案键（类型安全：枚举变更会在此处编译报错）。仅翻译状态/类型等「界面语义」，
// 用户数据（displayName / uri / branch / capabilities 等）保持后端原样。
const HEALTH_KEY: Record<OverviewSnapshot['health']['status'], TranslationKey> = {
  ok: 'enum.health.ok',
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
  onNavigate?: (page: ConsolePage) => void;
}

export function OverviewPage({
  snapshot,
  isLoading,
  error,
  onNavigate,
}: OverviewPageProps) {
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

      {/* 集成详情已移到设置页（INTEGRATIONS-TO-SETTINGS）：总览只留一行入口，主体精简到指标 + 最近事件。 */}
      <div className="overview-integrations-hint">
        {onNavigate ? (
          <button
            type="button"
            className="link-button"
            onClick={() => onNavigate('settings')}
          >
            {t('overview.integrations.toSettings')}
          </button>
        ) : (
          <span>{t('overview.integrations.toSettings')}</span>
        )}
      </div>

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

      {/* 成员状态面板（逐人 空闲/在忙/被卡/离线）已隐藏（2026-06-18，用户决定，I0）：
          逐人状态广播给所有人 = 与「不抓摸鱼」原则冲突；属三支柱之前的旧脚手架、非主线。
          后续若做「登录/权限区分各人能力并显著标明」再评估恢复。
          GET /api/bridge/members 端点+schema 保留但已无消费方（部署前若不恢复应一并移除）。 */}

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
        <div className="overview-integrations-hint">
          {onNavigate ? (
            <button
              type="button"
              className="link-button"
              onClick={() => onNavigate('archive')}
            >
              {t('overview.artifacts.toArchive')}
            </button>
          ) : (
            <span>{t('overview.artifacts.toArchive')}</span>
          )}
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

function EventRow({ event }: { event: HubEvent }) {
  const { t } = useI18n();
  return (
    <article className="data-row">
      <strong>{t(EVENT_TYPE_KEY[event.type])}</strong>
      <span>{event.source}</span>
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
