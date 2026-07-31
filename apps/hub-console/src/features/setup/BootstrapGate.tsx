import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { GroupLeadConfirm } from '../settings/GroupLeadConfirm';
import { WIZARD_STEP_META, WIZARD_STEP_ORDER, WIZARD_STEP_TOTAL, type Step } from './setup-utils';
import { WhoStep } from './WhoStep';
import { RosterStep } from './RosterStep';
import { SeasonStep } from './SeasonStep';
import { FleetStep } from './FleetStep';
import { InventoryStep } from './InventoryStep';
import { KbStep } from './KbStep';

// Re-export public symbols for backward compatibility (tests import from this path).
export {
  WIZARD_STEP_TOTAL,
  WIZARD_STEP_META,
  WIZARD_STEP_ORDER,
  WHO_GRADE_OPTIONS,
  FLEET_ROBOT_TARGETS,
  FLEET_STATUS_KEY,
  KB_DOC_ACCEPT,
  suggestSeasonForm,
  seasonAnchorsComplete,
  seasonFormSubmittable,
  seasonNameYear,
  buildSeasonCreateRequest,
  submitSeasonStep,
  suggestFleetSeasonCode,
  newFleetRow,
  isFleetRowBlank,
  fleetRowsSubmittable,
  buildFleetBatchRequest,
  fleetImportRowsToBatch,
  kbImportReportCounts,
} from './setup-utils';
export type { SeasonForm, FleetInitStatus, FleetRow } from './setup-utils';

/**
 * 全屏初始化门（SETUP-WIZARD-ROSTER 刀② v2「先问你是谁」，onboarding-pin-deadlock-2026-07-24 §3 刀②）。
 *
 * **出现条件**：identity 模式且名册无任何持「项目管理」旗标成员（ConsoleApp 判定、整屏替换 app shell，
 * 复用 SetupWizard 形态）。匿名 / demo 路径不出现（匿名模式无身份概念；demo fixtures 自带持旗成员）。
 *
 * 流程（完成才进 app）：
 *  ① **你是谁**：姓名 + 所在组 + 组长申报 + 项目管理旗标（默认勾）+ PIN（≥4）→ bootstrap 端点
 *  ② **导入名册 CSV**
 *  ③ **确认各组组长**
 *  ④ **建赛季**
 *  ⑤ **录入车队**
 *  ⑥ **录入库存**
 *  ⑦ **导入知识库**
 *  ⑧ **进 app**
 *
 * 「上一步」（WIZARD-BACK 修复刀）：除首步外各步底部统一回退口；已访问步保持挂载（hidden 隐藏），
 * 回退时已填表单态不丢，已提交数据由步内查询重取回显（known-bugs 2026-07-28 #1）。
 *
 * 反监视 I0：门只收集操作者本人这一行事实 + 组长任命事实 + 车/零件/文档（无成员维度），不做任何按人聚合。
 */
