import { useState } from 'react';
import type { HubApiClient } from '../../../api/client';
import { useI18n, type TranslationKey } from '../../../i18n';
import { segClass } from '../../../utils';
import {
  type OwnerGroup,
  OWNER_GROUP_ORDER,
  GROUP_LABEL_KEY,
} from '../../../verticals/robotics';
import { ArtifactLogRow } from '../ArtifactLogRow';
import type { OwnerGroupSection } from './grouping';

export function ArchiveViewTab({
  client,
  sections,
  isLoading,
  hasError,
  hasData,
  uploadDisabled,
  lang,
}: {
  client: HubApiClient;
  sections: OwnerGroupSection[];
  isLoading: boolean;
  hasError: boolean;
  hasData: boolean;
  uploadDisabled: boolean;
  lang: 'zh' | 'en';
}) {
  const { t } = useI18n();
  // 查看 tab 内的学科组横向切换：只展开当前组的机构列表（避免四组纵向全摊开页面极长）。
  const [viewGroup, setViewGroup] = useState<OwnerGroup>('mechanical');

  // 单个分组段落渲染（机构两级 + 版本行），view tab 复用。
  const renderSection = (section: OwnerGroupSection) => {
    // 读侧 ownerGroup 已放宽为开放 string（HUB-MODULARIZATION 第6步）：机器人已知值走 i18n 文案，
    // 非机器人已知值（理论上今天不会出现，属未来垂直包/脏数据兜底）原样显示，不查表崩溃。
    const groupKey = section.ownerGroup
      ? (GROUP_LABEL_KEY as Partial<Record<string, TranslationKey>>)[section.ownerGroup]
      : undefined;
    const sectionLabel = groupKey
      ? t(groupKey)
      : (section.ownerGroup ?? t('archive.ungrouped'));
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
              <h3 className="archive-mechanism-title">{group.mechanism}</h3>
              <span>{t('archive.group.count', { n: group.entries.length })}</span>
            </div>
            <div className="stack-list">
              {group.entries.map((artifact) => (
                <ArtifactLogRow
                  artifact={artifact}
                  key={artifact.id}
                  lang={lang}
                  client={client}
                  uploadDisabled={uploadDisabled}
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

  return (
    <div className="archive-view">
      <div className="seg archive-group-seg" role="group" aria-label={t('archive.view.groupFilter')}>
        {OWNER_GROUP_ORDER.map((g) => (
          <button
            key={g}
            type="button"
            className={segClass(viewGroup === g)}
            aria-pressed={viewGroup === g}
            onClick={() => setViewGroup(g)}
          >
            {t(GROUP_LABEL_KEY[g])}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="state-band" role="status" aria-live="polite">{t('archive.loading')}</div>
      ) : hasError || !hasData ? (
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
}
