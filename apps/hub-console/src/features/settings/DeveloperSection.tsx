import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DataMode } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { OverviewView, PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { useSystemStatus } from '../system/hooks';
import { sectionPermission } from './section-permission';
import { IntegrationsSection, LarkIntegrationSection } from './IntegrationsSection';
import { ConnectionSection } from './ConnectionSection';
import { DeploymentSection, DeploymentConfigSection } from './DeploymentSection';
import { AboutSection } from './MiscSections';

/**
 * 「开发者」分区：把集成 / 连接 / 部署 / 关于这些运维向面板收进设置页末尾的可折叠区，
 * 日常成员默认看不见噪声；试驾（demo 数据）默认展开，正式（real）默认折叠。
 * 折叠态存 localStorage（照 ConsolePreferences 的 try/catch 读写），手动切换优先于 demo 默认值。
 */
export const DEVELOPER_EXPANDED_KEY = 'teamhub.settings.developerExpanded';
export const DEVELOPER_BODY_ID = 'settings-developer-body';

type PrefStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): PrefStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 读已存偏好；没存过 / 值不合法 / 存储被禁用都返回 null（交回 demo 默认值裁决）。 */
export function readDeveloperExpanded(storage: PrefStorage | null = browserStorage()): boolean | null {
  try {
    const raw = storage?.getItem(DEVELOPER_EXPANDED_KEY);
    return raw === 'true' ? true : raw === 'false' ? false : null;
  } catch {
    return null;
  }
}

export function saveDeveloperExpanded(
  value: boolean,
  storage: PrefStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(DEVELOPER_EXPANDED_KEY, String(value));
  } catch {
    /* 禁用存储时仍允许本次会话展开 / 收起。 */
  }
}

/** 展开态裁决：用户已存偏好优先；无偏好时 demo 默认展开、real（或未知道）默认折叠。 */
export function resolveDeveloperExpanded(
  stored: boolean | null,
  dataMode: DataMode | undefined,
): boolean {
  return stored ?? dataMode === 'demo';
}

export function DeveloperSection({
  client,
  source,
  identity,
  overview,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
  overview: OverviewView;
}) {
  const { t } = useI18n();
  const { writeLocked } = sectionPermission(identity, t);
  const [stored, setStored] = useState<boolean | null>(() => readDeveloperExpanded());
  const statusQuery = useSystemStatus(client, source);

  // 身份模式下普通成员（或未登录）看不到整个分区，标题一并隐藏；匿名模式维持现有可见性。
  if (writeLocked) return null;

  const expanded = resolveDeveloperExpanded(stored, statusQuery.data?.deployment?.dataMode);
  const toggle = () => {
    const next = !expanded;
    setStored(next);
    saveDeveloperExpanded(next);
  };

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>
          <button
            type="button"
            className="settings-developer__toggle"
            aria-expanded={expanded}
            aria-controls={DEVELOPER_BODY_ID}
            onClick={toggle}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {t('settings.section.developer')}
          </button>
        </h2>
      </div>
      {/* 折叠用 hidden 属性（受控体常驻，aria-controls 才有落点）；布局/内边距在 CSS，
          且 .settings-developer__body[hidden] 显式压掉 display，避免展开态样式盖住 hidden。 */}
      <div id={DEVELOPER_BODY_ID} className="settings-developer__body" hidden={!expanded}>
        <IntegrationsSection overview={overview} />
        <LarkIntegrationSection client={client} />
        <ConnectionSection />
        <DeploymentSection client={client} source={source} />
        <DeploymentConfigSection client={client} source={source} identity={identity} />
        <AboutSection client={client} source={source} />
      </div>
    </section>
  );
}
