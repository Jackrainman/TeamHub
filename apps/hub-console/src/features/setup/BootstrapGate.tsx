import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deriveLeafGroups,
  generateRoboconBaselineTemplate,
  RESOURCE_INIT_STATUSES,
  type CreateResourcesBatchRequest,
  type CreateSeasonRequest,
  type FleetImportRow,
  type FleetPreviewResponse,
  type Group,
  type InventoryImportReport,
  type InventoryImportRow,
  type InventoryPreviewResponse,
  type KbImportDocsReport,
  type MemberGrade,
  type MemberPublic,
  type RobotTarget,
  type RosterImportReport,
  type RosterImportRow,
  type RosterPreviewResponse,
  type Season,
  type SharedResource,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n, type TranslationKey } from '../../i18n';
import { humanizeFormError, seasonForYear, seasonYearOptions, suggestSeason } from '../../utils';
import { GroupLeadConfirm } from '../settings/GroupLeadConfirm';
import { RosterPreviewTable } from '../settings/RosterPreviewTable';
import { InvPreviewTable, InvReportView } from '../inv/InvPreviewTable';
import { FleetPreviewTable } from '../fleet/FleetPreviewTable';
import { GRADE_KEY, RosterReportView } from '../../shared/roster';

/**
 * 全屏初始化门（SETUP-WIZARD-ROSTER 刀② v2「先问你是谁」，onboarding-pin-deadlock-2026-07-24 §3 刀②）。
 *
 * **出现条件**：identity 模式且名册无任何持「项目管理」旗标成员（ConsoleApp 判定、整屏替换 app shell，
 * 复用 SetupWizard 形态）。匿名 / demo 路径不出现（匿名模式无身份概念；demo fixtures 自带持旗成员）。
 *
 * 流程（完成才进 app）：
 *  ① **你是谁**：姓名 + 所在组 + 组长申报 + 项目管理旗标（默认勾）+ PIN（≥4）→ bootstrap 端点
 *    （POST /api/setup/super-admin 扩：名册无持旗成员豁免登录，一笔建人/认领 + 授旗 + 设 PIN + 签会话）。
 *    操作者由此必在名册（原"操作者不在 CSV"问题消解）。
 *  ② **导入名册 CSV**（空名册豁免已有；此刻操作者已持旗，导入/确认鉴权自然通过——v2 从结构上消除
 *    原"顺序即鉴权"问题，零新豁免面）。刀⑦：上传 → preview 只解析不落库 → 预览表行内编辑 → 确认后
 *    JSON 导入。名册已就绪（如死锁恢复场景成员早导入过）可直接下一步。
 *  ③ **确认各组组长**：复用 GroupLeadConfirm（刀③——有成员必选 + 默认建议、空组不出现、叶子组候选）。
 *  ④ **建赛季**（WIZARD-SEASON-STEP 刀⑬）：赛季名按 suggestSeason 预填可改 + 学期开始（预填推导
 *    startsAt 日期段）+ 比赛日（选填）→ createSeason（status 服务端钉 active、旧 active 同笔归档）；
 *    两锚点齐则顺手 generateRoboconBaselineTemplate + updateBaseline 落基准线模板（比赛日空只建赛季，
 *    进 app 后总览空态可补锚点生成）。已有 active 赛季可直接下一步（照 fleet「已有 N 台车」先例）；可跳过。
 *  ⑤ **录入车队**（FLEET-BATCH-INIT 刀⑩）：一次录全部车（名称/编号位/赛季/第几代/能用·在修·退役·停用），
 *    批量端点 zod 全量先验、任一坏整批不落；空表可跳过，已有车可直接下一步（照名册已就绪先例）。
 *  ⑥ **录入库存**（INV-BULK-IMPORT 刀⑪）：库存 CSV 批量导入（件号/名称/类别/单位/总数/低储阈值），
 *    上传 → preview 只解析不落库 → 预览表行内编辑 → 确认后 JSON 导入（partNumber 幂等 upsert、绝不删）；
 *    可跳过。
 *  ⑦ **导入知识库**（KB-BULK-MD-IMPORT 刀⑫）：历年 markdown 文档批量导入（多选 .md/.markdown，
 *    服务端按 title 幂等去重）→ 三段报告回显（导入/跳过/失败）；AI 分析不做；可跳过。
 *  ⑧ **进 app**（已登录、项目管理权限在手）。
 *
 * 「上一步」（WIZARD-BACK 修复刀）：除首步外各步底部统一回退口；已访问步保持挂载（hidden 隐藏），
 * 回退时已填表单态不丢，已提交数据由步内查询重取回显（known-bugs 2026-07-28 #1）。
 *
 * 反监视 I0：门只收集操作者本人这一行事实 + 组长任命事实 + 车/零件/文档（无成员维度），不做任何按人聚合。
 */

