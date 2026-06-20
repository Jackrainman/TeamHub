import { useState, type FormEvent } from 'react';
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
import { Field } from '../../components/Field';
import { MetricTile } from '../../components/MetricTile';

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

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['resources', source] });

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
                  <th>{t('resources.col.code')}</th>
                  <th>{t('resources.col.name')}</th>
                  <th>{t('resources.col.kind')}</th>
                  <th>{t('resources.col.status')}</th>
                  <th>{t('resources.col.actions')}</th>
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
  const [season, setSeason] = useState('26');
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
        <div className="pm-form__grid">
          <Field label={t('resources.field.season')}>
            <input value={season} onChange={(e) => setSeason(e.target.value)} />
          </Field>
          <Field label={t('resources.field.robotTarget')}>
            <select
              value={robotTarget}
              onChange={(e) => setRobotTarget(e.target.value as RobotTarget)}
            >
              {ROBOT_TARGETS.map((rt) => (
                <option value={rt} key={rt}>
                  {rt === 'shared' ? t('resources.robot.shared') : rt}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="pm-form__grid">
          <Field label={t('resources.field.name')}>
            <input
              value={name}
              placeholder={t('resources.field.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t('resources.field.kind')}>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ResourceKind)}
            >
              {KINDS.map((k) => (
                <option value={k} key={k}>
                  {t(KIND_KEY[k])}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="pm-form__grid">
          <Field label={t('resources.field.version')}>
            <input
              type="number"
              min={1}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </Field>
          <Field label={t('resources.field.preview')}>
            {/* 机器人编号是派生的、不让人手填——所以预览是只读徽章而非输入框。 */}
            <span className="resources-preview">
              <span className="resources-code-badge">{preview}</span>
            </span>
          </Field>
        </div>
        <div className="pm-form__footer">
          <button
            className="kb-submit"
            type="submit"
            disabled={!valid || mutation.isPending}
          >
            {mutation.isPending
              ? t('resources.create.submitting')
              : t('resources.create.submit')}
          </button>
          {mutation.isSuccess ? (
            <p className="form-banner form-banner--ok">
              {t('resources.create.success', {
                code: mutation.data.resource.displayCode ?? mutation.data.resource.name,
              })}
            </p>
          ) : null}
          {mutation.error ? (
            <p className="form-banner form-banner--err">
              {t('resources.create.error', { detail: errorDetail(mutation.error) })}
            </p>
          ) : null}
        </div>
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

  function apply() {
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
        <div className="resources-action">
          <select
            value={status}
            aria-label={t('resources.action.statusLabel')}
            onChange={(e) => setStatus(e.target.value as ResourceStatus)}
          >
            {STATUSES.map((s) => (
              <option value={s} key={s}>
                {t(STATUS_KEY[s])}
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
            type="button"
            className="kb-submit resources-apply"
            disabled={!dirty || mutation.isPending}
            onClick={apply}
          >
            {mutation.isPending
              ? t('resources.action.applying')
              : t('resources.action.apply')}
          </button>
        </div>
        {mutation.error ? (
          <p className="resources-row-error">
            {t('resources.action.error', { detail: errorDetail(mutation.error) })}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
