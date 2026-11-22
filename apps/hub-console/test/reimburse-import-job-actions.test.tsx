import { renderToStaticMarkup } from 'react-dom/server';
import { ReimburseImportJobViewSchema, type ReimburseImportJobView } from '@teamhub/hub-contracts';
import { describe, expect, it } from 'vitest';
import { ReimburseImportJobs } from '../src/features/reimburse/components/ReimburseImportJobs';

function job(confirmedEntryIds: string[], status: 'ready' | 'queued' = 'ready', queuePosition: number | null = null): ReimburseImportJobView {
  return ReimburseImportJobViewSchema.parse({
    id: 'reimp-action-test', memberId: 'member-1', status, queuePosition,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    files: [], pairs: [], confirmedEntryIds, history: [], error: null,
  });
}

function render(jobValue: ReimburseImportJobView) {
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

  it('shows the FIFO position and blocks mutations while queued', () => {
    const html = render(job([], 'queued', 2));
    expect(html).toContain('排队中 · 第 2 位');
    expect(html).not.toContain('重新解析');
    expect(html).not.toContain('删除作业');
    expect(html).not.toContain('关闭/归档');
  });
});