type Step = 'who' | 'roster' | 'leads' | 'season' | 'fleet' | 'inventory' | 'kb' | 'done';

/**
 * 向导进度（WIZARD-PROGRESS）：步 → 1-based 序号 + 短名 i18n 键。顶显「第 N/8 步 · 步名」用——
 * 短名（gate.stepName.*）独立于带圈号标题（gate.step.* = 「① 你是谁」），进度行不重复圈号。
 */
export const WIZARD_STEP_TOTAL = 8;
export const WIZARD_STEP_META: Record<Step, { n: number; nameKey: TranslationKey }> = {
  who: { n: 1, nameKey: 'gate.stepName.who' },
  roster: { n: 2, nameKey: 'gate.stepName.roster' },
  leads: { n: 3, nameKey: 'gate.stepName.leads' },
  season: { n: 4, nameKey: 'gate.stepName.season' },
  fleet: { n: 5, nameKey: 'gate.stepName.fleet' },
  inventory: { n: 6, nameKey: 'gate.stepName.inventory' },
  kb: { n: 7, nameKey: 'gate.stepName.kb' },
  done: { n: 8, nameKey: 'gate.stepName.done' },
};

/**
 * 「你是谁」步年级下拉选项（GRADE-7-TIERS 刀⑥）：大一~大四/研一~研三七档，按序、默认 freshman。
 * legacy 档 `graduate`（旧落盘数据）不在选项内——新建成员不再产它；文案复用 SettingsPage 的
 * GRADE_KEY（同一 i18n 键，不另起）。
 */
export const WHO_GRADE_OPTIONS: readonly MemberGrade[] = [
  'freshman',
  'sophomore',
  'junior',
  'senior',
  'grad1',
  'grad2',
  'grad3',
];

/**
 * 步骤顺序（WIZARD-BACK 修复刀）：「上一步」回退的唯一真源——下标即步序，与 WIZARD_STEP_META.n 一致
 * （单测锚住）。回退实现 = 已访问步保持挂载（hidden 隐藏），已填表单态不丢；已提交数据本就在服务端，
 * 回步后各步查询重取自然回显（赛季步「已有当前赛季」、车队步「已有 N 台车」先例）。
 */
export const WIZARD_STEP_ORDER: readonly Step[] = [
  'who',
  'roster',
  'leads',
  'season',
  'fleet',
  'inventory',
  'kb',
  'done',
];

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

