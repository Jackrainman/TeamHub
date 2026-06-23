import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import {
  deriveDisplayCode,
  type CreateResourceRequest,
  type ResourceKind,
  type ResourceStatus,
  type RobotTarget,
  type SharedResource,
  type UpdateResourceStatusRequest,
} from '../../api/schemas/resources';
import { useI18n, type TranslationKey } from '../../i18n';
import { errorDetail } from '../../utils';
import { SeasonSelect, guessSeason } from '../../components/SeasonSelect';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { Select } from '../../components/Select';
import { MetricTile } from '../../components/MetricTile';

// TODO(backend): 车型枚举待 hub-contracts 放开，新车型（如 R3/R4）需后端先扩展 RobotTarget 联合类型，
// 前端届时再改此数组；现在不假装可随意扩展。
const ROBOT_TARGETS: RobotTarget[] = ['R1', 'R2', 'shared'];
const KINDS: ResourceKind[] = ['robot', 'testRig', 'instrument'];

// 状态下拉给人选的目标态。covers 维修 / 退役 / 拆解 + 恢复可用 + 占用 + legacy down/upgrading。
const STATUSES: ResourceStatus[] = [
  'available',
  'inUse',
  'repair',
  'retired',
  'disassembling',
  'down',
  'upgrading',
];

const KIND_KEY: Record<ResourceKind, TranslationKey> = {
  robot: 'resources.kind.robot',
  testRig: 'resources.kind.testRig',
  instrument: 'resources.kind.instrument',
};

const STATUS_KEY: Record<ResourceStatus, TranslationKey> = {
  available: 'resources.status.available',
  inUse: 'resources.status.inUse',
  down: 'resources.status.down',
  upgrading: 'resources.status.upgrading',
  repair: 'resources.status.repair',
  retired: 'resources.status.retired',
  disassembling: 'resources.status.disassembling',
};

// 状态下拉选项文案：down/upgrading 是 legacy 态，语义上也「不可上场」，但与正式「在修(repair)」重叠易混。
// 下拉里给 legacy 态加「（旧，≈在修）」后缀澄清；表格行里沿用原 STATUS_KEY 保持简洁。
// NOTE: down.legacy / upgrading.legacy 是新键，待 translations.ts 补全后 TypeScript 完全收口。
const STATUS_OPTION_KEY: Record<ResourceStatus, TranslationKey> = {
  available: 'resources.status.available',
  inUse: 'resources.status.inUse',
  down: 'resources.status.down.legacy',
  upgrading: 'resources.status.upgrading.legacy',
  repair: 'resources.status.repair',
  retired: 'resources.status.retired',
  disassembling: 'resources.status.disassembling',
};

/**
 * 机器人管理页（R3 / D-072 §3.2「机器人 = 带编号对象」+ §3.3 机器人生命周期）。
 * 新建机器人（season + robotTarget + version → 派生 displayCode，**禁手写**）/ 改状态（维修 / 退役 / 拆解 / 恢复）。
 * **退役 = 状态迁移、非物理删除**（整机留展示，ResourceSession 仍引用 resourceId；故全页无删除按钮）。
 * 反监视红线（I0）：SharedResource 结构上无成员维度，本页永不渲染 / 收集 memberId / 出勤。
 */
