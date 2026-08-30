import { describe, expect, test } from 'vitest';
import { buildTestHubServer } from './support/build-test-hub-server.js';

// GOV-REPORT 路由：一键导出项目级汇报（Markdown / 可打印 HTML），随 export 族常挂。
describe('项目级汇报导出路由（GOV-REPORT）', () => {
  test('GET /api/reports/governance 默认 → HTML 附件，含四大段', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/reports/governance' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body).toContain('<!doctype html>');
      expect(res.body).toContain('里程碑进度');
      expect(res.body).toContain('任务完成');
      expect(res.body).toContain('在场统计');
      expect(res.body).toContain('库存消耗');
    } finally {
      await app.close();
    }
  });

  test('GET /api/reports/governance?format=md → Markdown 附件', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/reports/governance?format=md' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body).toContain('# 项目进展汇报');
      expect(res.body).toContain('## 四、库存消耗');
    } finally {
      await app.close();
    }
  });

  test('I0：汇报产物不出现成员名（在场统计只到组/资源维度）', async () => {
    const app = buildTestHubServer();
    try {
      const roster = await app.inject({ method: 'GET', url: '/api/members' });
      const names = (roster.json().members as Array<{ displayName: string }>).map(
        (m) => m.displayName,
      );
      const res = await app.inject({ method: 'GET', url: '/api/reports/governance?format=md' });
      expect(res.statusCode).toBe(200);
      for (const name of names) {
        expect(res.body).not.toContain(name);
      }
    } finally {
      await app.close();
    }
  });
});
