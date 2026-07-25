import { describe, expect, test } from 'vitest';
import FormData from 'form-data';
import { FleetPreviewResponseSchema } from '@teamhub/hub-contracts';
import { buildHubServer } from '../src/server.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

/**
 * 车队批量导入端到端（FLEET-CSV-IMPORT）：GET 模板 + POST preview（只解析不落库）+ 中文编号/状态映射 +
 * 坏行带行号不中断 + GBK 编码 + 鉴权继承写门（与 POST /api/resources/batch 同门）。落库语义不在本刀——
 * 预览确认后前端拼 CreateResourcesBatchRequest 走既有批量端点（resource-route.test.ts 已覆盖）。
 */

// 构造单文件 multipart 请求体（照 inventory-import-route.test.ts 先例）。
function multipart(content: Buffer | string, filename = 'fleet.csv') {
  const form = new FormData();
  form.append('file', Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'), {
    filename,
  });
  return { payload: form.getBuffer(), headers: form.getHeaders() };
}

describe('GET /api/resources/template', () => {
  test('200 + CSV 带 BOM + 五列表头 + 附件下载头', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/resources/template' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body.charCodeAt(0)).toBe(0xfeff);
      expect(res.body).toContain('名称,编号,赛季码,第几代,状态');
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/resources/preview — 只解析不落库', () => {
  test('解析返回 rows/failed（中文编号/状态映射），车队快照零变化', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const before = await store.listResources();
      const csv =
        '名称,编号,赛季码,第几代,状态\n' +
        'R1 比赛机器人,R1,27,2,能用\n' +
        '坏行,,27,1,能用\n';
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources/preview',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(200);
      const preview = FleetPreviewResponseSchema.parse(res.json());
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0]).toMatchObject({
        name: 'R1 比赛机器人',
        robotTarget: 'R1',
        season: '27',
        version: 2,
        status: 'available',
        line: 2,
      });
      expect(preview.failed).toHaveLength(1);
      expect(preview.failed[0].line).toBe(3);
      // 不落库：resources 与调用前逐字相等。
      expect(await store.listResources()).toEqual(before);
    } finally {
      await app.close();
    }
  });

  test('可空列（赛季码/第几代/状态留空）→ undefined，解析仍 200', async () => {
    const app = buildHubServer();
    try {
      const csv = '名称,编号,赛季码,第几代,状态\n裸车,R2,,,\n';
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources/preview',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(200);
      const preview = FleetPreviewResponseSchema.parse(res.json());
      expect(preview.rows[0]).toMatchObject({ name: '裸车', robotTarget: 'R2' });
      expect(preview.rows[0].season).toBeUndefined();
      expect(preview.rows[0].version).toBeUndefined();
      expect(preview.rows[0].status).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  test('GBK 编码（无 BOM）端到端解析成功', async () => {
    // 表头「名称,编号,赛季码,第几代,状态\r\n」+ 行「电机车,R1,27,1,能用\r\n」全 GBK 字节。
    const gbk = Buffer.from([
      0xc3, 0xfb, 0xb3, 0xc6, 0x2c, 0xb1, 0xe0, 0xba, 0xc5, 0x2c, 0xc8, 0xfc, 0xbc, 0xbe, 0xc2, 0xeb,
      0x2c, 0xb5, 0xda, 0xbc, 0xb8, 0xb4, 0xfa, 0x2c, 0xd7, 0xb4, 0xcc, 0xac, 0x0d, 0x0a, 0xb5, 0xe7,
      0xbb, 0xfa, 0xb3, 0xb5, 0x2c, 0x52, 0x31, 0x2c, 0x32, 0x37, 0x2c, 0x31, 0x2c, 0xc4, 0xdc, 0xd3,
      0xc3, 0x0d, 0x0a,
    ]);
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources/preview',
        ...multipart(gbk),
      });
      expect(res.statusCode).toBe(200);
      const preview = FleetPreviewResponseSchema.parse(res.json());
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0].name).toBe('电机车');
      expect(preview.rows[0].status).toBe('available');
    } finally {
      await app.close();
    }
  });

  test('无法识别的编码 → 400', async () => {
    const app = buildHubServer();
    try {
      const bad = Buffer.from([0x41, 0xff, 0x42]); // UTF-8 与 GBK 皆非法
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources/preview',
        ...multipart(bad),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail).toContain('编码');
    } finally {
      await app.close();
    }
  });
});

describe('写门 × writeToken（与 POST /api/resources/batch 同门）', () => {
  const csv = '名称,编号,赛季码,第几代,状态\nR1 比赛车,R1,27,1,能用\n';

  test('匿名 + 配 writeToken：无 Bearer 401；带 Bearer 200', async () => {
    const app = buildHubServer({ writeToken: 'sekret' });
    try {
      const noAuth = await app.inject({
        method: 'POST',
        url: '/api/resources/preview',
        ...multipart(csv),
      });
      expect(noAuth.statusCode).toBe(401);
      const payload = multipart(csv);
      const withAuth = await app.inject({
        method: 'POST',
        url: '/api/resources/preview',
        payload: payload.payload,
        headers: { ...payload.headers, authorization: 'Bearer sekret' },
      });
      expect(withAuth.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
