import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { ArtifactRef } from '@teamhub/hub-contracts';
import { nextArtifactVersionNo } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import type { CreateArtifactRequest } from '@teamhub/hub-contracts';
import { useHubMutation } from '../../../hooks/useHubMutation';
import { useI18n } from '../../../i18n';
import { humanizeFormError } from '../../../utils';
import { SeasonSelect, guessSeason } from '../../../components/SeasonSelect';
import { Combobox } from '../../../components/Combobox';
import { FormActions } from '../../../components/FormActions';
import { Field } from '../../../components/Field';
import { SegToggle } from '../../../components/SegToggle';
import {
  type OwnerGroup,
  OWNER_GROUP_ORDER,
  GROUP_LABEL_KEY,
} from '../../../verticals/robotics';
import { ARTIFACT_ACCEPT } from './constants';

export function ArtifactRegisterForm({
  client,
  now,
  robotOptions,
  artifacts,
}: {
  client: HubApiClient;
  now: Date;
  robotOptions: string[];
  artifacts: ArtifactRef[];
}) {
  const { t } = useI18n();

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
    const seen = new Set<string>();
    for (const a of artifacts) {
      if (a.ownerGroup === ownerGroup && a.season === season && a.mechanism) {
        seen.add(a.mechanism);
      }
    }
    return Array.from(seen).sort();
  }, [artifacts, ownerGroup, season]);

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
    const vno = nextArtifactVersionNo(artifacts, {
      ownerGroup,
      season,
      mechanism: mech,
    });
    return `${mech} · v${vno}`;
  }, [artifacts, ownerGroup, season, effectiveMechanism]);

  // 登记 = 创建元数据；若选了文件则链式上传（两步，文件可缺）。两步不再绑死一次判败：
  // 元数据落盘后若仅上传失败，记住已建的 artifact（pendingArtifact），下次提交若元数据未变
  // 则跳过 createArtifact 只重传文件——避免「点重试」重复建一条记录。
  const [pendingArtifact, setPendingArtifact] = useState<{
    req: CreateArtifactRequest;
    artifact: ArtifactRef;
  } | null>(null);

  const mutation = useHubMutation({
    meta: { silent: true },
    invalidateKeys: [['artifacts']],
    mutationFn: async (vars: { req: CreateArtifactRequest; file: File | null }) => {
      const reusable =
        pendingArtifact && JSON.stringify(pendingArtifact.req) === JSON.stringify(vars.req);
      const artifact = reusable
        ? pendingArtifact.artifact
        : (await client.createArtifact(vars.req)).artifact;
      if (vars.file) {
        try {
          await client.uploadArtifactFile(artifact.id, vars.file);
        } catch (err) {
          setPendingArtifact({ req: vars.req, artifact });
          setFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          throw err;
        }
      }
      return { artifact };
    },
    onSuccess: () => {
      setPendingArtifact(null);
      setMechanism('');
      setMechanismNew('');
      setIsNewMechanism(false);
      setName('');
      setUri('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setRelatedCommit('');
      setRelatedRepo('');
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

  return (
    <section className="panel pm-create" aria-label={t('archive.form.title')}>
      <div className="panel-header">
        <h2>{t('archive.form.title')}</h2>
      </div>
      <form className="pm-form" onSubmit={submit}>
        {/* 顶部一行：组别（4 seg）｜ 赛季（组合框）｜ 适配机器人（组合框：候选+手填）*/}
        <div className="archive-top-row">
          {/* 组别 seg 用 SegToggle，外层 Field 与原 label 外壳逐字一致（DOM/类像素零变）。 */}
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
            <span>
              {t('archive.form.season')}
              <span className="kb-field__req" aria-hidden="true"> *</span>
            </span>
            <SeasonSelect now={now} value={season} onChange={setSeason} />
          </label>

          <label className="kb-field archive-field--robot">
            <span>
              {t('archive.form.robot')}
              <span className="kb-field__req" aria-hidden="true"> *</span>
            </span>
            <Combobox
              value={robotCode}
              onChange={setRobotCode}
              options={robotOptions}
              placeholder={t('archive.form.robotHint')}
              ariaLabel={t('archive.form.robot')}
              required
            />
          </label>
        </div>

        {/* 电路子类型 seg 用 SegToggle（像素零变）；hint 保持 archive-file-hint 子节点——
            它与 Field.hint 样式不同，换用会致像素变。 */}
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

        {/* 机构：新机构勾选框切文本 / 否则下拉。Field as="div" 保持原 div.kb-field DOM 结构（像素零变）。 */}
        <Field label={t('archive.form.mechanism')} as="div" required>
          <div className="archive-mechanism-row">
            {/* 该组合下无既有机构时已强制走文本框（usingTextInput 恒真），勾选框无实际作用只造成
                「勾了才是新机构」的错觉——此时隐藏，见 mechanismOptions.length 判断。 */}
            {mechanismOptions.length > 0 ? (
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
            ) : null}
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
          <span>
            {t('archive.form.name')}
            <span className="kb-field__req" aria-hidden="true"> *</span>
          </span>
          <input
            value={name}
            placeholder={t('archive.form.nameHint')}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {/* 「来源」一组：云端链接(uri) 与本地文件可同时填（本地存 + 云端引用双保险）。
            Field as="fieldset" 保持原 fieldset/legend DOM（像素零变）；sourceHint 走 archive-file-hint
            子节点（与 Field.hint 样式不同）。 */}
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
              ? pendingArtifact
                ? t('archive.form.uploadPartialError')
                : humanizeFormError(mutation.error, t, 'archive.form.error')
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
}
