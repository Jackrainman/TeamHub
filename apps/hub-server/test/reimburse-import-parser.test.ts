import FormData from 'form-data';
import { describe, expect, it, vi } from 'vitest';
import { createTestHub, login, TEST_PASSWORDS } from './support/build-test-hub-server.js';

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument }));

describe('reimburse import PDF parsing', () => {
  it('passes uploaded PDF Buffer bytes to pdf.js as a new Uint8Array', async () => {
    const document = { numPages: 0, destroy: vi.fn() };
    getDocument.mockReturnValue({ promise: Promise.resolve(document) });
    const hub = createTestHub();
    try {
      const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
      const form = new FormData();
      form.append('files', Buffer.from([37, 80, 68, 70]), 'synthetic.pdf');
      const uploaded = await hub.app.inject({
        method: 'POST', url: '/api/reimburse/imports',
        headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer(),
      });
      const id = uploaded.json().job.id as string;
      await vi.waitFor(async () => {
        const response = await hub.app.inject({ method: 'GET', url: `/api/reimburse/imports/${id}`, headers: { cookie } });
        expect(response.json().job.status).toBe('ready');
        expect(response.json().job.files[0].status).toBe('parsed');
      });

      expect(getDocument).toHaveBeenCalledOnce();
      const argument = getDocument.mock.calls[0][0] as { data: Uint8Array };
      expect(argument.data).toBeInstanceOf(Uint8Array);
      expect(Buffer.isBuffer(argument.data)).toBe(false);
      expect([...argument.data]).toEqual([37, 80, 68, 70]);
      expect(document.destroy).toHaveBeenCalledOnce();
    } finally { await hub.close(); }
  });
});
