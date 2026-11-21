import FormData from 'form-data';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ReimburseImportJob } from '@teamhub/hub-contracts';
import { createTestHub, login, TEST_PASSWORDS } from './support/build-test-hub-server.js';

const { recognize, terminate } = vi.hoisted(() => ({ recognize: vi.fn(), terminate: vi.fn() }));
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(async () => ({ recognize, terminate })),
}));
vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  copyFile: vi.fn(async () => {}),
}));

const OCR_TEXT = `电 子 发 票（普通 发 票）
| 人 开 时 日期 : 2026 年 10 月 20 昌
63220000086
1975571
? A WRE g 名 称 :江苏 悟 锐 达 科 技 有 限 公司 £
和 统一 社会 信用 代 己 /纳税 人 识别 号 :1 2650000457601471G 县 统一 社会 信用 代码 / 钠 秘 人 识别 好 :91320811MR1YM07&A65
合 计 ¥40.59 ¥5.28`;

describe('reimburse OCR invoice fields', () => {
  it('normalizes uploaded OCR text and applies the configured purchaser profile', async () => {
    recognize.mockResolvedValue({ data: { text: OCR_TEXT, confidence: 93 } });
    const hub = createTestHub();
    vi.stubEnv('TEAMHUB_IMPORT_LANG_DIR', path.join(hub.root, 'ocr-lang'));
    try {
      const cookie = await login(hub.app, 'admin', TEST_PASSWORDS.admin);
      const profile = await hub.app.inject({
        method: 'PUT', url: '/api/reimburse/profile', headers: { cookie },
        payload: { expectedPurchaserName: '新疆大学', expectedPurchaserTaxNo: '12650000457601471G' },
      });
      expect(profile.statusCode).toBe(200);
      const form = new FormData();
      form.append('files', Buffer.from([255, 216, 255]), 'invoice.jpg');
      const uploaded = await hub.app.inject({
        method: 'POST', url: '/api/reimburse/imports',
        headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer(),
      });
      expect(uploaded.statusCode, uploaded.body).toBe(202);
      const id = uploaded.json().job.id as string;
      let job: ReimburseImportJob | undefined;
      await vi.waitFor(async () => {
        const response = await hub.app.inject({ method: 'GET', url: `/api/reimburse/imports/${id}`, headers: { cookie } });
        const current = response.json().job as ReimburseImportJob;
        job = current;
        expect(current.status).toBe('ready');
      });
      const file = job!.files[0];
      expect(file).toMatchObject({ role: 'invoice', amountFen: 4587 });
      expect(file.parsed).toMatchObject({
        invoiceNo: '', invoiceDate: '2026-10-20', seller: '江苏悟锐达科技有限公司',
        purchaserName: '新疆大学', purchaserTaxNo: '12650000457601471G',
        invoiceType: 'vatOrdinary', totalAmountFen: 4587,
      });
    } finally {
      await hub.close();
      vi.unstubAllEnvs();
    }
  });
});
