import { useMemo, useState } from 'react';
import { FolderOpen, FilePlus } from 'lucide-react';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { useArtifacts } from './hooks';
import { useSystemStatus } from '../system/hooks';
import { useResources } from '../schedule/hooks';
import { segClass } from '../../utils';
import { ArtifactRegisterForm } from './sub/ArtifactRegisterForm';
import { ArchiveViewTab } from './sub/ArchiveViewTab';
import { groupArtifacts } from './sub/grouping';

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
  const now = useMemo(() => new Date(), []);

  // 读写分页：查看档案（读，默认，高频）/ 新登记（写）。仿 KbSearchPage 的 seg 标签。
  const [tab, setTab] = useState<'view' | 'register'>('view');

  const query = useArtifacts(client, source);

  // K3 部署信息：服务器未配 TEAMHUB_ARTIFACT_FILES_DIR（deployment.artifactUploadEnabled===false）时，
  // 上传会裸报 400——据此禁用行内上传按钮 + title 说明。共享设置页同 query 缓存（['system-status', source]）。
  // 仅 ===false 才禁（旧后端不回 deployment 字段时保持可用，不误伤）。
  const statusQuery = useSystemStatus(client, source);
  const uploadDisabled =
    statusQuery.data?.deployment?.artifactUploadEnabled === false;

  // 机器人台账（适配机器人组合框候选源）：复用 ResourcesPage 同 key 缓存，缺失则组合框退化为纯手填。
  const resourcesQuery = useResources(client, source);

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
          <ArchiveViewTab
            client={client}
            sections={sections}
            isLoading={query.isLoading}
            hasError={!!query.error}
            hasData={!!query.data}
            uploadDisabled={uploadDisabled}
            lang={lang}
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="archive-tab-register"
          aria-labelledby="archive-tab-register-btn"
          tabIndex={0}
        >
          <ArtifactRegisterForm
            client={client}
            now={now}
            robotOptions={robotOptions}
            artifacts={query.data?.artifacts ?? []}
          />
        </div>
      )}
    </div>
  );
}
