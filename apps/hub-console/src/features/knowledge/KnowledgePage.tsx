import { useState } from 'react';
import { Search, FileStack } from 'lucide-react';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { KbSearchPage } from '../kb/KbSearchPage';
import { ArchivePage } from '../archive/ArchivePage';

type KnowledgeTab = 'search' | 'archive';

// 知识页（IA 阶段 3 / D-075）：把「相似 Bug 检索（KbSearchPage）」+「图纸档案（ArchivePage）」
// 收进同一支柱『沉淀的知识』下的两个 Tab。
// **组合既有两页、不重写**——零改 KbSearchPage / ArchivePage（各自自带 loading/error band、
// 各自独立 react-query：['kb-similar'] / ['artifacts']，无 DOM id / query-key 冲突）。
// 无 @xyflow 画布，故无需 clamp 定高；隐藏 Tab 条件卸载（只 mount 激活那个），
// 与 KbSearchPage 内层 Tab 写法一致、最干净。
// 注意：KB 结果里的 archiveFileName 是『结案归档 markdown 文件名』(KB ArchiveDocument)，
// 与图纸档案 ArtifactRef 是两个数据域、无外键——故本页两 Tab 同域并置但无跨 Tab 跳转。
// I0 反监视：仅组合，无新增渲染数据；两子页结构上均无成员维度。
export function KnowledgePage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<KnowledgeTab>('search');
  return (
    <div className="knowledge-page">
      <div
        className="seg knowledge-tabs"
        role="tablist"
        aria-label={t('toolbar.title.knowledge')}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'search'}
          aria-controls="knowledge-tab-search"
          className={tab === 'search' ? 'seg__btn seg__btn--active' : 'seg__btn'}
          onClick={() => setTab('search')}
        >
          <Search size={14} aria-hidden="true" /> {t('knowledge.tab.search')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'archive'}
          aria-controls="knowledge-tab-archive"
          className={tab === 'archive' ? 'seg__btn seg__btn--active' : 'seg__btn'}
          onClick={() => setTab('archive')}
        >
          <FileStack size={14} aria-hidden="true" /> {t('knowledge.tab.archive')}
        </button>
      </div>
      {tab === 'search' ? (
        <div role="tabpanel" id="knowledge-tab-search" tabIndex={0}>
          <KbSearchPage client={client} source={source} />
        </div>
      ) : (
        <div role="tabpanel" id="knowledge-tab-archive" tabIndex={0}>
          <ArchivePage client={client} source={source} />
        </div>
      )}
    </div>
  );
}
