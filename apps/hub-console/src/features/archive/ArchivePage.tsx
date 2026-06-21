import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, FilePlus } from 'lucide-react';
import type { ArtifactRef } from '@teamhub/hub-contracts';
import { nextArtifactVersionNo } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { CreateArtifactRequest } from '../../api/schemas/pm';
import { useI18n, type TranslationKey } from '../../i18n';
import { errorDetail, segClass } from '../../utils';
import { MetaRow } from '../../components/MetaRow';
import { SeasonSelect, guessSeason } from '../../components/SeasonSelect';
import { Combobox } from '../../components/Combobox';
import { FormActions } from '../../components/FormActions';
import { Field } from '../../components/Field';
import { SegToggle } from '../../components/SegToggle';

type OwnerGroup = 'mechanical' | 'electrical' | 'ec' | 'vision';

// 组别顺序 + 文案键（新增组别在此处一处登记；枚举漏配会编译报错）。
// TODO(backend): 该枚举/顺序应从 hub-contracts 中心导出（OwnerGroup + 顺序），
// 前端不再各自写死；当前本批次保持前端常量，待 contracts 落地后改为导入。
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

// 上传文件后缀白名单（与 server ARTIFACT_ALLOWED_EXT 对齐）：CAD / 文档 / 图 / 包 / 固件。
// 前端 accept 仅是提示，真正把关在 server（415）。
const ARTIFACT_ACCEPT =
  '.step,.stp,.iges,.igs,.sldprt,.sldasm,.slddrw,.dwg,.f3d,.pdf,.md,.txt,.png,.jpg,.jpeg,.zip,.bin,.hex';

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

  // 读写分页：查看档案（读，默认，高频）/ 新登记（写）。仿 KbSearchPage 的 seg 标签。
  const [tab, setTab] = useState<'view' | 'register'>('view');
  // 查看 tab 内的学科组横向切换：只展开当前组的机构列表（避免四组纵向全摊开页面极长）。
  const [viewGroup, setViewGroup] = useState<OwnerGroup>('mechanical');

  const query = useQuery({
    queryKey: ['artifacts', source],
    queryFn: () => client.getArtifacts(),
  });

  // 机器人台账（适配机器人组合框候选源）：复用 ResourcesPage 同 key 缓存，缺失则组合框退化为纯手填。
  const resourcesQuery = useQuery({
    queryKey: ['resources', source],
    queryFn: () => client.getResources(),
  });

  const sections = useMemo(
    () => groupArtifacts(query.data?.artifacts ?? []),
    [query.data],
  );

  // 适配机器人候选：「通用」+ 台账里 kind=robot 的 displayCode（如 26R1/26R2），去重保序。
  const robotOptions = useMemo(() => {
    const robots = (resourcesQuery.data?.resources ?? [])
      .filter((r) => r.kind === 'robot')
      .map((r) => r.displayCode ?? r.name);
    return Array.from(new Set([t('enum.robot.universal'), ...robots]));
  }, [resourcesQuery.data, t]);

  // 登记表单状态 v2（I0：无提交人字段）
  const [ownerGroup, setOwnerGroup] = useState<OwnerGroup>('mechanical');
  const [season, setSeason] = useState(() => guessSeason(now));
  // 适配机器人：自由串（候选 + 手填），默认空、必填（战队编号会变，旧固定三选已放开）。
  const [robotCode, setRobotCode] = useState('');
  const [isNewMechanism, setIsNewMechanism] = useState(false);
  const [mechanism, setMechanism] = useState('');
  const [mechanismNew, setMechanismNew] = useState('');
  const [subType, setSubType] = useState<'drawing' | 'driver'>('drawing');
  const [name, setName] = useState('');
  const [uri, setUri] = useState('');
  // 文件来源「都能填」：本地上传文件 + 云端链接(uri) 可同时给，互不排斥（下载本地、打开云端两按钮并列）。
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // 登记 = 创建元数据；若选了文件则链式上传（两步，文件可缺）。任一步错都抛给 mutation.error 显示。
  const mutation = useMutation({
    mutationFn: async (vars: { req: CreateArtifactRequest; file: File | null }) => {
      const res = await client.createArtifact(vars.req);
      if (vars.file) {
        await client.uploadArtifactFile(res.artifact.id, vars.file);
      }
      return res;
    },
    onSuccess: () => {
      setMechanism('');
      setMechanismNew('');
      setIsNewMechanism(false);
      setName('');
      setUri('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setRelatedCommit('');
      setRelatedRepo('');
      void queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    },
  });

  // uri / 文件均可选；机构 + 名称 + 赛季 + 适配机器人 必填。
  const valid =
    effectiveMechanism.trim() && name.trim() && season.trim() && robotCode.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const mech = effectiveMechanism.trim();
    const req: CreateArtifactRequest = {
      ownerGroup,
      season: season.trim(),
      robotCode: robotCode.trim(),
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
    mutation.mutate({ req, file });
  }

  // 登记表单：始终渲染，不受 sections.length 守门（否则空档案时无法录入第一条）。
  const form = (
    <section className="panel pm-create" aria-label={t('archive.form.title')}>
      <div className="panel-header">
        <h2>{t('archive.form.title')}</h2>
      </div>
      <form className="pm-form" onSubmit={submit}>
        {/* 顶部一行：组别（4 seg）｜ 赛季（组合框）｜ 适配机器人（组合框：候选+手填）*/}
        <div className="archive-top-row">
          {/* 组别 seg → SegToggle（FORM-UNIFY B3）：吐同款 div.seg[role=group] + seg__btn(segClass)，像素零变；
              外层 Field（默认 label）保留 <label class="kb-field archive-field--group"><span> 外壳逐字一致。 */}
          <Field label={t('archive.form.group')} className="archive-field--group">
            <SegToggle
              value={ownerGroup}
              options={OWNER_GROUP_ORDER.map((g) => ({
                value: g,
                label: t(GROUP_LABEL_KEY[g]),
              }))}
              onChange={setOwnerGroup}
              ariaLabel={t('archive.form.group')}
            />
          </Field>

          <label className="kb-field archive-field--season">
            <span>{t('archive.form.season')}</span>
            <SeasonSelect now={now} value={season} onChange={setSeason} />
          </label>

          <label className="kb-field archive-field--robot">
            <span>{t('archive.form.robot')}</span>
            <Combobox
              value={robotCode}
              onChange={setRobotCode}
              options={robotOptions}
              placeholder={t('archive.form.robotHint')}
              ariaLabel={t('archive.form.robot')}
            />
          </label>
        </div>

        {/* 电路子类型 seg → SegToggle（FORM-UNIFY B3）：吐同款 div.seg + seg__btn(segClass)，像素零变。
            hint 仍走 archive-file-hint 子节点（非 Field.hint：archive-file-hint 与 kb-field__hint 字号/字重不同，
            用 Field.hint 会换类致像素变），故作 Field 的子节点排在 SegToggle 之后、顺序与原 label 一致。 */}
        {ownerGroup === 'electrical' ? (
          <Field label={t('archive.form.subType')}>
            <SegToggle
              value={subType}
              options={[
                { value: 'drawing' as const, label: t('enum.subType.drawing') },
                { value: 'driver' as const, label: t('enum.subType.driver') },
              ]}
              onChange={setSubType}
              ariaLabel={t('archive.form.subType')}
            />
            <span className="archive-file-hint">{t('archive.form.subTypeHint')}</span>
          </Field>
        ) : null}

        {/* 机构：新机构勾选框切文本 / 否则下拉。外层 div.kb-field → Field as="div"（FORM-UNIFY B3）：
            Field as="div" 吐 <div class="kb-field"><span>label</span>{children}</div>，与原 DOM/类逐字一致、像素零变；
            内层 archive-mechanism-row（含 checkbox 行）原样作子节点。 */}
        <Field label={t('archive.form.mechanism')} as="div">
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
        </Field>

        {/* 版本预览（只读）*/}
        {versionPreview ? (
          <div className="kb-field">
            <span className="archive-version-preview">
              {t('archive.form.versionPreview', { label: versionPreview })}
            </span>
          </div>
        ) : null}

        <label className="kb-field">
          <span>{t('archive.form.name')}</span>
          <input
            value={name}
            placeholder={t('archive.form.nameHint')}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {/* 「来源」一组：云端链接(uri) 与 本地文件可同时填——本地存 + 云端引用双保险，合并减少独立行数。
            fieldset/legend → Field as="fieldset"（FORM-UNIFY B3）：吐 <fieldset class="kb-field archive-source-group">
            + <legend>label</legend>{children}，与原 DOM/类逐字一致、像素零变。sourceHint 仍走 archive-file-hint
            子节点（非 Field.hint：字号/字重不同），顺序排在栅格之后与原 fieldset 一致。 */}
        <Field
          label={t('archive.form.source')}
          as="fieldset"
          className="archive-source-group"
        >
          <div className="pm-form__grid">
            <label className="kb-field">
              <span>{t('archive.form.uri')}</span>
              <input
                value={uri}
                placeholder={t('archive.form.uriHint')}
                onChange={(e) => setUri(e.target.value)}
              />
            </label>
            <label className="kb-field">
              <span>{t('archive.form.file')}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept={ARTIFACT_ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <span className="archive-file-hint">{t('archive.form.sourceHint')}</span>
        </Field>

        {/* 关联仓库/提交：仅 electrical && driver 时显示，两字段并排 */}
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

        <FormActions
          submitLabel={t('archive.form.submit')}
          submittingLabel={t('archive.form.submitting')}
          submitting={mutation.isPending}
          disabled={!valid}
          error={
            mutation.error
              ? // 401/未授权派生为专用文案、其余带 detail；FormBanner 不另起类（§1.3.4）。
                /401|unauthorized/i.test(errorDetail(mutation.error))
                ? t('archive.form.error401')
                : t('archive.form.error', { detail: errorDetail(mutation.error) })
              : null
          }
          success={
            mutation.isSuccess
              ? t('archive.form.success', {
                  name: mutation.data.artifact.name,
                  revision: mutation.data.artifact.revision ?? '',
                })
              : null
          }
        />
      </form>
    </section>
  );

  // 单个分组段落渲染（机构两级 + 版本行），view tab 复用。
  const renderSection = (section: OwnerGroupSection) => {
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
                  client={client}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    );
  };

  // 查看 tab：横向学科组 seg + 当前组段落。未分组历史桶（ownerGroup=null）不在 4 个 seg 内，
  // 故单独垫在当前组下方，保证历史数据仍可达。
  const currentSection = sections.find((s) => s.ownerGroup === viewGroup) ?? null;
  const ungroupedSection = sections.find((s) => s.ownerGroup === null) ?? null;

  const viewContent = (
    <div className="archive-view">
      <div className="seg archive-group-seg" role="group" aria-label={t('archive.view.groupFilter')}>
        {OWNER_GROUP_ORDER.map((g) => (
          <button
            key={g}
            type="button"
            className={segClass(viewGroup === g)}
            onClick={() => setViewGroup(g)}
          >
            {t(GROUP_LABEL_KEY[g])}
          </button>
        ))}
      </div>
      {query.isLoading ? (
        <div className="state-band" role="status" aria-live="polite">{t('archive.loading')}</div>
      ) : query.error || !query.data ? (
        <div className="state-band state-band-error" role="alert">{t('archive.error')}</div>
      ) : sections.length === 0 ? (
        <div className="state-band">{t('archive.empty')}</div>
      ) : (
        <>
          {currentSection ? (
            renderSection(currentSection)
          ) : (
            <div className="state-band">{t('archive.groupEmpty')}</div>
          )}
          {ungroupedSection ? renderSection(ungroupedSection) : null}
        </>
      )}
    </div>
  );

  return (
    <div className="archive-page">
      <div className="seg kb-tabs" role="tablist" aria-label={t('archive.form.title')}>
        <button
          type="button"
          role="tab"
          id="archive-tab-view-btn"
          aria-selected={tab === 'view'}
          aria-controls="archive-tab-view"
          className={segClass(tab === 'view')}
          onClick={() => setTab('view')}
        >
          <FolderOpen size={14} aria-hidden="true" /> {t('archive.tab.view')}
        </button>
        <button
          type="button"
          role="tab"
          id="archive-tab-register-btn"
          aria-selected={tab === 'register'}
          aria-controls="archive-tab-register"
          className={segClass(tab === 'register')}
          onClick={() => setTab('register')}
        >
          <FilePlus size={14} aria-hidden="true" /> {t('archive.tab.register')}
        </button>
      </div>
      {tab === 'view' ? (
        <div role="tabpanel" id="archive-tab-view" aria-labelledby="archive-tab-view-btn" tabIndex={0}>
          {viewContent}
        </div>
      ) : (
        <div
          role="tabpanel"
          id="archive-tab-register"
          aria-labelledby="archive-tab-register-btn"
          tabIndex={0}
        >
          {form}
        </div>
      )}
    </div>
  );
}

