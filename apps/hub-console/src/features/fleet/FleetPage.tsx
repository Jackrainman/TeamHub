import { useState } from 'react';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { segClass } from '../../utils';
import { ResourcesPage } from '../resources/ResourcesPage';
import { SchedulePage } from '../schedule/SchedulePage';

/**
 * 机器人队页（IA 阶段 1 / D-075）：机器人域单页 = 机器人管理（机器人清单：建 / 改状态 / 退役）
 * + 在场排班接力画布。
 *
 * 布局：顶部 Tab 左右切换「机器人清单 ⇄ 接力画布」，当前 tab 占满整宽。接力画布是横向泳道、要宽度，
 * 故用 tab 切换而非左右分栏（分栏会把画布压窄）。复用既有控制台 tab 范式（`seg kb-tabs` + role=tab/
 * tabpanel + segClass，与图纸档案 / 项目页一致；含 M16 的 tab↔tabpanel 双向 ARIA 关联）。
 *
 * **组合既有两页、不重写**——零改 ResourcesPage / SchedulePage / RelayCanvas（含 RelayCanvas 的
 * node.measured 首屏修复，绝不动）。两子页各自自带 loading/error band、无 DOM id / context 冲突。
 *
 * 「改机器人状态画布即时反映」：ResourcesPage.refresh() 已改为 prefix 失效 ['resources']+['relay']，
 * 在机器人清单 tab 改状态 → 切到接力画布 tab 的 boardable / 加棒选项即时更新（同 client、无需手刷）。
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
  const [tab, setTab] = useState<'robots' | 'relay'>('robots');
  return (
    <div className="fleet-page">
      <div className="seg kb-tabs" role="tablist" aria-label={t('nav.fleet')}>
        <button
          type="button"
          role="tab"
          id="fleet-tab-robots-btn"
          aria-selected={tab === 'robots'}
          aria-controls="fleet-tab-robots"
          className={segClass(tab === 'robots')}
          onClick={() => setTab('robots')}
        >
          {t('fleet.section.robots')}
        </button>
        <button
          type="button"
          role="tab"
          id="fleet-tab-relay-btn"
          aria-selected={tab === 'relay'}
          aria-controls="fleet-tab-relay"
          className={segClass(tab === 'relay')}
          onClick={() => setTab('relay')}
        >
          {t('fleet.section.relay')}
        </button>
      </div>
      {tab === 'robots' ? (
        <div
          role="tabpanel"
          id="fleet-tab-robots"
          aria-labelledby="fleet-tab-robots-btn"
          tabIndex={0}
        >
          <ResourcesPage client={client} source={source} />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="fleet-tab-relay"
          aria-labelledby="fleet-tab-relay-btn"
          tabIndex={0}
        >
          <SchedulePage client={client} source={source} />
        </div>
      )}
    </div>
  );
}
