import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReimburseEntrySchema, type ReimburseEntry } from '@teamhub/hub-contracts';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '../src/api/queryKeys';
import { LanguageProvider } from '../src/i18n';
import { ReimburseEvidenceSection } from '../src/features/reimburse/components/ReimburseEvidenceSection';
import type { ReimburseSegment } from '../src/features/reimburse/api';

const entry: ReimburseEntry = ReimburseEntrySchema.parse({
  id: 'entry-1', memberId: 'member-1', batchId: null, kind: 'expense',
  invoiceNo: null, invoiceDate: null, seller: null, purchaserName: null,
  purchaserTaxNo: null, recognitionSource: 'manual', totalAmountFen: 100,
  items: [], actualItemName: null, materials: { paymentShot: false, inspection: false },
  note: null, evidence: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

function renderEvidence(defaultOpen = false) {
  const client = {
    reimburseEvidenceDownloadUrl: (entryId: string, evidenceId: string) => `/download/${entryId}/${evidenceId}`,
  } as ReimburseSegment;
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.reimburse.evidence('test', entry.id), {
    evidence: [{
      id: 'evidence-1', kind: 'invoice', originalName: 'synthetic-invoice.pdf', ext: '.pdf',
      sizeBytes: 128, sha256: 'synthetic-sha', uploadedBy: 'member-1', uploadedAt: '2026-01-01T00:00:00.000Z',
    }],
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ReimburseEvidenceSection client={client} source="test" entry={entry} isOwner={false} defaultOpen={defaultOpen} />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe('reimburse entry evidence', () => {
  it('stays collapsed by default outside the entry detail', () => {
    const html = renderEvidence();
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('synthetic-invoice.pdf');
  });

  it('can default open in entry detail and exposes filename, kind and download', () => {
    const html = renderEvidence(true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('synthetic-invoice.pdf');
    expect(html).toContain('reimb-evidence__kind-badge');
    expect(html).toContain('发票原件');
    expect(html).toContain('href="/download/entry-1/evidence-1"');
    expect(html).toContain('下载');
  });
});
