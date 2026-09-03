import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import { useMembers, useSession } from '../../features/identity/hooks';
import { useGroups, useSeasons } from '../../features/pm/hooks';
import { useI18n } from '../../i18n';
import { GroupLeadConfirm } from '../settings/GroupLeadConfirm';
import { WIZARD_STEP_META, WIZARD_STEP_ORDER, WIZARD_STEP_TOTAL, type Step } from './setup-utils';
import { WhoStep } from './WhoStep';
import { RosterStep } from './RosterStep';
import { SeasonStep } from './SeasonStep';
import { InventoryStep } from './InventoryStep';
import { KbStep } from './KbStep';

// Re-export public symbols for backward compatibility (tests import from this path).
export {
  WIZARD_STEP_TOTAL,
  WIZARD_STEP_META,
  WIZARD_STEP_ORDER,
  WHO_GRADE_OPTIONS,
  KB_DOC_ACCEPT,
  suggestSeasonForm,
  seasonAnchorsComplete,
  seasonFormSubmittable,
  seasonNameYear,
  buildSeasonCreateRequest,
  submitSeasonStep,
  kbImportReportCounts,
} from './setup-utils';
export type { SeasonForm } from './setup-utils';

/**
 * 全屏初始化门（SETUP-WIZARD-ROSTER 刀② v2「先问你是谁」，onboarding-pin-deadlock-2026-07-24 §3 刀②；
 * ONBOARD-QA 2026-08-30 拍板改版：一问一答 + 右侧实时确认卡）。
 *
 * **出现条件**：identity 模式且名册无任何持「项目管理」旗标成员（ConsoleApp 判定、整屏替换 app shell，
 * 复用 SetupWizard 形态）。匿名 / demo 路径不出现（匿名模式无身份概念；demo fixtures 自带持旗成员）。
 *
 * 流程（完成才进 app）：
 *  ① **你是谁**：姓名 + 所在组（chips 点选）+ 组长申报 + 项目管理旗标（默认勾）+ PIN（≥4）
 *  ② **名册**：chips 分支「有现成名册表吗」→ 有则 CSV 预览导入 / 没有则之后弄
 *  ③ **确认各组组长**
 *  ④ **建赛季**：创建成功即自动前进（创建即确认，无二次确认段）
 *  ⑤ **库存**：chips 分支「有现成库存表吗」
 *  ⑥ **排障档案**：chips 分支「有现成档案吗」→ 完成直接进 app（done 再次确认页已删）
 *
 * 右侧确认卡：已答项实时回显（我/名册/组长/赛季从 members+groups+seasons 查询派生；
 * 库存/档案以步上报文本为准），答错可「上一步」回退重答。
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
  // 步上报文本（库存/档案等无查询派生源的步）：chips 选「之后弄」或导入完成后写入确认卡。
  const [facts, setFacts] = useState<Partial<Record<Step, string>>>({});
  const goTo = (next: Step) => {
    setVisited((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setStep(next);
  };
  const goBack = () => {
    const idx = WIZARD_STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(WIZARD_STEP_ORDER[idx - 1]);
  };
  // AUTH-LOGIN-USERNAME：GET /api/members 与 GET /api/groups 均未登录 401——①（你是谁）完成前
  //（bootstrap 签发会话 cookie 前）不打这两个端点；①完成后已登录，onDone 里 invalidate 重取回显。
  const sessionQuery = useSession(client);
  const loggedIn = Boolean(sessionQuery.data?.session);
  const membersQuery = useMembers(client, 'bootstrap-gate', loggedIn);
  const groupsQuery = useGroups(client, 'bootstrap-gate', loggedIn);
  const seasonsQuery = useSeasons(client);
  const members = useMemo(
    () => membersQuery.data?.members ?? [],
    [membersQuery.data],
  );
  const groups = useMemo(() => groupsQuery.data?.groups ?? [], [groupsQuery.data]);
  const invalidateRoster = () => {
    void queryClient.invalidateQueries({ queryKey: ['members'] });
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
  };
  const reportFact = (s: Step, text: string) =>
    setFacts((prev) => ({ ...prev, [s]: text }));

  return (
    <div className="setup-wizard setup-wizard--center">
      <div className="setup-wizard__inner setup-wizard__inner--qa">
        <header className="setup-wizard__head">
          <p className="eyebrow">{t('toolbar.eyebrow')}</p>
          <h1 className="setup-wizard__title">{t('gate.title')}</h1>
          <p className="setup-wizard__subtitle">{t('gate.subtitle')}</p>
          <p>
            {t('gate.progress', {
              n: WIZARD_STEP_META[step].n,
              total: WIZARD_STEP_TOTAL,
              name: t(WIZARD_STEP_META[step].nameKey),
            })}
          </p>
        </header>
        <div className="setup-qa">
          <div className="setup-qa__main">
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
                <RosterStep
                  client={client}
                  groups={groups}
                  onNext={(fact) => {
                    if (fact) reportFact('roster', fact);
                    goTo('leads');
                  }}
                />
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
                      onClick={() => {
                        reportFact('leads', t('gate.rail.laterGeneric'));
                        goTo('season');
                      }}
                    >
                      {t('gate.leads.skip')}
                    </button>
                  </section>
                )}
              </div>
            ) : null}
            {visited.includes('season') ? (
              <div hidden={step !== 'season'}>
                <SeasonStep client={client} onNext={() => goTo('inventory')} />
              </div>
            ) : null}
            {visited.includes('inventory') ? (
              <div hidden={step !== 'inventory'}>
                <InventoryStep
                  client={client}
                  onNext={(fact) => {
                    if (fact) reportFact('inventory', fact);
                    goTo('kb');
                  }}
                />
              </div>
            ) : null}
            {visited.includes('kb') ? (
              <div hidden={step !== 'kb'}>
                {/* 末步：完成直接进 app（ONBOARD-QA：done 再次确认页已删）。 */}
                <KbStep client={client} onNext={() => onDone()} />
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
          <ConfirmRail
            step={step}
            members={members}
            activeSeasonName={
              seasonsQuery.data?.seasons.find((s) => s.status === 'active')?.name ?? null
            }
            facts={facts}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 右侧实时确认卡（ONBOARD-QA「回答可见回报」）：已答项✓+值、当前步→高亮、未答步○灰。
 * 我/名册/组长/赛季从查询派生（回退重答自动更正）；库存/档案用步上报文本（facts）。
 */