// ① 你是谁：姓名 + 所在组 + 年级下拉（GRADE-7-TIERS 刀⑥ 七档，默认大一）+ 组长申报 + 项目管理旗标 +
// PIN → bootstrap 一笔落库（建人/认领 + 授旗 + 设 PIN + 登录态）。姓名命中既有成员 = 直接认领该行
// （组/年级字段不显示、服务端忽略）。
function WhoStep({
  client,
  members,
  groups,
  onDone,
}: {
  client: HubApiClient;
  members: readonly MemberPublic[];
  groups: readonly Group[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  // 所在组候选 = 叶子组（deriveLeafGroups 结构派生，排非叶子+哨兵）；空板无组 → 自由文本输入。
  const leafGroups = useMemo(() => {
    const leaf = new Set(deriveLeafGroups([...groups]));
    return groups.filter((g) => leaf.has(g.id));
  }, [groups]);
  const [groupName, setGroupName] = useState('');
  const [grade, setGrade] = useState<MemberGrade>('freshman');
  const [asLead, setAsLead] = useState(false);
  const [pm, setPm] = useState(true);
  const [pin, setPin] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const nameTrim = name.trim();
  // 姓名命中既有成员 = 认领（无需组）；否则必须给组（新建成员行）。
  const claiming = members.some((m) => m.displayName === nameTrim);
  const valid =
    nameTrim.length > 0 &&
    (claiming || groupName.trim().length > 0) &&
    pin.trim().length >= 4 &&
    !pending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setPending(true);
    setError(null);
    try {
      await client.setupSuperAdmin({
        pin: pin.trim(),
        displayName: nameTrim,
        groupName: claiming ? undefined : groupName.trim(),
        grade: claiming ? undefined : grade, // 认领路径不动既有行 grade（服务端忽略）
        asGroupLead: asLead,
        projectManager: pm,
      });
      onDone();
    } catch (err) {
      if (/\b409\b/.test(String(err))) {
        onDone();
        return;
      }
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="setup-card setup-card--primary">
      <h2 className="setup-card__title">{t('gate.step.who')}</h2>
      <p className="setup-card__desc">{t('gate.who.desc')}</p>
      <form onSubmit={(e) => void submit(e)}>
        <label className="gate-field">
          <span>{t('gate.who.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('gate.who.namePlaceholder')}
            required
          />
        </label>
        {nameTrim && claiming ? (
          <p className="settings-desc">{t('gate.who.claimHint')}</p>
        ) : null}
        {!claiming ? (
          <label className="gate-field">
            <span>{t('gate.who.group')}</span>
            {leafGroups.length > 0 ? (
              <>
                <input
                  list="gate-leaf-groups"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder={t('gate.who.groupPlaceholder')}
                />
                <datalist id="gate-leaf-groups">
                  {leafGroups.map((g) => (
                    <option value={g.name} key={g.id} />
                  ))}
                </datalist>
              </>
            ) : (
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={t('gate.who.groupPlaceholder')}
              />
            )}
          </label>
        ) : null}
        {!claiming ? (
          <label className="gate-field">
            <span>{t('gate.who.grade')}</span>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value as MemberGrade)}
            >
              {WHO_GRADE_OPTIONS.map((g) => (
                <option value={g} key={g}>
                  {t(GRADE_KEY[g])}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {!claiming ? (
          <label className="setup-card__check">
            <input
              type="checkbox"
              checked={asLead}
              onChange={(e) => setAsLead(e.target.checked)}
            />
            <span>{t('gate.who.asLead')}</span>
          </label>
        ) : null}
        <label className="setup-card__check">
          <input type="checkbox" checked={pm} onChange={(e) => setPm(e.target.checked)} />
          <span>{t('gate.who.pm')}</span>
        </label>
        <label className="gate-field">
          <span>{t('gate.who.pin')}</span>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={t('gate.who.pinPlaceholder')}
            autoComplete="new-password"
            required
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={!valid}>
          {pending ? t('gate.who.submitting') : t('gate.who.submit')}
        </button>
        {error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(error, t, 'gate.who.error')}
          </p>
        ) : null}
      </form>
    </section>
  );
}

// ② 导入名册 CSV（刀⑦ 预览表可编辑）：上传 → preview 只解析不落库 → RosterPreviewTable 行内编辑
// （年级下拉 / 组 datalist）→ 确认后 JSON 导入 → 报告回显；名册已就绪可直接下一步（死锁恢复场景
// 成员早导入过）。
// WIZARD-ROSTER-INVALIDATE 修复刀：确认导入后必须失效 ['members']/['groups']——门级 membersQuery/
// groupsQuery 在「你是谁」步就取过数，导入不落缓存刷新，第③步（leads）拿到的就是旧空名册
// （known-bugs 2026-07-28 #2「页2导入成员后页3不显示」根因）。
function RosterStep({
  client,
  groups,
  onNext,
}: {
  client: HubApiClient;
  groups: readonly Group[];
  onNext: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<RosterPreviewResponse | null>(null);
  const [report, setReport] = useState<RosterImportReport | null>(null);
  // 组 datalist 候选 = 叶子组名（排非叶子+哨兵；可手打新组名=自动建组）。
  const leafGroupNames = useMemo(() => {
    const leaf = new Set(deriveLeafGroups([...groups]));
    return groups.filter((g) => leaf.has(g.id)).map((g) => g.name);
  }, [groups]);

  async function upload(file: File) {
    setPending(true);
    setError(null);
    try {
      setPreview(await client.previewRoster(file));
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  async function confirm(rows: RosterImportRow[]) {
    setPending(true);
    setError(null);
    try {
      setReport(await client.importRosterRows(rows));
      setPreview(null);
      // 导入落库了成员（可能还自动建了组）→ 失效门级缓存，leads 步才能看到新名册。
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="setup-card setup-card--primary">
      <h2 className="setup-card__title">{t('gate.step.roster')}</h2>
      <p className="setup-card__desc">{t('gate.roster.desc')}</p>
      <div className="roster-import__actions">
        <a className="btn btn--secondary btn--sm" href={client.rosterTemplateUrl()} download>
          {t('settings.roster.downloadTemplate')}
        </a>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending}
        >
          {pending && !preview ? t('settings.roster.importing') : t('settings.roster.upload')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </div>
      {error ? (
        <p className="form-hint form-hint--warn">
          {humanizeFormError(error, t, 'settings.roster.error')}
        </p>
      ) : null}
      {preview ? (
        <RosterPreviewTable
          preview={preview}
          groupNames={leafGroupNames}
          pending={pending}
          onConfirm={(rows) => void confirm(rows)}
          onCancel={() => setPreview(null)}
        />
      ) : null}
      {report ? <RosterReportView report={report} /> : null}
      <button type="button" className="btn btn--primary" onClick={onNext}>
        {report ? t('gate.roster.next') : t('gate.roster.ready')}
      </button>
    </section>
  );
}

// ④ 建赛季（WIZARD-SEASON-STEP 刀⑬）：赛季名预填 suggestSeason 可改 + 学期开始（date input，预填推导
// startsAt 的日期段）+ 比赛日（date input，选填）→ createSeason（startsAt=学期开始→ISO、endsAt=suggestSeason
// 推导值，status 服务端钉 active）；两锚点齐（学期开始+比赛日都填）则顺手 generateRoboconBaselineTemplate +
// updateBaseline 落基准线模板；比赛日空只建赛季（提示进 app 后总览可补锚点生成）。已有 active 赛季显示
// 「已有当前赛季」可直接下一步（照 fleet「已有 N 台车」先例）；任何时刻可「跳过」（刀⑨ app 内空态一键创建兜底）。

/** 赛季步本地表单态：semesterStart/competitionDate 承接 date input 原生 YYYY-MM-DD；endsAt 不暴露编辑。 */
export interface SeasonForm {
  name: string;
  semesterStart: string; // 学期开始（锚点①，必填）
  competitionDate: string; // 比赛日（锚点②，选填；空串 = 不生成基准线模板）
  endsAt: string; // 赛季结束 ISO（suggestSeason 推导，随表单走不另算）
}

/** 预填派生：赛季名/学期开始日期段/结束日均从 suggestSeason 拿（UTC 钉边界，同刀⑨）；比赛日不预填。 */
export function suggestSeasonForm(now: Date): SeasonForm {
  const s = suggestSeason(now);
  return {
    name: s.name,
    semesterStart: s.startsAt.slice(0, 10),
    competitionDate: '',
    endsAt: s.endsAt,
  };
}

/** 两锚点齐否：学期开始 + 比赛日都给了 → 提交后顺手生成基准线模板（照 BaselineOverview 空态同律）。 */
export function seasonAnchorsComplete(
  form: Pick<SeasonForm, 'semesterStart' | 'competitionDate'>,
): boolean {
  return Boolean(form.semesterStart && form.competitionDate);
}

/** 可提交 = 赛季名非空 + 学期开始必填；比赛日填了则须晚于学期开始（同 BaselineEmptyState orderOk）。 */
export function seasonFormSubmittable(form: SeasonForm): boolean {
  if (form.name.trim().length === 0 || !form.semesterStart) return false;
  return !form.competitionDate || form.competitionDate > form.semesterStart;
}

/**
 * 赛季名 → 年份（"2027赛季" → 2027）。年份下拉的 value 必须用本函数派生——option 的 value 是
 * 年份数（seasonYearOptions.years），直接拿 form.name（带「赛季」后缀）做 value 匹配不到任何
 * option，受控下拉恒显示空白（known-bugs 2026-07-28 #3「建赛季」缺陷的向导侧根因）。
 */
export function seasonNameYear(name: string): number {
  return Number.parseInt(name, 10);
}

/** 本地表单 → createSeason 请求体：学期开始日期段 → ISO 零点（UTC，同 suggestSeason 边界钉法）。 */
export function buildSeasonCreateRequest(form: SeasonForm): CreateSeasonRequest {
  return {
    name: form.name.trim(),
    startsAt: `${form.semesterStart}T00:00:00.000Z`,
    endsAt: form.endsAt,
  };
}

/**
 * 提交序列（顺序钉死：模板 PATCH 要新建赛季的 id）——先 createSeason，两锚点齐则
 * generateRoboconBaselineTemplate（参数照 BaselineOverview 空态既有调用）+ updateBaseline PATCH 回；
 * 比赛日空只建赛季。抽成纯数据 helper 供单测 mock client 断言顺序与参数形状。
 */
export async function submitSeasonStep(
  client: Pick<HubApiClient, 'createSeason' | 'updateBaseline'>,
  form: SeasonForm,
): Promise<{ season: Season; baselineGenerated: boolean }> {
  const { season } = await client.createSeason(buildSeasonCreateRequest(form));
  if (!seasonAnchorsComplete(form)) return { season, baselineGenerated: false };
  const template = generateRoboconBaselineTemplate({
    semesterStart: `${form.semesterStart}T00:00:00.000Z`,
    competitionDate: `${form.competitionDate}T00:00:00.000Z`,
  });
  await client.updateBaseline(season.id, template);
  return { season, baselineGenerated: true };
}

function SeasonStep({
  client,
  onNext,
}: {
  client: HubApiClient;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const seasonsQuery = useQuery({
    queryKey: ['seasons', 'bootstrap-gate'],
    queryFn: () => client.getSeasons(),
  });
  const activeSeason =
    seasonsQuery.data?.seasons.find((s) => s.status === 'active') ?? null;
  const [form, setForm] = useState<SeasonForm>(() => suggestSeasonForm(new Date()));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<{ name: string; baselineGenerated: boolean } | null>(
    null,
  );
  const [showCreateForm, setShowCreateForm] = useState(false);

  const submittable = seasonFormSubmittable(form);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!submittable) return;
    setPending(true);
    setError(null);
    try {
      const res = await submitSeasonStep(client, form);
      setCreated({ name: res.season.name, baselineGenerated: res.baselineGenerated });
      void queryClient.invalidateQueries({ queryKey: ['seasons'] });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="setup-card setup-card--primary">
      <h2 className="setup-card__title">{t('gate.step.season')}</h2>
      <p className="setup-card__desc">{t('gate.season.desc')}</p>
      {activeSeason && !showCreateForm ? (
        <>
          <p className="settings-desc">
            {t('gate.season.hasSeason', { name: activeSeason.name })}
          </p>
          <div className="roster-import__actions">
            <button type="button" className="btn btn--primary" onClick={onNext}>
              {t('gate.season.next')}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setShowCreateForm(true)}
            >
              {t('gate.season.createNew')}
            </button>
          </div>
        </>
      ) : created ? (
        <>
          <p className="settings-desc">
            {created.baselineGenerated
              ? t('gate.season.createdWithBaseline', { name: created.name })
              : t('gate.season.createdNoBaseline', { name: created.name })}
          </p>
          <button type="button" className="btn btn--primary" onClick={onNext}>
            {t('gate.season.next')}
          </button>
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <label className="gate-field">
            <span>{t('gate.season.name')}</span>
            <select
              value={seasonNameYear(form.name)}
              onChange={(e) => {
                const year = Number(e.target.value);
                const s = seasonForYear(year);
                setForm({
                  ...form,
                  name: s.name,
                  semesterStart: s.startsAt.slice(0, 10),
                  endsAt: s.endsAt,
                });
              }}
            >
              {seasonYearOptions(new Date()).years.map((y) => (
                <option key={y} value={y}>
                  {y}赛季
                </option>
              ))}
            </select>
          </label>
          <label className="gate-field">
            <span>{t('gate.season.semesterStart')}</span>
            <input
              type="date"
              value={form.semesterStart}
              onChange={(e) => setForm({ ...form, semesterStart: e.target.value })}
              required
            />
          </label>
          <label className="gate-field">
            <span>{t('gate.season.competitionDate')}</span>
            <input
              type="date"
              value={form.competitionDate}
              onChange={(e) => setForm({ ...form, competitionDate: e.target.value })}
            />
          </label>
          <p className="settings-desc">{t('gate.season.competitionHint')}</p>
          {form.competitionDate && form.competitionDate <= form.semesterStart ? (
            <p className="form-hint form-hint--warn">{t('gate.season.dateOrder')}</p>
          ) : null}
          {error ? (
            <p className="form-hint form-hint--warn">
              {humanizeFormError(error, t, 'gate.season.error')}
            </p>
          ) : null}
          <div className="roster-import__actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!submittable || pending}
            >
              {pending ? t('gate.season.submitting') : t('gate.season.submit')}
            </button>
            <button type="button" className="btn btn--secondary" onClick={onNext}>
              {t('gate.season.skip')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// ⑤ 录入车队（FLEET-BATCH-INIT 刀⑩）：一次录全部车——表格行（名称 / 编号位 R1·R2·共用 /
// 赛季（默认按 suggestSeason 派生两位赛季码预填、可改可留空）/ 第几代（默认 1）/ 状态四档
// 能用·在修·退役·停用），行可增删；空表直接「跳过」；提交走 POST /api/resources/batch
// （zod 全量先验、任一坏整批不落）→ 回显创建结果（displayCode 列表）→「下一步」。
// 已有车（resources 非空）时显示「已有 N 台车」可直接下一步（照 RosterStep 名册已就绪先例）。

/** 初始化语义四档（能用/在修/退役/停用）——与 contracts RESOURCE_INIT_STATUSES 同源，不放开全 7 枚举。 */
export type FleetInitStatus = (typeof RESOURCE_INIT_STATUSES)[number];

/** 车队步表格行（本地编辑态）：version 用 string 承接 number input，提交时才 parse。 */
export interface FleetRow {
  name: string;
  robotTarget: RobotTarget;
  season: string; // 赛季后两位 "27"；可留空（不给 season → displayCode 不派生、读视图回退 name）
  version: string;
  status: FleetInitStatus;
}

export const FLEET_ROBOT_TARGETS: readonly RobotTarget[] = ['R1', 'R2', 'shared'];

/** 状态四档的 i18n 键映射（Record 穷举：加档 TS 指路）。 */
export const FLEET_STATUS_KEY: Record<FleetInitStatus, TranslationKey> = {
  available: 'gate.fleet.status.available',
  repair: 'gate.fleet.status.repair',
  retired: 'gate.fleet.status.retired',
  down: 'gate.fleet.status.down',
};

/**
 * 赛季预填：suggestSeason(now).name（"2027赛季"）取年份后两位 → "27"（displayCode 的赛季位语义）。
 * 与刀⑨ suggestSeason 同函数派生——8–12 月指向次年赛季、1–7 月指向当年赛季，时区无关（UTC）。
 */
export function suggestFleetSeasonCode(now: Date): string {
  return suggestSeason(now).name.replace('赛季', '').slice(-2);
}

/** 新行默认值：空名 / R1 / 赛季码预填 / 第 1 代 / 能用。 */
export function newFleetRow(seasonCode: string): FleetRow {
  return { name: '', robotTarget: 'R1', season: seasonCode, version: '1', status: 'available' };
}

/** 空行 = 名称为空（其余字段有默认值）——提交前剔除，不参与批量。 */
export function isFleetRowBlank(row: FleetRow): boolean {
  return row.name.trim().length === 0;
}

/** 可提交 = 至少一条非空行，且每条非空行 version 为正整数（赛季可留空）。 */
export function fleetRowsSubmittable(rows: readonly FleetRow[]): boolean {
  const filled = rows.filter((r) => !isFleetRowBlank(r));
  if (filled.length === 0) return false;
  return filled.every((r) => {
    const v = Number.parseInt(r.version, 10);
    return Number.isInteger(v) && v >= 1 && String(v) === r.version.trim();
  });
}

/** 本地行 → 批量请求体：剔空行、trim、version 转数；kind 不传（服务端默认 robot）。 */
export function buildFleetBatchRequest(
  rows: readonly FleetRow[],
): CreateResourcesBatchRequest {
  return {
    resources: rows
      .filter((r) => !isFleetRowBlank(r))
      .map((r) => ({
        name: r.name.trim(),
        robotTarget: r.robotTarget,
        season: r.season.trim() || undefined,
        version: Number.parseInt(r.version, 10),
        status: r.status,
      })),
  };
}

/**
 * CSV 预览行 → 批量请求体（FLEET-CSV-IMPORT）：FleetImportRow 形状本就和批量单项同形（name/robotTarget/
 * season?/version?/status?），只多一个物理行号 line——剥掉即合法批量请求体（kind 缺省 robot、statusReason
 * 不引入）。预览表已把坏行拦在提交外（fleetEditRowsValid），此处不再校验。
 */
export function fleetImportRowsToBatch(
  rows: readonly FleetImportRow[],
): CreateResourcesBatchRequest {
  return {
    resources: rows.map(({ line: _line, ...rest }) => rest),
  };
}

function FleetStep({
  client,
  onNext,
}: {
  client: HubApiClient;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resourcesQuery = useQuery({
    queryKey: ['resources', 'bootstrap-gate'],
    queryFn: () => client.getResources(),
  });
  const existingCount = resourcesQuery.data?.resources.length ?? 0;
  const [rows, setRows] = useState<FleetRow[]>(() => [
    newFleetRow(suggestFleetSeasonCode(new Date())),
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<FleetPreviewResponse | null>(null);
  const [created, setCreated] = useState<readonly SharedResource[] | null>(null);

  const submittable = fleetRowsSubmittable(rows);

  function patchRow(idx: number, patch: Partial<FleetRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  // CSV 主路径①：上传 → preview 只解析不落库 → FleetPreviewTable 行内编辑。
  async function upload(file: File) {
    setPending(true);
    setError(null);
    try {
      setPreview(await client.previewFleet(file));
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  // CSV 主路径②：确认预览行 → 拼批量请求体走既有 POST /api/resources/batch（不新增落库端点）。
  async function confirmImport(importRows: FleetImportRow[]) {
    setPending(true);
    setError(null);
    try {
      const res = await client.createResourcesBatch(fleetImportRowsToBatch(importRows));
      setCreated(res.resources);
      setPreview(null);
      void queryClient.invalidateQueries({ queryKey: ['resources'] });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  // 手动兜底：逐台表格行 → 同一批量端点。
  async function submit() {
    if (!submittable) return;
    setPending(true);
    setError(null);
    try {
      const res = await client.createResourcesBatch(buildFleetBatchRequest(rows));
      setCreated(res.resources);
      void queryClient.invalidateQueries({ queryKey: ['resources'] });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="setup-card setup-card--primary">
      <h2 className="setup-card__title">{t('gate.step.fleet')}</h2>
      <p className="setup-card__desc">{t('gate.fleet.desc')}</p>
      {existingCount > 0 ? (
        <p className="settings-desc">{t('gate.fleet.hasFleet', { count: existingCount })}</p>
      ) : null}
      {created ? (
        <>
          <p className="settings-desc">{t('gate.fleet.created')}</p>
          <ul className="settings-desc">
            {created.map((r) => (
              <li key={r.id}>{r.displayCode ?? r.name}</li>
            ))}
          </ul>
          <button type="button" className="btn btn--primary" onClick={onNext}>
            {t('gate.fleet.next')}
          </button>
        </>
      ) : (
        <>
          {/* CSV 导入（主路径，照库存步范式）：模板下载 + 上传 → 预览表行内编辑 → 确认创建。 */}
          <p className="settings-desc">{t('gate.fleet.import.desc')}</p>
          <div className="roster-import__actions">
            <a className="btn btn--secondary btn--sm" href={client.fleetTemplateUrl()} download>
              {t('gate.fleet.import.downloadTemplate')}
            </a>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
            >
              {pending && !preview
                ? t('gate.fleet.import.importing')
                : t('gate.fleet.import.upload')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = '';
              }}
            />
          </div>
          {error ? (
            <p className="form-hint form-hint--warn">
              {humanizeFormError(error, t, 'gate.fleet.import.error')}
            </p>
          ) : null}
          {preview ? (
            <FleetPreviewTable
              preview={preview}
              pending={pending}
              onConfirm={(importRows) => void confirmImport(importRows)}
              onCancel={() => setPreview(null)}
            />
          ) : null}
          {/* 手动录入（兜底）：折叠区，逐台表格行，走同一批量端点。 */}
          <details className="setup-card__advanced">
            <summary>{t('gate.fleet.manual.title')}</summary>
            <table className="resources-table">
              <thead>
                <tr>
                  <th>{t('gate.fleet.colName')}</th>
                  <th>{t('gate.fleet.colTarget')}</th>
                  <th>{t('gate.fleet.colSeason')}</th>
                  <th>{t('gate.fleet.colVersion')}</th>
                  <th>{t('gate.fleet.colStatus')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        value={row.name}
                        onChange={(e) => patchRow(idx, { name: e.target.value })}
                        placeholder={t('gate.fleet.namePlaceholder')}
                      />
                    </td>
                    <td>
                      <select
                        value={row.robotTarget}
                        onChange={(e) =>
                          patchRow(idx, { robotTarget: e.target.value as RobotTarget })
                        }
                      >
                        {FLEET_ROBOT_TARGETS.map((rt) => (
                          <option value={rt} key={rt}>
                            {rt === 'shared' ? t('resources.robot.shared') : rt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.season}
                        onChange={(e) => patchRow(idx, { season: e.target.value })}
                      >
                        <option value="">{t('gate.fleet.seasonNone')}</option>
                        {seasonYearOptions(new Date()).years.map((y) => {
                          const code = String(y).slice(-2);
                          return (
                            <option value={code} key={code}>
                              {code}
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={row.version}
                        onChange={(e) => patchRow(idx, { version: e.target.value })}
                        size={3}
                      />
                    </td>
                    <td>
                      <select
                        value={row.status}
                        onChange={(e) =>
                          patchRow(idx, { status: e.target.value as FleetInitStatus })
                        }
                      >
                        {RESOURCE_INIT_STATUSES.map((s) => (
                          <option value={s} key={s}>
                            {t(FLEET_STATUS_KEY[s])}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label={t('gate.fleet.removeRow')}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="roster-import__actions">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() =>
                  setRows((prev) => [...prev, newFleetRow(suggestFleetSeasonCode(new Date()))])
                }
              >
                {t('gate.fleet.addRow')}
              </button>
            </div>
            {submittable ? (
              <button
                type="button"
                className="btn btn--primary"
                disabled={pending}
                onClick={() => void submit()}
              >
                {pending ? t('gate.fleet.submitting') : t('gate.fleet.submit')}
              </button>
            ) : null}
          </details>
          <button type="button" className="btn btn--primary" onClick={onNext}>
            {t('gate.fleet.skip')}
          </button>
        </>
      )}
    </section>
  );
}

// ⑥ 录入库存（INV-BULK-IMPORT 刀⑪，结构照 RosterStep 刀⑦）：模板下载 + 上传 → preview 只解析不落库
// → InvPreviewTable 行内编辑（件号只读 = 幂等匹配键）→ 确认后 JSON 导入（partNumber 幂等 upsert、
// totalQuantity 覆盖、绝不删）→ 报告回显；没有库存要录可直接「跳过」。
function InventoryStep({
  client,
  onNext,
}: {
  client: HubApiClient;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<InventoryPreviewResponse | null>(null);
  const [report, setReport] = useState<InventoryImportReport | null>(null);

  async function upload(file: File) {
    setPending(true);
    setError(null);
    try {
      setPreview(await client.previewInventory(file));
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  async function confirm(rows: InventoryImportRow[]) {
    setPending(true);
    setError(null);
    try {
      setReport(await client.importInventoryRows(rows));
      setPreview(null);
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="setup-card setup-card--primary">
      <h2 className="setup-card__title">{t('gate.step.inventory')}</h2>
      <p className="setup-card__desc">{t('gate.inv.desc')}</p>
      <div className="roster-import__actions">
        <a className="btn btn--secondary btn--sm" href={client.inventoryTemplateUrl()} download>
          {t('inv.import.downloadTemplate')}
        </a>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending}
        >
          {pending && !preview ? t('inv.import.importing') : t('inv.import.upload')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </div>
      {error ? (
        <p className="form-hint form-hint--warn">
          {humanizeFormError(error, t, 'inv.import.error')}
        </p>
      ) : null}
      {preview ? (
        <InvPreviewTable
          preview={preview}
          pending={pending}
          onConfirm={(rows) => void confirm(rows)}
          onCancel={() => setPreview(null)}
        />
      ) : null}
      {report ? <InvReportView report={report} /> : null}
      <button type="button" className="btn btn--primary" onClick={onNext}>
        {report ? t('gate.inv.next') : t('gate.inv.skip')}
      </button>
    </section>
  );
}

// ⑦ 导入知识库（KB-BULK-MD-IMPORT 刀⑫）：多选 .md/.markdown → importKbDocs 整批上传（服务端
// 按 title 幂等去重）→ 三段报告回显（导入 N 篇 / 跳过 M / 失败 K，含逐条原因）；没有要导的可直接
// 「跳过」。AI 分析不做（backlog KB-AI-STRUCT）——本步只沉淀可检索文档。

/** 文件选择器 accept 串（与 server 后缀白名单同律）。 */
export const KB_DOC_ACCEPT = '.md,.markdown';

/** 报告三段计数（回显「导入 N 篇 · 跳过 M · 失败 K」的 i18n 参数源，纯函数供单测）。 */
export function kbImportReportCounts(report: KbImportDocsReport): {
  imported: number;
  skipped: number;
  failed: number;
} {
  return {
    imported: report.imported.length,
    skipped: report.skipped.length,
    failed: report.failed.length,
  };
}

function KbStep({
  client,
  onNext,
}: {
  client: HubApiClient;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [report, setReport] = useState<KbImportDocsReport | null>(null);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setPending(true);
    setError(null);
    try {
      setReport(await client.importKbDocs(files));
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="setup-card setup-card--primary">
      <h2 className="setup-card__title">{t('gate.step.kb')}</h2>
      <p className="setup-card__desc">{t('gate.kb.desc')}</p>

      {/* A 段：排障笔记——历年 markdown 文档批量导入（保持原样）。 */}
      <div className="gate-section">
        <h3 className="gate-section__title">{t('gate.kb.notes.title')}</h3>
        <p className="setup-card__desc">{t('gate.kb.notes.desc')}</p>
        <div className="roster-import__actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
          >
            {pending ? t('gate.kb.uploading') : t('gate.kb.pick')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={KB_DOC_ACCEPT}
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) void upload(files);
              e.target.value = '';
            }}
          />
        </div>
        {error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(error, t, 'gate.kb.error')}
          </p>
        ) : null}
        {report ? (
          <>
            <p className="settings-desc">{t('gate.kb.report', kbImportReportCounts(report))}</p>
            {report.imported.length > 0 ? (
              <ul className="settings-desc">
                {report.imported.map((d) => (
                  <li key={d.id}>{d.title}</li>
                ))}
              </ul>
            ) : null}
            {[...report.skipped, ...report.failed].length > 0 ? (
              <ul className="settings-desc">
                {report.skipped.map((d, i) => (
                  <li key={`s${i}`}>
                    {d.title}（{d.reason}）
                  </li>
                ))}
                {report.failed.map((d, i) => (
                  <li key={`f${i}`}>
                    {d.title}（{d.reason}）
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>

      {/* B 段：Bug 快速记录——本刀不新增端点（结案归档要根因/处理全字段），仅引导进应用后到排障档案页录入。 */}
      <div className="gate-section">
        <h3 className="gate-section__title">{t('gate.kb.bug.title')}</h3>
        <p className="setup-card__desc">{t('gate.kb.bug.hint')}</p>
      </div>

      <button type="button" className="btn btn--primary" onClick={onNext}>
        {report ? t('gate.kb.next') : t('gate.kb.skip')}
      </button>
    </section>
  );
}
