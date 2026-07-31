import { useRef, useState } from 'react';
import type { KbImportDocsReport } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { humanizeFormError } from '../../utils';
import { KB_DOC_ACCEPT, kbImportReportCounts } from './setup-utils';

// ⑦ 导入知识库（KB-BULK-MD-IMPORT 刀⑫）：多选 .md/.markdown → importKbDocs 整批上传（服务端
// 按 title 幂等去重）→ 三段报告回显（导入 N 篇 / 跳过 M / 失败 K，含逐条原因）；没有要导的可直接
// 「跳过」。AI 分析不做（backlog KB-AI-STRUCT）——本步只沉淀可检索文档。
export function KbStep({
  client,
  onNext,
}: {
  client: HubApiClient;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [report, setReport] = useState<KbImportDocsReport | null>(null);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setPending(true);
    setError(null);
    try {
      setReport(await client.importKbDocs(files));
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="setup-card setup-card--primary">
      <h2 className="setup-card__title">{t('gate.step.kb')}</h2>
      <p className="setup-card__desc">{t('gate.kb.desc')}</p>

      {/* A 段：排障笔记——历年 markdown 文档批量导入（保持原样）。 */}
      <div className="gate-section">
        <h3 className="gate-section__title">{t('gate.kb.notes.title')}</h3>
        <p className="setup-card__desc">{t('gate.kb.notes.desc')}</p>
        <div className="roster-import__actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
          >
            {pending ? t('gate.kb.uploading') : t('gate.kb.pick')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={KB_DOC_ACCEPT}
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) void upload(files);
              e.target.value = '';
            }}
          />
        </div>
        {error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(error, t, 'gate.kb.error')}
          </p>
        ) : null}
        {report ? (
          <>
            <p className="settings-desc">{t('gate.kb.report', kbImportReportCounts(report))}</p>
            {report.imported.length > 0 ? (
              <ul className="settings-desc">
                {report.imported.map((d) => (
                  <li key={d.id}>{d.title}</li>
                ))}
              </ul>
            ) : null}
            {[...report.skipped, ...report.failed].length > 0 ? (
              <ul className="settings-desc">
                {report.skipped.map((d, i) => (
                  <li key={`s${i}`}>
                    {d.title}（{d.reason}）
                  </li>
                ))}
                {report.failed.map((d, i) => (
                  <li key={`f${i}`}>
                    {d.title}（{d.reason}）
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>

      {/* B 段：Bug 快速记录——本刀不新增端点（结案归档要根因/处理全字段），仅引导进应用后到排障档案页录入。 */}
      <div className="gate-section">
        <h3 className="gate-section__title">{t('gate.kb.bug.title')}</h3>
        <p className="setup-card__desc">{t('gate.kb.bug.hint')}</p>
      </div>

      <button type="button" className="btn btn--primary" onClick={onNext}>
        {report ? t('gate.kb.next') : t('gate.kb.skip')}
      </button>
    </section>
  );
}