function ConfirmRail({
  step,
  members,
  activeSeasonName,
  facts,
}: {
  step: Step;
  members: readonly { displayName: string; role: string; projectManager?: boolean }[];
  activeSeasonName: string | null;
  facts: Partial<Record<Step, string>>;
}) {
  const { t } = useI18n();
  const me = members.find((m) => m.projectManager);
  const leadCount = members.filter((m) => m.role === 'groupAdmin').length;
  const values: Record<Step, string | null> = {
    who: me?.displayName ?? null,
    roster:
      facts.roster ??
      (members.length > 1 ? t('gate.rail.members', { n: members.length }) : null),
    leads: facts.leads ?? (leadCount > 0 ? t('gate.rail.leads', { n: leadCount }) : null),
    season: activeSeasonName,
    inventory: facts.inventory ?? null,
    kb: facts.kb ?? null,
  };
  return (
    <aside className="setup-rail" aria-label={t('gate.rail.title')}>
      <h2 className="setup-rail__title">{t('gate.rail.title')}</h2>
      <ul className="setup-rail__list">
        {WIZARD_STEP_ORDER.map((s) => {
          const value = values[s];
          const state = value ? 'done' : s === step ? 'current' : 'todo';
          return (
            <li className={`setup-rail__item setup-rail__item--${state}`} key={s}>
              <span className="setup-rail__name">{t(WIZARD_STEP_META[s].nameKey)}</span>
              <span className="setup-rail__value">
                {value ?? (s === step ? t('gate.rail.answering') : t('gate.rail.pending'))}
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
