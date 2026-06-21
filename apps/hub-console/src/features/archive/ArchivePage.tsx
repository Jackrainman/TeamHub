import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ArtifactRef } from '@teamhub/hub-contracts';
import { nextArtifactVersionNo } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { CreateArtifactRequest } from '../../api/schemas/pm';
import { useI18n, type TranslationKey } from '../../i18n';
import { errorDetail, segClass } from '../../utils';
import { MetaRow } from '../../components/MetaRow';

// guessSeason：纯 UI helper，猜当前赛季年份（后两位数字字符串，如 "25"）。
// 赛季切换惯例：赛季年份 = 日历年 - 1（赛季到次年前数月结束）。
// 截止月：若当前月份 <= 4（1~4月），视为"上个赛季年"仍在进行，用 (year-1) 的后两位；否则用 year 后两位。
function guessSeason(now: Date): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  const seasonYear = month <= 4 ? year - 1 : year;
  return String(seasonYear).slice(-2);
}

// 从当前猜测赛季生成 ±2 年的选项列表（字符串后两位）
function seasonOptions(now: Date): string[] {
  const base = guessSeason(now);
  const baseYear = 2000 + parseInt(base, 10);
  return [-2, -1, 0, 1, 2].map((offset) =>
    String(baseYear + offset).slice(-2),
  );
}

type OwnerGroup = 'mechanical' | 'electrical' | 'ec' | 'vision';

// 组别顺序 + 文案键（新增组别在此处一处登记；枚举漏配会编译报错）。
const OWNER_GROUP_ORDER: readonly OwnerGroup[] = [
  'mechanical',
  'electrical',
  'ec',
  'vision',
];
const GROUP_LABEL_KEY: Record<OwnerGroup, TranslationKey> = {
  mechanical: 'enum.group.mechanical',
  electrical: 'enum.group.electrical',
  ec: 'enum.group.ec',
  vision: 'enum.group.vision',
};
// 适配机器人三选（值 + 显示）：universal=通用/不上固定机器人。
type RobotCode = 'R1' | 'R2' | 'universal';
const ROBOT_CODES: readonly RobotCode[] = ['R1', 'R2', 'universal'];

interface MechanismGroup {
  mechanism: string;
  entries: ArtifactRef[];
}

interface OwnerGroupSection {
  ownerGroup: OwnerGroup | null; // null = 未分组/历史桶
  mechanisms: MechanismGroup[];
}

// 两级分组：外层 ownerGroup（机械/电路）+ 未分组历史桶，内层 mechanism，组内 createdAt 倒序。
function groupArtifacts(artifacts: ArtifactRef[]): OwnerGroupSection[] {
  // 先按 ownerGroup 分桶
  const byOwner = new Map<OwnerGroup | null, Map<string, ArtifactRef[]>>();
  const ownerOrder: (OwnerGroup | null)[] = [];

  for (const artifact of artifacts) {
    const og: OwnerGroup | null = artifact.ownerGroup ?? null;
    if (!byOwner.has(og)) {
      byOwner.set(og, new Map());
      ownerOrder.push(og);
    }
    const mechMap = byOwner.get(og)!;
    const key = artifact.mechanism ?? '';
    if (!mechMap.has(key)) mechMap.set(key, []);
    mechMap.get(key)!.push(artifact);
  }

  // 构建结果：机械 → 电路 → 电控 → 视觉 → null（未分组历史桶垫底）
  const sorted: (OwnerGroup | null)[] = [];
  for (const og of OWNER_GROUP_ORDER) {
    if (byOwner.has(og)) sorted.push(og);
  }
  for (const og of ownerOrder) {
    if (og !== null && !OWNER_GROUP_ORDER.includes(og)) sorted.push(og);
    else if (og === null) sorted.push(og);
  }

  return sorted.map((og) => {
    const mechMap = byOwner.get(og)!;
    const mechanisms: MechanismGroup[] = [];
    for (const [mechanism, entries] of mechMap) {
      entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      mechanisms.push({ mechanism: mechanism || '（未知机构）', entries });
    }
    // 组内按最新一条倒序
    mechanisms.sort((a, b) => {
      const latestA = a.entries[0]?.createdAt ?? '';
      const latestB = b.entries[0]?.createdAt ?? '';
      return latestB.localeCompare(latestA);
    });
    return { ownerGroup: og, mechanisms };
  });
}

