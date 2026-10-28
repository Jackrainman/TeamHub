import { useMemo } from 'react';
import type { HubApiClient } from '../../../api/client';
import { useI18n } from '../../../i18n';
import { useSeasons, useTasks } from '../../pm/hooks';
import { useBaseline } from '../../baseline';
import { CONVERGENCE_SCOPE_ALL_LEAF_GROUPS, deriveRobotStageMarkers, deriveStageProgress, type StagePipelineStage } from '@teamhub/hub-contracts';
const STAGE_I18N_KEY: Record<StagePipelineStage, Parameters<ReturnType<typeof useI18n>['t']>[0]> = {
  moduleDesign: 'workbench.stage.moduleDesign',
  moduleAssembly: 'workbench.stage.moduleAssembly',
  moduleTest: 'workbench.stage.moduleTest',
  integratedAssembly: 'workbench.stage.integratedAssembly',
  integratedTest: 'workbench.stage.integratedTest',
  convergence: 'workbench.stage.convergence',
};

/**
 * 整车六阶段时间线（STAGE-PIPELINE Step2）：deriveStageProgress 精确派生——里程碑挂可选
 * stage 字段即进精确模式（窗口=该阶段里程碑 plannedAt 区间，状态=里程碑结论投影）；存量
 * 零标签板自动回退 Step1 phases 近似映射。时间线样式 = 节点+连线+日期窗；车徽标（V1/V2/V3）
 * 落在「该车最早 pending 里程碑」所属段 = 「当前 V1 车状态在这里」（纯派生，非 robot 实体
 * 字段）。「待联调」段附总联调任务计数（CONVERGENCE-TASK-ENTRY 咬合）。
 */
export function StagePipelineStrip({ client, source }: { client: HubApiClient; source: string }) {
  const { t } = useI18n();
  const now = useMemo(() => new Date().toISOString(), []);
  const seasonsQuery = useSeasons(client);
  const activeSeason = useMemo(() => {
    const seasons = seasonsQuery.data?.seasons ?? [];
    return seasons.find((s) => s.status === 'active') ?? seasons[0];
  }, [seasonsQuery.data]);
  const baselineQuery = useBaseline(client, source, activeSeason?.id);
  const baseline = baselineQuery.data?.baseline ?? null;

  const tasksQuery = useTasks(client, source);
  const convergence = useMemo(() => {
    const list = (tasksQuery.data?.tasks ?? []).filter(
      (tk) => tk.convergenceScope === CONVERGENCE_SCOPE_ALL_LEAF_GROUPS,
    );
    return { done: list.filter((tk) => tk.status === 'done').length, total: list.length };
  }, [tasksQuery.data]);

  if (!baseline) return null;
  const stages = deriveStageProgress(
    baseline.milestones,
    baseline.phases,
    baseline.anchors.competitionDate,
    now,
  );
  if (!stages) {
    return <p className="workbench-note">{t('workbench.stage.empty')}</p>;
  }
  const markers = deriveRobotStageMarkers(baseline.milestones, stages);
  const fmt = (iso: string) => iso.slice(5, 10);
  return (
    <>
      <div className="workbench-timeline" role="list" aria-label={t('workbench.stage.title')}>
        {stages.map((s, i) => {
          const here = markers.filter((m) => m.stageIndex === i);
          return (
            <div
              className={`workbench-tl-stage workbench-tl-stage--${s.status}`}
              role="listitem"
              key={s.stage}
              aria-current={s.status === 'current' ? 'step' : undefined}
            >
              <span className="workbench-tl-dot" aria-hidden="true" />
              <span className="workbench-tl-name">{t(STAGE_I18N_KEY[s.stage])}</span>
              <span className="workbench-tl-dates">
                {fmt(s.startsAt)} – {fmt(s.endsAt)}
              </span>
              {s.stage === 'convergence' && convergence.total > 0 ? (
                <span className="workbench-tl-sub">
                  {t('workbench.stage.convergenceTasks', {
                    done: convergence.done,
                    total: convergence.total,
                  })}
                </span>
              ) : null}
              {here.length > 0 ? (
                <span className="workbench-tl-robots">
                  {here.map((m) => (
                    <span
                      className={`workbench-robot-chip${m.allPassed ? ' workbench-robot-chip--passed' : ''}`}
                      key={m.robotVersion}
                      title={
                        m.allPassed
                          ? t('workbench.stage.allPassed', { v: m.robotVersion })
                          : t('workbench.stage.here', { v: m.robotVersion, title: m.milestoneTitle })
                      }
                    >
                      {m.robotVersion}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {markers.length > 0 ? (
        <p className="workbench-tl-legend">{t('workbench.stage.legend')}</p>
      ) : null}
    </>
  );
}
