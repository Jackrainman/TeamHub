import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReimburseEntrySchema } from '@teamhub/hub-contracts';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '../src/i18n';
import { zhReimburse } from '../src/i18n/locales/reimburse';
import { ReimburseExportSection } from '../src/features/reimburse/components/ReimburseExportSection';
import type { ReimburseSegment } from '../src/features/reimburse/api';
import type { HubApiClient } from '../src/api/client';

const entry = ReimburseEntrySchema.parse({
  id: 'entry-1', memberId: 'member-1', batchId: null, kind: 'expense',
  invoiceNo: null, invoiceDate: null, seller: null, purchaserName: null,
  purchaserTaxNo: null, recognitionSource: 'manual', totalAmountFen: 100,
  items: [], actualItemName: null, materials: { paymentShot: false, inspection: false },
  note: null, evidence: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('reimburse export menu', () => {
  it('labels the trigger as export rather than more', () => {
    expect(zhReimburse['reimb.more']).toBe('导出');
  });

  it('contains exactly XLSX-only followed by XLSX plus originals', () => {
    const client = {} as ReimburseSegment & Pick<HubApiClient, 'getMembers'>;
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ReimburseExportSection client={client} source="test" entries={[entry]} batches={[]} profile={{ expectedPurchaserName: '', expectedPurchaserTaxNo: '' }} compact />
        </LanguageProvider>
      </QueryClientProvider>,
    );
    expect((html.match(/<button/g) ?? []).length).toBe(2);
    expect(html).toContain('仅导出 XLSX');
    expect(html).toContain('导出 XLSX + 原件');
    expect(html.indexOf('仅导出 XLSX')).toBeLessThan(html.indexOf('导出 XLSX + 原件'));
    expect(html).not.toContain('导出 CSV');
  });
});
