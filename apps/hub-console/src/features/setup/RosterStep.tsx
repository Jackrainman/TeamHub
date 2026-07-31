import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  deriveLeafGroups,
  type Group,
  type RosterImportReport,
  type RosterImportRow,
  type RosterPreviewResponse,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { humanizeFormError } from '../../utils';
import { RosterPreviewTable } from '../settings/RosterPreviewTable';
import { RosterReportView } from '../../shared/roster';

// ② 导入名册 CSV（刀⑦ 预览表可编辑）：上传 → preview 只解析不落库 → RosterPreviewTable 行内编辑
// （年级下拉 / 组 datalist）→ 确认后 JSON 导入 → 报告回显；名册已就绪可直接下一步（死锁恢复场景
// 成员早导入过）。
// WIZARD-ROSTER-INVALIDATE 修复刀：确认导入后必须失效 ['members']/['groups']——门级 membersQuery/
// groupsQuery 在「你是谁」步就取过数，导入不落缓存刷新，第③步（leads）拿到的就是旧空名册
// （known-bugs 2026-07-28 #2「页2导入成员后页3不显示」根因）。
export function RosterStep({
  client,
  groups,
  onNext,
}: {
  client: HubApiClient;
  groups: readonly Group[];
  onNext: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
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
      // 导入落库了成员（可能还自动建了组）→ 失效门级缓存，leads 步才能看到新名册。
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
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
