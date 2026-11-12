import type { ReimburseSummaryQuery } from '@teamhub/hub-contracts';
import type { ReimburseSegment } from '../api';
import { useReimburseSummary } from '../hooks';
import { useI18n } from '../../../i18n';
import { formatAmountFen } from '../reimburse-utils';

/** 服务端同源结构汇总；没有按人小计、排名或效率面板。 */
export function ReimburseStructuralSummary({ client, source, query, enabled }: {
  client: ReimburseSegment;
  source: string;
  query: ReimburseSummaryQuery;
  enabled: boolean;
}) {
  const { t } = useI18n();
  const summaryQuery = useReimburseSummary(client, source, query, enabled);
  if (!enabled || summaryQuery.isPending) return <p role="status">{t('reimb.loading')}</p>;
  if (summaryQuery.isError) return <p role="alert">{t('reimb.error')}</p>;
  const summary = summaryQuery.data.summary;
  return <section className="panel" aria-label={t('reimb.summary.title')}>
    <h3>{t('reimb.summary.title')}</h3>
    <p>{t('reimb.summary.total', { count: summary.count, unknown: summary.unknownAmountCount, unclassified: summary.unclassifiedCount })}</p>
    <table className="domain-table"><thead><tr><th>{t('reimb.create.field.expenseType')}</th><th>{t('reimb.summary.count')}</th><th>{t('reimb.summary.unknown')}</th><th>{t('reimb.export.col.totalYuan')}</th><th>{t('reimb.workflow.approvedAmount')}</th><th>{t('reimb.payout.resultShort')}</th></tr></thead>
      <tbody>{summary.types.map((row) => <tr key={row.expenseType}><td>{t(`reimb.expenseType.${row.expenseType}`)}</td><td>{row.count}</td><td>{row.unknownAmountCount}</td><td>{formatAmountFen(row.requestedAmountFen)}</td><td>{formatAmountFen(row.approvedAmountFen)}</td><td>{formatAmountFen(row.paidAmountFen)}</td></tr>)}</tbody>
    </table>
  </section>;
}