// 档案页：图纸提交日志 / 版本时间线（v2 机械/电路分组版本库）。
// 按学科组 + 机构两级分组，组内 createdAt 倒序，max(versionNo) 行打「当前版」徽章。
// I0：归档物无人员字段，永不展示人/排名。
export function ArchivePage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const now = useMemo(() => new Date(), []);

  const query = useQuery({
    queryKey: ['artifacts', source],
    queryFn: () => client.getArtifacts(),
  });

  const sections = useMemo(
    () => groupArtifacts(query.data?.artifacts ?? []),
    [query.data],
  );

  // 登记表单状态 v2（I0：无提交人字段）
  const [ownerGroup, setOwnerGroup] = useState<OwnerGroup>('mechanical');
  const [season, setSeason] = useState(() => guessSeason(now));
  const [robotCode, setRobotCode] = useState<RobotCode>('R1');
  const [isNewMechanism, setIsNewMechanism] = useState(false);
  const [mechanism, setMechanism] = useState('');
  const [mechanismNew, setMechanismNew] = useState('');
  const [subType, setSubType] = useState<'drawing' | 'driver'>('drawing');
  const [name, setName] = useState('');
  const [uri, setUri] = useState('');
  const [relatedCommit, setRelatedCommit] = useState('');
  const [relatedRepo, setRelatedRepo] = useState('');

  // 机构下拉选项：按当前 ownerGroup+season 过滤后去重（机构跨机器人共享，故不按机器人筛）。
  const mechanismOptions = useMemo(() => {
    const artifacts = query.data?.artifacts ?? [];
    const seen = new Set<string>();
    for (const a of artifacts) {
      if (a.ownerGroup === ownerGroup && a.season === season && a.mechanism) {
        seen.add(a.mechanism);
      }
    }
    return Array.from(seen).sort();
  }, [query.data, ownerGroup, season]);

  // ownerGroup/season 切换时重置 mechanism 下拉选中值，避免残留旧值在新组合下提交写错机构。
  useEffect(() => {
    setMechanism('');
  }, [ownerGroup, season]);

  // 当前机构值：勾了新机构、或该组合下无既有机构（空档案/新组首条）→ 走文本框；否则走下拉。
  // usingTextInput 必须与下方渲染条件一致，否则空档案时文本框可输入但 effectiveMechanism 恒空 → 无法录第一条。
  const usingTextInput = isNewMechanism || mechanismOptions.length === 0;
  const effectiveMechanism = usingTextInput ? mechanismNew : mechanism;

  // 版本预览：客户端用同一 nextArtifactVersionNo 算
  const versionPreview = useMemo(() => {
    const mech = effectiveMechanism.trim();
    if (!mech) return null;
    const existing = query.data?.artifacts ?? [];
    const vno = nextArtifactVersionNo(existing, {
      ownerGroup,
      season,
      mechanism: mech,
    });
    return `${mech} · v${vno}`;
  }, [query.data, ownerGroup, season, effectiveMechanism]);

  const mutation = useMutation({
    mutationFn: (req: CreateArtifactRequest) => client.createArtifact(req),
    onSuccess: () => {
      setMechanism('');
      setMechanismNew('');
      setIsNewMechanism(false);
      setName('');
      setUri('');
      setRelatedCommit('');
      setRelatedRepo('');
      void queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    },
  });

  // 地址(uri) 可选，不进必填校验。
  const valid =
    effectiveMechanism.trim() && name.trim() && season.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const mech = effectiveMechanism.trim();
    const req: CreateArtifactRequest = {
      ownerGroup,
      season: season.trim(),
      robotCode,
      mechanism: mech,
      name: name.trim(),
    };
    if (uri.trim()) req.uri = uri.trim();
    if (ownerGroup === 'electrical') {
      req.subType = subType;
    }
    if (ownerGroup === 'electrical' && subType === 'driver') {
      if (relatedCommit.trim()) req.relatedCommit = relatedCommit.trim();
      if (relatedRepo.trim()) req.relatedRepo = relatedRepo.trim();
    }
    mutation.mutate(req);
  }

  // 登记表单：始终渲染，不受 sections.length 守门（否则空档案时无法录入第一条）。
  const form = (
    <section className="panel pm-create" aria-label={t('archive.form.title')}>
      <div className="panel-header">
        <h2>{t('archive.form.title')}</h2>
      </div>
      <form className="pm-form" onSubmit={submit}>
        {/* 顶部一行：组别（4 seg）｜ 赛季（窄）｜ 适配机器人（R1/R2/通用 seg）*/}
        <div className="archive-top-row">
          <label className="kb-field archive-field--group">
            <span>{t('archive.form.group')}</span>
            <div className="seg" role="group" aria-label={t('archive.form.group')}>
              {OWNER_GROUP_ORDER.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={segClass(ownerGroup === g)}
                  onClick={() => setOwnerGroup(g)}
                >
                  {t(GROUP_LABEL_KEY[g])}
                </button>
              ))}
            </div>
          </label>

          <label className="kb-field archive-field--season">
            <span>{t('archive.form.season')}</span>
            <select value={season} onChange={(e) => setSeason(e.target.value)}>
              {seasonOptions(now).map((s) => (
                <option value={s} key={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="kb-field archive-field--robot">
            <span>{t('archive.form.robot')}</span>
            <div className="seg" role="group" aria-label={t('archive.form.robot')}>
              {ROBOT_CODES.map((rc) => (
                <button
                  key={rc}
                  type="button"
                  className={segClass(robotCode === rc)}
                  onClick={() => setRobotCode(rc)}
                >
                  {rc === 'universal' ? t('enum.robot.universal') : rc}
                </button>
              ))}
            </div>
          </label>
        </div>

        {/* 电路子类型（仅 electrical 时单独一行）*/}
        {ownerGroup === 'electrical' ? (
          <label className="kb-field">
            <span>{t('archive.form.subType')}</span>
            <div className="seg" role="group" aria-label={t('archive.form.subType')}>
              <button
                type="button"
                className={segClass(subType === 'drawing')}
                onClick={() => setSubType('drawing')}
              >
                {t('enum.subType.drawing')}
              </button>
              <button
                type="button"
                className={segClass(subType === 'driver')}
                onClick={() => setSubType('driver')}
              >
                {t('enum.subType.driver')}
              </button>
            </div>
          </label>
        ) : null}

        {/* 机构：新机构勾选框切文本 / 否则下拉 */}
        <div className="kb-field">
          <span>{t('archive.form.mechanism')}</span>
          <div className="archive-mechanism-row">
            <label className="archive-mechanism-checkbox">
              <input
                type="checkbox"
                checked={isNewMechanism}
                onChange={(e) => {
                  setIsNewMechanism(e.target.checked);
                  if (!e.target.checked) setMechanismNew('');
                }}
              />
              {t('archive.form.newMechanism')}
            </label>
            {usingTextInput ? (
              <input
                className="archive-mechanism-input"
                value={mechanismNew}
                placeholder={t('archive.form.mechanismHint')}
                onChange={(e) => setMechanismNew(e.target.value)}
              />
            ) : (
              <select
                className="archive-mechanism-select"
                value={mechanism}
                onChange={(e) => setMechanism(e.target.value)}
                aria-label={t('archive.form.mechanismSelect')}
              >
                <option value="">— {t('archive.form.mechanismSelect')} —</option>
                {mechanismOptions.map((m) => (
                  <option value={m} key={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* 版本预览（只读）*/}
        {versionPreview ? (
          <div className="kb-field">
            <span className="archive-version-preview">
              {t('archive.form.versionPreview', { label: versionPreview })}
            </span>
          </div>
        ) : null}

        <div className="pm-form__grid">
          <label className="kb-field">
            <span>{t('archive.form.name')}</span>
            <input
              value={name}
              placeholder={t('archive.form.nameHint')}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="kb-field">
            <span>{t('archive.form.uri')}</span>
            <input
              value={uri}
              onChange={(e) => setUri(e.target.value)}
            />
          </label>
        </div>

        {/* 关联仓库/提交：仅 electrical && driver 时显示 */}
        {ownerGroup === 'electrical' && subType === 'driver' ? (
          <div className="pm-form__grid">
            <label className="kb-field">
              <span>{t('archive.form.relatedCommit')}</span>
              <input
                value={relatedCommit}
                onChange={(e) => setRelatedCommit(e.target.value)}
              />
            </label>
            <label className="kb-field">
              <span>{t('archive.form.relatedRepo')}</span>
              <input
                value={relatedRepo}
                onChange={(e) => setRelatedRepo(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        <div className="pm-form__footer">
          <button
            className="kb-submit"
            type="submit"
            disabled={!valid || mutation.isPending}
          >
            {mutation.isPending ? t('archive.form.submitting') : t('archive.form.submit')}
          </button>
          {mutation.isSuccess ? (
            <p className="form-banner form-banner--ok">
              {t('archive.form.success', {
                name: mutation.data.artifact.name,
                revision: mutation.data.artifact.revision ?? '',
              })}
            </p>
          ) : null}
          {mutation.error ? (
            <p className="form-banner form-banner--err">
              {/401|unauthorized/i.test(errorDetail(mutation.error))
                ? t('archive.form.error401')
                : t('archive.form.error', {
                    detail: errorDetail(mutation.error),
                  })}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );

  if (query.isLoading) {
    return (
      <div className="archive-page">
        {form}
        <div className="state-band" role="status" aria-live="polite">{t('archive.loading')}</div>
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="archive-page">
        {form}
        <div className="state-band state-band-error" role="alert">{t('archive.error')}</div>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="archive-page">
        {form}
        <div className="state-band">{t('archive.empty')}</div>
      </div>
    );
  }

  return (
    <div className="archive-page">
      {form}
      {sections.map((section) => {
        const sectionLabel = section.ownerGroup
          ? t(GROUP_LABEL_KEY[section.ownerGroup])
          : t('archive.ungrouped');
        return (
          <section
            className="panel"
            key={section.ownerGroup ?? '__ungrouped__'}
            aria-label={sectionLabel}
          >
            <div className="panel-header">
              <h2>{sectionLabel}</h2>
            </div>
            {section.mechanisms.map((group) => (
              <div key={group.mechanism} className="archive-mech-group">
                <div className="panel-header" style={{ paddingTop: '0.5rem' }}>
                  <h3 style={{ fontSize: '0.95em', opacity: 0.85 }}>{group.mechanism}</h3>
                  <span>{t('archive.group.count', { n: group.entries.length })}</span>
                </div>
                <div className="stack-list">
                  {group.entries.map((artifact) => (
                    <ArtifactLogRow
                      artifact={artifact}
                      key={artifact.id}
                      lang={lang}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function ArtifactLogRow({
  artifact,
  lang,
}: {
  artifact: ArtifactRef;
  lang: 'zh' | 'en';
}) {
  const { t } = useI18n();
  // 单个版本徽章：优先 versionNo（v3），旧裸 seed 缺则用 revision 兜底。
  const versionLabel =
    artifact.versionNo != null
      ? `v${artifact.versionNo}`
      : (artifact.revision ?? null);
  // 适配机器人徽章：universal → 「通用」。
  const robotLabel = artifact.robotCode
    ? artifact.robotCode === 'universal'
      ? t('enum.robot.universal')
      : artifact.robotCode
    : null;
  return (
    <article className="data-row archive-row">
      <div className="archive-row__content">
        <div className="archive-row__main">
          <strong>{artifact.name}</strong>
          <span className="archive-row__meta">
            {versionLabel ? (
              <span className="archive-badge">{versionLabel}</span>
            ) : null}
            {robotLabel ? (
              <span className="archive-badge archive-badge--robot">
                {robotLabel}
              </span>
            ) : null}
            <span>
              {t('archive.meta.submittedAt')}{' '}
              {formatDate(artifact.createdAt, lang)}
            </span>
          </span>
        </div>
        <dl className="archive-row__detail">
          {artifact.relatedCommit ? (
            <MetaRow
              label={t('archive.meta.commit')}
              value={artifact.relatedCommit}
              mono
              rowClass="archive-meta__row"
            />
          ) : null}
          {artifact.uri ? (
            <MetaRow
              label={t('archive.meta.uri')}
              value={artifact.uri}
              mono
              rowClass="archive-meta__row"
            />
          ) : null}
        </dl>
      </div>
      {/* 下载：直链命中 server 的 GET /api/artifacts/:id/download（读端点、无需令牌）。
          目录里有对应 <id>.<ext> 文件才下得到，否则后端 404。 */}
      <a
        className="archive-download"
        href={`/api/artifacts/${encodeURIComponent(artifact.id)}/download`}
        download
      >
        {t('archive.download')}
      </a>
    </article>
  );
}

function formatDate(iso: string, lang: 'zh' | 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