export function ResourcesPage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['resources', source],
    queryFn: () => client.getResources(),
  });

  if (query.isLoading) {
    return (
      <div className="state-band" role="status" aria-live="polite">
        {t('resources.loading')}
      </div>
    );
  }
  if (query.error || !query.data) {
    return (
      <div className="state-band state-band-error" role="alert">
        {t('resources.error')}
      </div>
    );
  }

  const resources = query.data.resources;
  const activeCount = resources.filter(
    (r) => r.status !== 'retired' && r.status !== 'disassembling',
  ).length;

  // 跨区即时反映（IA 阶段 1 / D-075）：建 / 改机器人状态后 prefix 失效——
  // ['resources'] 覆盖本表 ['resources', source] + 接力画布的 ['resources', 'relay']；
  // ['relay'] 覆盖画布按 windowLabel 的接力板（boardable / 停用样式随车状态变）。
  // 故机器人队页里上半区改状态 → 下半区画布即时反映，无需手刷。
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['resources'] });
    void queryClient.invalidateQueries({ queryKey: ['relay'] });
  };

  return (
    <div className="resources-page">
      <p className="gaps-intro">{t('resources.intro')}</p>

      <section className="resources-summary" aria-label={t('resources.summary.total')}>
        <MetricTile label={t('resources.summary.total')} value={String(resources.length)} />
        <MetricTile
          label={t('resources.summary.active')}
          value={String(activeCount)}
          accent="green"
        />
      </section>

      <CreateResourceForm client={client} onCreated={refresh} />

      <section className="panel" aria-label={t('resources.table.title')}>
        <h2 className="resources-section-title">{t('resources.table.title')}</h2>
        {resources.length === 0 ? (
          <p className="resources-empty">{t('resources.empty')}</p>
        ) : (
          <div className="resources-table-wrap">
            <table className="resources-table">
              <thead>
                <tr>
                  <th scope="col">{t('resources.col.code')}</th>
                  <th scope="col">{t('resources.col.name')}</th>
                  <th scope="col">{t('resources.col.kind')}</th>
                  <th scope="col">{t('resources.col.status')}</th>
                  <th scope="col">{t('resources.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <ResourceRow
                    key={r.id}
                    resource={r}
                    client={client}
                    onUpdated={refresh}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// --- 新建机器人 -------------------------------------------------------------

function CreateResourceForm({
  client,
  onCreated,
}: {
  client: HubApiClient;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const now = useMemo(() => new Date(), []);
  const [season, setSeason] = useState(() => guessSeason(now));
  const [robotTarget, setRobotTarget] = useState<RobotTarget>('R1');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ResourceKind>('robot');
  const [version, setVersion] = useState('1');

  const mutation = useMutation({
    mutationFn: (req: CreateResourceRequest) => client.createResource(req),
    onSuccess: () => {
      setName('');
      onCreated();
    },
  });

  const versionNum = Number.parseInt(version, 10);
  const versionValid = Number.isInteger(versionNum) && versionNum >= 1;
  const valid = season.trim() && name.trim() && versionValid;

  // 实时预览（禁手写）：server 端最终用同一 deriveDisplayCode 派生，前端只是给人看一眼将生成的机器人编号。
  const preview = valid
    ? deriveDisplayCode(season.trim(), robotTarget, versionNum)
    : '—';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    mutation.mutate({
      // projectId 固定 prj-robots（与种子整机同项目）：机器人归属机器人项目，新建表单不暴露项目维度。
      projectId: 'prj-robots',
      name: name.trim(),
      kind,
      robotTarget,
      season: season.trim(),
      version: versionNum,
    });
  }

  return (
    <section className="resources-create panel" aria-label={t('resources.create.title')}>
      <header className="pm-create__head">
        <div>
          <h2>{t('resources.create.title')}</h2>
          <p className="pm-create__note">{t('resources.create.subtitle')}</p>
        </div>
      </header>
      <form className="pm-form" onSubmit={submit}>
        {/* 第一行：赛季 / 编号位 / 第几代（三格），版本右侧内联预览徽章 */}
        <FormGrid cols={3}>
          <Field label={t('resources.field.season')}>
            <SeasonSelect
              now={now}
              value={season}
              onChange={setSeason}
              ariaLabelKey="resources.field.season"
            />
          </Field>
          <Field
            label={t('resources.field.robotTarget')}
            className="kb-field--narrow"
            // 编号位直接出现在机器人编号中（如 R1→26R1）；hint 唯一承载说明，去掉 select 上的 title 双写。
            hint={t('resources.field.robotTargetHint')}
          >
            <Select
              value={robotTarget}
              onChange={setRobotTarget}
              options={ROBOT_TARGETS}
              renderOption={(rt) => (rt === 'shared' ? t('resources.robot.shared') : rt)}
            />
          </Field>
          <Field label={t('resources.field.version')}>
            {/* 版本右侧内联只读预览徽章（Field 内联预览槽）；机器人编号由 deriveDisplayCode 派生，禁手写。
                input + 徽章是单格内的横排（flex），非表单栅格——故保留 resources-version-row 内联壳，
                用 FormGrid（grid）会把徽章挤到次列、破坏内联布局。 */}
            <span className="resources-version-row">
              <input
                type="number"
                min={1}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
              <span
                className="resources-code-badge resources-preview-inline"
                title={t('resources.field.previewHint')}
              >
                {preview}
              </span>
            </span>
          </Field>
        </FormGrid>
        {/* 第二行：名字 / 类型（两格） */}
        <FormGrid>
          <Field label={t('resources.field.name')}>
            <input
              value={name}
              placeholder={t('resources.field.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t('resources.field.kind')}>
            <Select
              value={kind}
              onChange={setKind}
              options={KINDS}
              renderOption={(k) => t(KIND_KEY[k])}
            />
          </Field>
        </FormGrid>
        <FormActions
          submitLabel={t('resources.create.submit')}
          submittingLabel={t('resources.create.submitting')}
          submitting={mutation.isPending}
          disabled={!valid}
          error={
            mutation.error
              ? t('resources.create.error', { detail: errorDetail(mutation.error) })
              : null
          }
          success={
            mutation.isSuccess
              ? t('resources.create.success', {
                  code: mutation.data.resource.displayCode ?? mutation.data.resource.name,
                })
              : null
          }
        />
      </form>
    </section>
  );
}

// --- 单行 + 改状态 ----------------------------------------------------------

function ResourceRow({
  resource,
  client,
  onUpdated,
}: {
  resource: SharedResource;
  client: HubApiClient;
  onUpdated: () => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ResourceStatus>(resource.status);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: (patch: UpdateResourceStatusRequest) =>
      client.updateResourceStatus(resource.id, patch),
    onSuccess: () => {
      setReason('');
      onUpdated();
    },
  });

  // 行内改状态提交（FORM-UNIFY B3）：form 化后由 onSubmit 触发，逻辑与旧 apply 逐字一致、行为不变。
  // I0：只改资源状态 / 原因，绝不收任何成员维度。
  function apply(event: FormEvent) {
    event.preventDefault();
    if (!dirty || mutation.isPending) return;
    // statusReason：填了→改写；留空→不动既有 reason（不传字段）。退役只是状态迁移、不删行。
    const trimmed = reason.trim();
    mutation.mutate({
      status,
      ...(trimmed ? { statusReason: trimmed } : {}),
    });
  }

  const code = resource.displayCode ?? resource.name;
  const dirty = status !== resource.status || reason.trim().length > 0;

  return (
    <tr>
      <td>
        <span className="resources-code-badge">{code}</span>
      </td>
      <td className="resources-cell--name">{resource.name}</td>
      <td>{t(KIND_KEY[resource.kind])}</td>
      <td>
        <span className={`resources-status-badge resources-status-badge--${resource.status}`}>
          {t(STATUS_KEY[resource.status])}
        </span>
        {resource.statusReason ? (
          <span className="resources-reason">{resource.statusReason}</span>
        ) : null}
      </td>
      <td>
        {/* 行内改状态：div → 真 <form onSubmit>（FORM-UNIFY B3）。.resources-action 类不变（CSS 按类命中、
            tag 改为 form 像素零变）；apply 改 type=submit（消除 type=button onClick 提交歧异）。
            紧凑行内控件用 aria-label（无可见 label）→ 不套 Field：包 Field 会引入可见 <span> 标签 +
            kb-field 列向外壳，破坏 .resources-action 横排（视觉回退），故按「零视觉回退」铁律保留裸控件。 */}
        <form className="resources-action" onSubmit={apply}>
          <select
            value={status}
            aria-label={t('resources.action.statusLabel')}
            onChange={(e) => setStatus(e.target.value as ResourceStatus)}
          >
            {STATUSES.map((s) => (
              <option value={s} key={s}>
                {t(STATUS_OPTION_KEY[s])}
              </option>
            ))}
          </select>
          <input
            className="resources-reason-input"
            value={reason}
            placeholder={t('resources.action.reasonPlaceholder')}
            aria-label={t('resources.action.reasonLabel')}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="submit"
            className="kb-submit resources-apply"
            disabled={!dirty || mutation.isPending}
          >
            {mutation.isPending
              ? t('resources.action.applying')
              : t('resources.action.apply')}
          </button>
        </form>
        {/* resources-row-error = 纯红字（仅 color/font-size 11px/margin，无背景/内边距/圆角）；
            FormBanner--err 是红底色块（red-soft 背景 + padding 7/11 + radius 7 + 600 字重）样式不同，
            换成 banner 会视觉回退 → 按像素规则保留原内联渲染（结构上仍在 form 之后、不挪布局）。 */}
        {mutation.error ? (
          <p className="resources-row-error">
            {t('resources.action.error', { detail: errorDetail(mutation.error) })}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
