import { renderToStaticMarkup } from 'react-dom/server';
import { ReimburseImportJobSchema, type ReimburseImportJob } from '@teamhub/hub-contracts';
import { describe, expect, it } from 'vitest';
import { ReimburseImportJobs } from '../src/features/reimburse/components/ReimburseImportJobs';

function job(confirmedEntryIds: string[]): ReimburseImportJob {
  return ReimburseImportJobSchema.parse({
    id: 'reimp-action-test', memberId: 'member-1', status: 'ready',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    files: [], pairs: [], confirmedEntryIds, history: [], error: null,
  });
}

function render(jobValue: ReimburseImportJob) {
  return renderToStaticMarkup(<ReimburseImportJobs
    jobs={[jobValue]} canWrite onReview={() => {}} onOpenEntry={() => {}}
    onReparse={() => {}} onDeleteFile={() => {}} onDismiss={() => {}}
    onClose={() => {}} onPurge={() => {}}
  />);
}

describe('reimburse import job destructive actions', () => {
  it('offers permanent deletion for an unconfirmed job', () => {
    const html = render(job([]));
    expect(html).toContain('删除作业');
    expect(html).toContain('关闭/归档');
  });

  it('offers only close/archive, not permanent deletion, after confirmation', () => {
    const html = render(job(['entry-1']));
    expect(html).not.toContain('删除作业');
    expect(html).toContain('关闭/归档');
  });
});
