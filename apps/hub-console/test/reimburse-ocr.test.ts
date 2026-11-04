import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { extractLocalOcr } from '../src/features/reimburse/lib/local-ocr';
const mocks = vi.hoisted(() => ({ createWorker: vi.fn(), recognize: vi.fn(), terminate: vi.fn(), closeBitmap: vi.fn() }));
vi.mock('tesseract.js', () => ({ createWorker: mocks.createWorker }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createWorker.mockResolvedValue({ recognize: mocks.recognize, terminate: mocks.terminate });
  mocks.recognize.mockResolvedValue({ data: { text: '支付成功\n123.45', confidence: 90 } });
  vi.stubGlobal('window', { location: { href: 'http://localhost:5174/' } });
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 100, height: 100, close: mocks.closeBitmap }));
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ drawImage: vi.fn() }), width: 0, height: 0 }) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('OCR uses same-origin resources and releases the worker', async () => {
  expect((await extractLocalOcr(new File(['x'], 'test.png'))).confidence).toBe(90);
  const options = mocks.createWorker.mock.calls[0][2];
  expect(options.workerPath).toBe('http://localhost:5174/ocr/worker/worker.min.js');
  expect(options.langPath).toBe('http://localhost:5174/ocr/lang');
  expect(mocks.terminate).toHaveBeenCalledTimes(1);
});
test('cancelling active recognition releases the worker', async () => {
  mocks.recognize.mockReturnValue(new Promise(() => {}));
  const controller = new AbortController();
  const pending = extractLocalOcr(new File(['x'], 'test.png'), { signal: controller.signal });
  const assertion = expect(pending).rejects.toThrow('cancelled');
  await vi.waitFor(() => expect(mocks.recognize).toHaveBeenCalled());
  controller.abort();
  await assertion;
  expect(mocks.terminate).toHaveBeenCalledTimes(1);
  expect(mocks.closeBitmap).toHaveBeenCalled();
});
test('a timed out page releases the worker and a subsequent file works', async () => {
  vi.useFakeTimers();
  mocks.recognize.mockReturnValueOnce(new Promise(() => {}));
  const pending = extractLocalOcr(new File(['x'], 'test.png'));
  const assertion = expect(pending).rejects.toThrow('timeout');
  await vi.waitFor(() => expect(mocks.recognize).toHaveBeenCalled());
  await vi.advanceTimersByTimeAsync(30_000);
  await assertion;
  expect(mocks.terminate).toHaveBeenCalledTimes(1);
  expect((await extractLocalOcr(new File(['x'], 'next.png'))).confidence).toBe(90);
});
test('failed resource initialization does not prevent the next file', async () => {
  mocks.createWorker.mockRejectedValueOnce(new Error('resource unavailable'));
  await expect(extractLocalOcr(new File(['x'], 'test.png'))).rejects.toThrow('resource unavailable');
  expect((await extractLocalOcr(new File(['x'], 'next.png'))).confidence).toBe(90);
});
