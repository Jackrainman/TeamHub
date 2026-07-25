import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deriveLeafGroups,
  RESOURCE_INIT_STATUSES,
  type CreateResourcesBatchRequest,
  type Group,
  type MemberGrade,
  type MemberPublic,
  type RobotTarget,
  type RosterImportReport,
  type RosterImportRow,
  type RosterPreviewResponse,
  type SharedResource,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n, type TranslationKey } from '../../i18n';
import { humanizeFormError, suggestSeason } from '../../utils';
import { GroupLeadConfirm } from '../settings/GroupLeadConfirm';
import { RosterPreviewTable } from '../settings/RosterPreviewTable';
import { GRADE_KEY, RosterReportView } from '../settings/SettingsPage';

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
 *  ④ **录入车队**（FLEET-BATCH-INIT 刀⑩）：一次录全部车（名称/编号位/赛季/第几代/能用·在修·退役·停用），
 *    批量端点 zod 全量先验、任一坏整批不落；空表可跳过，已有车可直接下一步（照名册已就绪先例）。
 *  ⑤ **进 app**（已登录、项目管理权限在手）。
 *
 * 反监视 I0：门只收集操作者本人这一行事实 + 组长任命事实 + 车（无成员维度），不做任何按人聚合。
 */

type Step = 'who' | 'roster' | 'leads' | 'fleet' | 'done';

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
        </header>
        {step === 'who' ? (
          <WhoStep
            client={client}
            members={members}
            groups={groups}
            onDone={() => {
              // ①完成 = 已持旗已登录：刷新会话与名册（会话 cookie 由服务端签进响应）。
              void queryClient.invalidateQueries({ queryKey: ['session'] });
              invalidateRoster();
              setStep('roster');
            }}
          />
        ) : null}
        {step === 'roster' ? (
          <RosterStep client={client} groups={groups} onNext={() => setStep('leads')} />
        ) : null}
        {step === 'leads' ? (
          membersQuery.isLoading || groupsQuery.isLoading ? (
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
                  setStep('fleet');
                }}
              />
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setStep('fleet')}
              >
                {t('gate.leads.skip')}
              </button>
            </section>
          )
        ) : null}
        {step === 'fleet' ? (
          <FleetStep client={client} onNext={() => setStep('done')} />
        ) : null}
        {step === 'done' ? (
          <section className="setup-card setup-card--primary">
            <h2 className="setup-card__title">{t('gate.done.title')}</h2>
            <p className="setup-card__desc">{t('gate.done.desc')}</p>
            <button type="button" className="btn btn--primary" onClick={onDone}>
              {t('gate.done.cta')}
            </button>
          </section>
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

// ④ 录入车队（FLEET-BATCH-INIT 刀⑩）：一次录全部车——表格行（名称 / 编号位 R1·R2·共用 /
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

function FleetStep({
  client,
  onNext,
}: {
  client: HubApiClient;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
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
  const [created, setCreated] = useState<readonly SharedResource[] | null>(null);

  const submittable = fleetRowsSubmittable(rows);

  function patchRow(idx: number, patch: Partial<FleetRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

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
                    <input
                      value={row.season}
                      onChange={(e) => patchRow(idx, { season: e.target.value })}
                      placeholder={suggestFleetSeasonCode(new Date())}
                      size={4}
                    />
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
          {error ? (
            <p className="form-hint form-hint--warn">
              {humanizeFormError(error, t, 'gate.fleet.error')}
            </p>
          ) : null}
          {submittable ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={pending}
              onClick={() => void submit()}
            >
              {pending ? t('gate.fleet.submitting') : t('gate.fleet.submit')}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={onNext}>
              {t('gate.fleet.skip')}
            </button>
          )}
        </>
      )}
    </section>
  );
}
