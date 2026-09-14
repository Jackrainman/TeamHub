import { describe, expect, test } from 'vitest';
import {
  REIMBURSE_EVIDENCE_ACCEPT,
  REIMBURSE_EVIDENCE_MAX_BYTES,
  REIMBURSE_EVIDENCE_MAX_PER_ENTRY,
  evidenceContentType,
  evidenceExtOf,
  isEvidenceExtAllowed,
} from '../src/index.js';

// 凭证留档口径纯函数（D-094）：服务器与浏览器共用这一份，故后缀解析与上限口径要在此钉死。

describe('evidenceExtOf：从文件名取小写后缀', () => {
  test('常规与大小写混排', () => {
    expect(evidenceExtOf('发票.pdf')).toBe('.pdf');
    expect(evidenceExtOf('SCREEN.SHOT.PNG')).toBe('.png');
    expect(evidenceExtOf('wechat.jpeg')).toBe('.jpeg');
  });

  test('无后缀/隐藏文件/空名一律回空串', () => {
    expect(evidenceExtOf('invoice')).toBe('');
    expect(evidenceExtOf('.env')).toBe('');
    expect(evidenceExtOf('')).toBe('');
    expect(evidenceExtOf(undefined)).toBe('');
    expect(evidenceExtOf('dir/.')).toBe('');
  });

  test('Windows 与 POSIX 路径段都不参与后缀判断', () => {
    expect(evidenceExtOf('C:\\截图\\a.pdf')).toBe('.pdf');
    expect(evidenceExtOf('/tmp/x/y.png')).toBe('.png');
    expect(evidenceExtOf('C:\\no.dot\\file')).toBe('');
  });
});

describe('isEvidenceExtAllowed / evidenceContentType', () => {
  test('仅 PDF/PNG/JPG 放行，其余（含可执行与压缩包）拒绝', () => {
    for (const ext of ['.pdf', '.png', '.jpg', '.jpeg']) {
      expect(isEvidenceExtAllowed(ext)).toBe(true);
    }
    for (const ext of ['.exe', '.svg', '.html', '.zip', '', '.PDF']) {
      expect(isEvidenceExtAllowed(ext)).toBe(false);
    }
  });

  test('未知后缀回兜底 MIME（不猜）', () => {
    expect(evidenceContentType('.pdf')).toBe('application/pdf');
    expect(evidenceContentType('.jpg')).toBe('image/jpeg');
    expect(evidenceContentType('.zip')).toBe('application/octet-stream');
  });
});

describe('留档上限口径', () => {
  test('accept 串与允许后缀表同源同序', () => {
    expect(REIMBURSE_EVIDENCE_ACCEPT).toBe('.pdf,.png,.jpg,.jpeg');
  });

  test('单文件 20MB、单条目 12 份（改动即显式）', () => {
    expect(REIMBURSE_EVIDENCE_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(REIMBURSE_EVIDENCE_MAX_PER_ENTRY).toBe(12);
  });
});
