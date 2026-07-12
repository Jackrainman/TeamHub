import { ALL_MODULE_IDS } from '@teamhub/hub-contracts';
import type { ModuleId, TenantConfig } from '@teamhub/hub-contracts';

const ALL_MODULE_ID_SET = new Set<string>(ALL_MODULE_IDS);

function isModuleId(value: string): value is ModuleId {
  return ALL_MODULE_ID_SET.has(value);
}

/**
 * 解析 `TEAMHUB_TENANT_MODULES` 环境变量（AUDIT-DEBT-2026-07 §9-④ 审计债④）：装配契约
 * `TenantConfig`/`buildHubServer({ tenantConfig })` 早已落地（HUB-MODULARIZATION 第2步，
 * `tenant-config-route.test.ts` 验证过"关掉一个模块"的真实行为）——但 `main.ts` 此前从未把
 * tenantConfig 传出去，真实启动路径恒走 `buildHubServer` 内部缺省
 * `options.tenantConfig ?? ROBOTICS_TENANT_CONFIG`（全 6 模块开），装配层"形接神未接"。
 *
 * 本函数把通道接上、**默认行为不变**：
 * - 未设 / 空串 → 返回 `undefined`（`buildHubServer` 内部缺省 ROBOTICS_TENANT_CONFIG，现状零变化）。
 * - 设了合法的逗号分隔 ModuleId 子集（如 `"system,pm-core,knowledge-base"`）→ 返回对应
 *   `TenantConfig`，真正收窄启用模块（关掉的模块整段路由不注册，见 tenant-config-route.test.ts）。
 * - 含未知 id → 抛错（fail-closed：拼错模块名不该悄悄降级成"关掉了"，让启动直接失败比静默错误好查）。
 */
export function parseTenantConfigEnv(raw: string | undefined): TenantConfig | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const ids = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const invalid = ids.filter((id) => !isModuleId(id));
  if (invalid.length > 0) {
    throw new Error(
      `TEAMHUB_TENANT_MODULES 含未知模块 id：${invalid.join(', ')}（合法值：${ALL_MODULE_IDS.join(', ')}）`,
    );
  }
  return { enabledModules: ids as ModuleId[] };
}
