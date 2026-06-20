import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { ResourcesPage } from '../resources/ResourcesPage';
import { SchedulePage } from '../schedule/SchedulePage';

/**
 * 机器人队页（IA 阶段 1 / D-075）：机器人域单页 = 机器人管理（上半区：建 / 改状态 / 退役）
 * + 在场排班接力画布（下半区）合一。
 *
 * **组合既有两页、不重写**——零改 ResourcesPage / SchedulePage / RelayCanvas（含 RelayCanvas 的
 * node.measured 首屏修复，绝不动）。两子页各自自带 loading/error band、无 DOM id / context 冲突。
 *
 * 「改机器人状态画布即时反映」：ResourcesPage.refresh() 已改为 prefix 失效 ['resources']+['relay']，
 * 上半区改状态 → 下半区接力画布的 boardable / 加棒选项即时更新（同页一眼可见，无需手刷）。
 *
 * I0 反监视：本页只组合，不新增任何渲染数据；两子页结构上均无成员维度。
 */
export function FleetPage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  return (
    <div className="fleet-page">
      <section className="fleet-section" aria-label={t('fleet.section.robots')}>
        <h2 className="fleet-section-title">{t('fleet.section.robots')}</h2>
        <ResourcesPage client={client} source={source} />
      </section>
      <section
        className="fleet-section fleet-section--relay"
        aria-label={t('fleet.section.relay')}
      >
        <h2 className="fleet-section-title">{t('fleet.section.relay')}</h2>
        <SchedulePage client={client} source={source} />
      </section>
    </div>
  );
}