function ArtifactLogRow({
  artifact,
  lang,
  client,
}: {
  artifact: ArtifactRef;
  lang: 'zh' | 'en';
  client: HubApiClient;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 行内上传/替换：给这条图纸补传或换本地文件（不新增版本行，覆盖 storedFile）。
  const upload = useMutation({
    mutationFn: (f: File) => client.uploadArtifactFile(artifact.id, f),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['artifacts'] }),
  });
  // 单个版本徽章：优先 versionNo（v3），旧裸 seed 缺则用 revision 兜底。
  const versionLabel =
    artifact.versionNo != null
      ? `v${artifact.versionNo}`
      : (artifact.revision ?? null);
  // 适配机器人徽章：遗留字面 universal → 「通用」；其余（含手填 26R1）原样显示。
  const robotLabel = artifact.robotCode
    ? artifact.robotCode === 'universal'
      ? t('enum.robot.universal')
      : artifact.robotCode
    : null;
  const hasFile = Boolean(artifact.storedFile);
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
      {/* 文件来源「连在一起」：本地下载 + 云端打开两个动作并列、有谁显谁；都无则灰显。
          再加行内上传/替换。下载直链命中 GET /api/artifacts/:id/download（读端点、无需令牌）。
          FORM-UNIFY B3：行内上传 = 即时控件（§1.3.7）——按钮触发隐藏 file input、选中即 upload.mutate，
          不套表单、无提交按钮；故不补 <form>。 */}
      <div className="archive-row__actions">
        {hasFile ? (
          <a
            className="archive-download"
            href={`/api/artifacts/${encodeURIComponent(artifact.id)}/download`}
            download
          >
            {t('archive.download')}
          </a>
        ) : null}
        {artifact.uri ? (
          <a
            className="archive-download archive-openlink"
            href={artifact.uri}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('archive.openLink')}
          </a>
        ) : null}
        {!hasFile && !artifact.uri ? (
          <span className="archive-nofile">{t('archive.noFile')}</span>
        ) : null}
        <button
          type="button"
          className="archive-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending
            ? t('archive.uploading')
            : hasFile
              ? t('archive.replaceFile')
              : t('archive.uploadFile')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ARTIFACT_ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = ''; // 允许同名文件再次触发 change
          }}
        />
        {/* archive-upload-err = 纯红字（color/font-size 11.5px/max-width 12rem，无背景/内边距/圆角），
            与 FormBanner--err 的红底色块（red-soft 背景 + padding + radius + 600 字重）样式不同；
            行内动作区窄列里塞 banner 会撑破布局 → 按像素规则保留原内联渲染，不换 FormBanner。 */}
        {upload.error ? (
          <span className="archive-upload-err">
            {/401|unauthorized/i.test(errorDetail(upload.error))
              ? t('archive.form.error401')
              : t('archive.uploadError', { detail: errorDetail(upload.error) })}
          </span>
        ) : null}
      </div>
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