export function BootstrapGate({
  client,
  onDone,
}: {
  client: HubApiClient;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('who');
  // 已访问步集合（WIZARD-BACK 修复刀）：访问过的步保持挂载（hidden 隐藏而非卸载），
  // 「上一步」回退时已填表单态不丢；步内查询（members/seasons/resources…）挂载时才发起，
  // 不提前打未授权端点。
  const [visited, setVisited] = useState<readonly Step[]>(['who']);
  const goTo = (next: Step) => {
    setVisited((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setStep(next);
  };
  const goBack = () => {
    const idx = WIZARD_STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(WIZARD_STEP_ORDER[idx - 1]);
  };
  const membersQuery = useQuery({
    queryKey: ['members', 'bootstrap-gate'],
    queryFn: () => client.getMembers(),
  });
  const groupsQuery = useQuery({
    queryKey: ['groups', 'bootstrap-gate'],
    queryFn: () => client.getGroups(),
  });
  const members = useMemo(
    () => membersQuery.data?.members ?? [],
    [membersQuery.data],
  );
  const groups = useMemo(() => groupsQuery.data?.groups ?? [], [groupsQuery.data]);
  const invalidateRoster = () => {
    void queryClient.invalidateQueries({ queryKey: ['members'] });
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
  };

  return (
    <div className="setup-wizard setup-wizard--center">
      <div className="setup-wizard__inner">
        <header className="setup-wizard__head">
          <p className="eyebrow">{t('toolbar.eyebrow')}</p>
          <h1 className="setup-wizard__title">{t('gate.title')}</h1>
          <p className="setup-wizard__subtitle">{t('gate.subtitle')}</p>
          <p className="setup-wizard__progress">
            {t('gate.progress', {
              n: WIZARD_STEP_META[step].n,
              total: WIZARD_STEP_TOTAL,
              name: t(WIZARD_STEP_META[step].nameKey),
            })}
          </p>
        </header>
        {visited.includes('who') ? (
          <div hidden={step !== 'who'}>
            <WhoStep
              client={client}
              members={members}
              groups={groups}
              onDone={() => {
                // ①完成 = 已持旗已登录：刷新会话与名册（会话 cookie 由服务端签进响应）。
                void queryClient.invalidateQueries({ queryKey: ['session'] });
                invalidateRoster();
                goTo('roster');
              }}
            />
          </div>
        ) : null}
        {visited.includes('roster') ? (
          <div hidden={step !== 'roster'}>
            <RosterStep client={client} groups={groups} onNext={() => goTo('leads')} />
          </div>
        ) : null}
        {visited.includes('leads') ? (
          <div hidden={step !== 'leads'}>
            {membersQuery.isLoading || groupsQuery.isLoading ? (
              <p className="settings-desc" role="status" aria-live="polite">…</p>
            ) : (
              <section className="setup-card setup-card--primary">
                <h2 className="setup-card__title">{t('gate.step.leads')}</h2>
                {/* 空组/全空名册时 GroupLeadConfirm 自身 return null——给一个兜底「下一步」不卡死。 */}
                <GroupLeadConfirm
                  client={client}
                  members={members}
                  groups={groups}
                  onConfirmed={() => {
                    invalidateRoster();
                    goTo('season');
                  }}
                />
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => goTo('season')}
                >
                  {t('gate.leads.skip')}
                </button>
              </section>
            )}
          </div>
        ) : null}
        {visited.includes('season') ? (
          <div hidden={step !== 'season'}>
            <SeasonStep client={client} onNext={() => goTo('fleet')} />
          </div>
        ) : null}
        {visited.includes('fleet') ? (
          <div hidden={step !== 'fleet'}>
            <FleetStep client={client} onNext={() => goTo('inventory')} />
          </div>
        ) : null}
        {visited.includes('inventory') ? (
          <div hidden={step !== 'inventory'}>
            <InventoryStep client={client} onNext={() => goTo('kb')} />
          </div>
        ) : null}
        {visited.includes('kb') ? (
          <div hidden={step !== 'kb'}>
            <KbStep client={client} onNext={() => goTo('done')} />
          </div>
        ) : null}
        {visited.includes('done') ? (
          <div hidden={step !== 'done'}>
            <section className="setup-card setup-card--primary">
              <h2 className="setup-card__title">{t('gate.done.title')}</h2>
              <p className="setup-card__desc">{t('gate.done.desc')}</p>
              <button type="button" className="btn btn--primary" onClick={onDone}>
                {t('gate.done.cta')}
              </button>
            </section>
          </div>
        ) : null}
        {/* 「上一步」（WIZARD-BACK 修复刀）：首步（who）无回退；其余各步统一在卡片下方给回退口。 */}
        {step !== 'who' ? (
          <div className="setup-wizard__nav">
            <button type="button" className="btn btn--secondary" onClick={goBack}>
              {t('gate.back')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
