import type { ArtifactRef, GitRepoRef, HubEvent } from '@teamhub/hub-contracts';
import type { OverviewSnapshot } from '../../api/schemas/system';
import type { ConsolePage } from '../../components/layout/ConsoleLayout';
import type { HubApiClient } from '../../api/client';
import { useI18n, type TranslationKey } from '../../i18n';
import { ARTIFACT_KIND_KEY } from '../../constants';
import { MetricTile } from '../../components/MetricTile';
import { CountUpNumber } from '../../components/viz/CountUpNumber';
import { ProgressRing } from '../../components/viz/ProgressRing';
import { StatusDot, type VizTone } from '../../components/viz/StatusDot';
import { BaselineOverview } from './BaselineOverview';

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

// 事件类型 → 时间线圆点 tone（VISUAL-VITALITY V1 §3.4；领域→tone 映射留在 feature 内，
// design-language §3 先例）：消息/技能=绿（人来的信号）、git/发布/归档=蓝（产出信号）、
// 健康/桥状态变化=琥珀（状态迁移，值得一瞥）、系统自检=中性。
const EVENT_TONE: Record<HubEvent['type'], VizTone> = {
  'message.received': 'green',
  'command.received': 'green',
  'skill.requested': 'green',
  'skill.completed': 'green',
  'bridge.status.updated': 'amber',
  'git.push': 'blue',
  'release.created': 'blue',
  'artifact.uploaded': 'blue',
  'adapter.health.changed': 'amber',
  'system.health.checked': 'neutral',
};

/** 事件时间戳 → 本地「MM-DD HH:mm」（mono 数据位，tech 下走等宽栈）。 */
function fmtEventTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface OverviewPageProps {
  client: HubApiClient;
  source: string;
  snapshot: OverviewSnapshot | undefined;
  isLoading: boolean;
  error: unknown;
  onNavigate?: (page: ConsolePage) => void;
}

export function OverviewPage({
  client,
  source,
  snapshot,
  isLoading,
  error,
  onNavigate,
}: OverviewPageProps) {
  const { t } = useI18n();

  // 首屏第一眼 = 倒排基准线「基准线 vs 实际」（BASELINE-CORE S6）：自带 season/baseline/tasks 查询与
  // 加载/空态，独立于下方运维快照（snapshot）——即便快照未就绪，基准线仍先渲染，反之亦然。
  const baselineHero = <BaselineOverview client={client} source={source} />;

  if (isLoading) {
    return (
      <div className="overview-grid">
        {baselineHero}
        <div className="state-band" role="status" aria-live="polite">{t('overview.loading')}</div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="overview-grid">
        {baselineHero}
        <div className="state-band state-band-error" role="alert">{t('overview.unavailable')}</div>
      </div>
    );
  }

  const blocked = snapshot.bridgeMembers.members.filter(
    (member) => member.status === 'blocked',
  ).length;

  return (
    <div className="overview-grid">
      {baselineHero}
      {/* 指标瓦片仪表化（VISUAL-VITALITY V1 §3.3）：呼吸灯/进度环/滚动数字全画真数据；
          呼吸（常驻动效）只给系统灯一处，协作桥灯静态（红=警示不闪、绿=安静）。 */}
      <section className="summary-strip" aria-label={t('overview.section.summary')}>
        <MetricTile
          label={t('overview.metric.system')}
          value={t(HEALTH_KEY[snapshot.health.status])}
          accent="green"
          viz={<StatusDot tone="green" live />}
        />
        <MetricTile
          label={t('overview.metric.adapters')}
          value={`${snapshot.system.adapters.enabled}/${snapshot.system.adapters.total}`}
          accent="blue"
          viz={
            <ProgressRing
              value={snapshot.system.adapters.enabled}
              max={snapshot.system.adapters.total}
              tone="blue"
              size={40}
              label={`${t('overview.metric.adapters')} ${snapshot.system.adapters.enabled}/${snapshot.system.adapters.total}`}
            />
          }
        />
        <MetricTile
          label={t('overview.metric.bridge')}
          value={t('overview.blocked', { n: blocked })}
          accent={blocked > 0 ? 'red' : 'green'}
          viz={<StatusDot tone={blocked > 0 ? 'red' : 'green'} />}
        />
        <MetricTile
          label={t('overview.metric.repos')}
          value={<CountUpNumber value={snapshot.gitRepos.repos.length} />}
          accent="neutral"
        />
        <MetricTile
          label={t('overview.metric.artifacts')}
          value={<CountUpNumber value={snapshot.artifacts.artifacts.length} />}
          accent="neutral"
        />
      </section>

      {/* 集成详情已移到设置页（INTEGRATIONS-TO-SETTINGS）：总览只留一行入口，主体精简到指标 + 最近事件。 */}
      <div className="overview-integrations-hint">
        <HintLink label={t('overview.integrations.toSettings')} page="settings" onNavigate={onNavigate} />
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
          <HintLink label={t('overview.artifacts.toArchive')} page="archive" onNavigate={onNavigate} />
        </div>
      </section>
    </div>
  );
}

/** Renders a navigation button when onNavigate is provided, otherwise a plain span. */
function HintLink({
  label,
  page,
  onNavigate,
}: {
  label: string;
  page?: ConsolePage;
  onNavigate?: (page: ConsolePage) => void;
}) {
  if (onNavigate && page) {
    return (
      <button type="button" className="link-button" onClick={() => onNavigate(page)}>
        {label}
      </button>
    );
  }
  return <span>{label}</span>;
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
  const time = fmtEventTime(event.createdAt);
  return (
    <article className="data-row data-row--event">
      <StatusDot tone={EVENT_TONE[event.type]} />
      <div className="data-row__main">
        <strong>{t(EVENT_TYPE_KEY[event.type])}</strong>
        <span>{event.source}</span>
      </div>
      {time ? (
        <time className="data-row__time" dateTime={event.createdAt}>
          {time}
        </time>
      ) : null}
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
        {t(ARTIFACT_KIND_KEY[artifact.kind])}
        {artifact.uri ? ` / ${artifact.uri}` : ''}
      </span>
    </article>
  );
}
