import type { FastifyInstance } from 'fastify';
import {
  buildGovReport,
  renderGovReportHtml,
  renderGovReportMarkdown,
} from '@teamhub/hub-contracts';
import type { GovStore } from '../store/gov-store.js';
import type { InventoryReadPort } from '../modules/inventory/repository.js';
import type { ScheduleReadPort } from '../modules/schedule/repository.js';
import type { BaselineRepository } from '../modules/baseline/repository.js';

export interface GovReportRouteDeps {
  store: GovStore;
  inventoryRead: InventoryReadPort;
  baselineRepository: BaselineRepository;
  scheduleRead: ScheduleReadPort;
}

/**
 * GOV-REPORT（拍板=B 导出文件形态）：一键导出项目级汇报文件——
 * `GET /api/reports/governance?format=md|html`（默认 html），Content-Disposition 附件下载。
 * 数据全有：里程碑进度/任务完成/在场统计（I0 只到组与资源维度）/库存消耗。
 */
export function registerGovReportRoutes(app: FastifyInstance, deps: GovReportRouteDeps): void {
  const { store, inventoryRead, baselineRepository, scheduleRead } = deps;

  app.get('/api/reports/governance', async (request, reply) => {
    const { format } = request.query as { format?: string };
    const snapshot = await store.getSnapshot();
    const seasons = snapshot.seasons;
    const activeSeason = seasons.find((s) => s.status === 'active') ?? seasons[0];
    const baseline = activeSeason ? await baselineRepository.getBaseline(activeSeason.id) : null;
    const [resources, sessions, inventory] = await Promise.all([
      scheduleRead.listResources(),
      scheduleRead.listResourceSessions(),
      inventoryRead.getInventorySnapshot(),
    ]);

    const report = buildGovReport({
      generatedAt: new Date().toISOString(),
      seasonName: activeSeason?.name ?? null,
      baseline,
      tasks: snapshot.tasks,
      groups: snapshot.groups,
      members: snapshot.members,
      resources,
      sessions,
      inventory,
    });

    const stamp = report.generatedAt.slice(0, 10);
    if (format === 'md') {
      void reply.header('content-type', 'text/markdown; charset=utf-8');
      void reply.header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(`项目汇报-${stamp}.md`)}`,
      );
      return renderGovReportMarkdown(report);
    }
    void reply.header('content-type', 'text/html; charset=utf-8');
    void reply.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`项目汇报-${stamp}.html`)}`,
    );
    return renderGovReportHtml(report);
  });
}
