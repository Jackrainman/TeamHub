import type { MemberGrade, RosterImportReport } from '@teamhub/hub-contracts';
import { useI18n, type TranslationKey } from '../i18n';

export const GRADE_KEY: Record<MemberGrade, TranslationKey> = {
  freshman: 'settings.reviewers.grade.freshman',
  sophomore: 'settings.reviewers.grade.sophomore',
  junior: 'settings.reviewers.grade.junior',
  senior: 'settings.reviewers.grade.senior',
  graduate: 'settings.reviewers.grade.graduate',
  grad1: 'settings.reviewers.grade.grad1',
  grad2: 'settings.reviewers.grade.grad2',
  grad3: 'settings.reviewers.grade.grad3',
};

export function RosterReportView({ report }: { report: RosterImportReport }) {
  const { t } = useI18n();
  const segs: Array<{ key: string; labelKey: TranslationKey; names: readonly string[] }> = [
    { key: 'created', labelKey: 'settings.roster.report.created', names: report.created },
    { key: 'updated', labelKey: 'settings.roster.report.updated', names: report.updated },
    {
      key: 'createdGroups',
      labelKey: 'settings.roster.report.createdGroups',
      names: report.createdGroups,
    },
    {
      key: 'autoReviewers',
      labelKey: 'settings.roster.report.autoReviewers',
      names: report.autoReviewers,
    },
    {
      key: 'missingFromSheet',
      labelKey: 'settings.roster.report.missingFromSheet',
      names: report.missingFromSheet,
    },
  ];
  const anyContent = report.failed.length > 0 || segs.some((s) => s.names.length > 0);

  return (
    <div className="roster-report" role="status" aria-live="polite">
      <p className="roster-report__title">{t('settings.roster.report.title')}</p>
      {report.failed.length > 0 ? (
        <div className="roster-report__fail">
          <strong>
            {t('settings.roster.report.failed', { count: report.failed.length })}
          </strong>
          <ul>
            {report.failed.map((f, i) => (
              <li key={i}>
                {t('settings.roster.report.failedRow', { line: f.line, reason: f.reason })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {segs.map((s) =>
        s.names.length > 0 ? (
          <p className="roster-report__seg" key={s.key}>
            <span className="roster-report__label">{t(s.labelKey)}</span>
            <span>{s.names.join('、')}</span>
          </p>
        ) : null,
      )}
      {!anyContent ? (
        <p className="settings-desc">{t('settings.roster.report.empty')}</p>
      ) : null}
    </div>
  );
}
