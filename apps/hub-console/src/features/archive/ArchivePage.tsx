import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ArtifactRef } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { CreateArtifactRequest } from '../../api/schemas/pm';
import { useI18n, type TranslationKey } from '../../i18n';

// ArtifactKind → 文案键（类型安全：后端枚举变更会在此处编译报错）。复用总览已有的 enum.artifact.* 键。
const ARTIFACT_KIND_KEY: Record<ArtifactRef['kind'], TranslationKey> = {
  firmware: 'enum.artifact.firmware',
  log: 'enum.artifact.log',
  rosbag: 'enum.artifact.rosbag',
  image: 'enum.artifact.image',
  video: 'enum.artifact.video',
  report: 'enum.artifact.report',
  other: 'enum.artifact.other',
};

const ARTIFACT_KINDS: ArtifactRef['kind'][] = [
  'firmware',
  'log',
  'rosbag',
  'image',
  'video',
  'report',
  'other',
];

interface MechanismGroup {
  // 分组键：原始 mechanism（保持后端原样）或 null（未分组，渲染时落文案键）。
  mechanism: string | null;
  entries: ArtifactRef[];
}

// 档案页：图纸提交日志 / 版本时间线。按机构分组、组内按 createdAt 倒序，
// 每条只展示物料元信息（名称·版本·日期·关联提交·地址）。I0：归档物无人员字段，永不展示人/排名。
export function ArchivePage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['artifacts', source],
    queryFn: () => client.getArtifacts(),
  });

  const groups = useMemo(
    () => groupByMechanism(query.data?.artifacts ?? []),
    [query.data],
  );

  // 登记表单状态（I0：无提交人字段）
  const [mechanism, setMechanism] = useState('');
  const [revision, setRevision] = useState('');
  const [name, setName] = useState('');
  const [uri, setUri] = useState('');
  const [kind, setKind] = useState<ArtifactRef['kind']>('firmware');
  const [relatedCommit, setRelatedCommit] = useState('');
  const [relatedRepo, setRelatedRepo] = useState('');

  const mutation = useMutation({
    mutationFn: (req: CreateArtifactRequest) => client.createArtifact(req),
    onSuccess: () => {
      setMechanism('');
      setRevision('');
      setName('');
      setUri('');
      setKind('firmware');
      setRelatedCommit('');
      setRelatedRepo('');
      void queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    },
  });

  const valid = mechanism.trim() && revision.trim() && name.trim() && uri.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const req: CreateArtifactRequest = {
      kind,
      name: name.trim(),
      uri: uri.trim(),
      mechanism: mechanism.trim(),
      revision: revision.trim(),
    };
    if (relatedCommit.trim()) req.relatedCommit = relatedCommit.trim();
    if (relatedRepo.trim()) req.relatedRepo = relatedRepo.trim();
    mutation.mutate(req);
  }

  // 登记表单：始终渲染，不受 groups.length 守门（否则空档案时无法录入第一条）。
  const form = (
    <section className="panel pm-create" aria-label={t('archive.form.title')}>
      <div className="panel-header">
        <h2>{t('archive.form.title')}</h2>
      </div>
      <form className="pm-form" onSubmit={submit}>
        <div className="pm-form__grid">
          <label className="kb-field">
            <span>{t('archive.form.mechanism')}</span>
            <input
              value={mechanism}
              onChange={(e) => setMechanism(e.target.value)}
            />
          </label>
          <label className="kb-field">
            <span>{t('archive.form.revision')}</span>
            <input
              value={revision}
              onChange={(e) => setRevision(e.target.value)}
            />
          </label>
        </div>
        <div className="pm-form__grid">
          <label className="kb-field">
            <span>{t('archive.form.name')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="kb-field">
            <span>{t('archive.form.kind')}</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ArtifactRef['kind'])}
            >
              {ARTIFACT_KINDS.map((k) => (
                <option value={k} key={k}>
                  {t(ARTIFACT_KIND_KEY[k])}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="kb-field">
          <span>{t('archive.form.uri')}</span>
          <input
            value={uri}
            onChange={(e) => setUri(e.target.value)}
          />
        </label>
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
              {t('archive.form.error', { detail: errorDetail(mutation.error) })}
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
        <div className="state-band">{t('archive.loading')}</div>
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="archive-page">
        {form}
        <div className="state-band state-band-error">{t('archive.error')}</div>
      </div>
    );
  }

  if (groups.length === 0) {
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
      {groups.map((group) => (
        <section
          className="panel"
          key={group.mechanism ?? '__ungrouped__'}
          aria-label={group.mechanism ?? t('archive.ungrouped')}
        >
          <div className="panel-header">
            <h2>{group.mechanism ?? t('archive.ungrouped')}</h2>
            <span>{t('archive.group.count', { n: group.entries.length })}</span>
          </div>
          <div className="stack-list">
            {group.entries.map((artifact) => (
              <ArtifactLogRow artifact={artifact} key={artifact.id} lang={lang} />
            ))}
          </div>
        </section>
      ))}
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
  return (
    <article className="data-row archive-row">
      <div className="archive-row__main">
        <strong>{artifact.name}</strong>
        <span className="archive-row__meta">
          {artifact.revision ? (
            <span className="archive-badge">{artifact.revision}</span>
          ) : null}
          <span>{t(ARTIFACT_KIND_KEY[artifact.kind])}</span>
          <span>·</span>
          <span>{formatDate(artifact.createdAt, lang)}</span>
        </span>
      </div>
      <dl className="archive-row__detail">
        {artifact.relatedCommit ? (
          <ArchiveMeta
            label={t('archive.meta.commit')}
            value={artifact.relatedCommit}
            mono
          />
        ) : null}
        <ArchiveMeta label={t('archive.meta.uri')} value={artifact.uri} mono />
      </dl>
    </article>
  );
}

function ArchiveMeta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="archive-meta__row">
      <dt>{label}</dt>
      <dd className={mono ? 'kb-mono' : undefined}>{value}</dd>
    </div>
  );
}

// 按 mechanism 分组：未填 mechanism 的归到末尾的「未分组」组。组内 createdAt 倒序，
// 组顺序按组内最新一条 createdAt 倒序（最近活跃的机构排前面）。未分组组始终垫底。
function groupByMechanism(artifacts: ArtifactRef[]): MechanismGroup[] {
  const byKey = new Map<string | null, ArtifactRef[]>();
  for (const artifact of artifacts) {
    const key = artifact.mechanism ?? null;
    const list = byKey.get(key);
    if (list) {
      list.push(artifact);
    } else {
      byKey.set(key, [artifact]);
    }
  }

  const groups: MechanismGroup[] = [];
  for (const [mechanism, entries] of byKey) {
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    groups.push({ mechanism, entries });
  }

  groups.sort((a, b) => {
    // 未分组永远垫底。
    if (a.mechanism === null) return 1;
    if (b.mechanism === null) return -1;
    const latestA = a.entries[0]?.createdAt ?? '';
    const latestB = b.entries[0]?.createdAt ?? '';
    return latestB.localeCompare(latestA);
  });

  return groups;
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

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
