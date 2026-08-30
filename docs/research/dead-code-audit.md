---
kind: research
status: active
domain: architecture
truth_for: dead-code-surface
checked_at: 2026-08-30
review_after: 2026-11-30
---

# 调用路径 / 死代码清单（DEAD-CODE-AUDIT，2026-08-30 夜班链）

静态交叉引用审计，**只出报告不改码**。分析脚本落 `.harness/dead-code-audit.mjs`（只读，可重跑复核）。

## 方法与口径

| 维度 | 方法 | 覆盖 |
|---|---|---|
| 服务端路由 | 提取 `app.(get\|post\|patch\|put\|delete)` 路由表（98 条），与 console 全部 `/api/...` 调用字面量归一化（`:param` ⇔ `${...}`）后比对 | hub-server ↔ hub-console |
| contracts 导出 | 递归解析 barrel（`.js`→`.ts` 映射）收集 803 个导出符号，逐符号在**全仓库**（三包 src+test+scripts，剥注释、防 export 行误伤）找消费方 | hub-contracts → 全仓库 |
| console 文件孤儿 | 全部 `.ts/.tsx` 的静态+动态 import 图，无入边的文件（入口/barrel 豁免） | hub-console |
| hooks / i18n | useXxx 定义 vs 使用；locales key vs `t('key')` 引用 | hub-console |

**口径警告**：词边界静态匹配，「死」= 仓库内零文本引用。类型别名之死 ≠ 运行时代码之死（很多是「Schema 在用、推断类型没人标注」的 API 面子问题）；运行时动态拼接路径理论上可能漏判（本次已人工复核命中项，未发现）。

## 结论摘要

- **无高危**：页面全部经 `console-pages.tsx` 注册可达；hooks 0 闲置；i18n 0 死键（近期 CONSISTENCY-AUDIT/I18N-SPLIT 成果保持）。
- **真死代码（建议砍）仅 2 个文件 + 1 个常量**。
- **contracts API 面子冗余 65/803（8%）**：绝大多数是「导出但无人标注」的类型别名/响应 Schema，属于面子工程债，不是逻辑乱源。
- **7 条服务端路由 console 不消费**：均为 test-only 或留待外部消费方的休眠端点，非腐烂。

## 1. 真死代码（建议删除，改动前仍需人工点头）

| 对象 | 位置 | 死因 |
|---|---|---|
| `FleetPage.tsx` | `apps/hub-console/src/features/fleet/` | IA-RESTRUCTURE 后 `fleet` 导航键渲染的是 `ResourcesPage`，本文件零入边。v0.7.4 时代的 Tab 页尸体 |
| `Sparkline.tsx` | `apps/hub-console/src/components/viz/` | VISUAL-VITALITY V0（v0.20.0）viz 原语，从未被任何页面采用 |
| `KNOWN_GROUP_KINDS` | `apps/hub-contracts/src/pm-core.ts` | 常量定义后全仓库零引用（组 kind 判定走了别的路径） |

## 2. console 不消费的服务端路由（7 条，分类=休眠非腐烂）

| 路由 | 现状 | 建议 |
|---|---|---|
| `GET /api/checklist/templates` | 仅 checklist-route.test.ts 消费；CHECKLIST-TPL-IMPORT 待立项 | 留（有 todo 兜底） |
| `POST /api/integrations/lark/push-reminder` | 仅 lark-outbound.test.ts 消费；主动提醒出口，等 HERMES-CHAT-MVP/提醒场景 | 留 |
| `GET /api/resources/template` / `POST /api/resources/preview` | 仅 fleet-import-route.test.ts；console 资源导入走客户端解析 + `/batch` | 留（服务端导入预备）或随资源导入 UI 立项时复核 |
| `GET /api/agent-backends/:id/health` `…/capabilities` `POST …/invoke` | 仅 routes.test.ts；mock-first 适配面钻取端点，console 只列清单不钻取 | 留（适配面基建，HERMES/多后端故事未完结） |

外部消费方路由（设计使然，不算死）：`GET /api/hermes/credential`、`POST /api/hermes/inbound`（hermes 网关）、`/api/lark/*`（飞书 bot 回调）、`/api/setup/*`（初始化向导）、`/health`、`/api/system/status`（运维探活）。

## 3. contracts 导出面子冗余（65 死 + 5 仅测试）

803 个导出符号中 65 个全仓库零消费、5 个仅测试消费。分布：

- **`schemas.ts`（13 个）**：适配面/事件/系统状态族——`AdapterCapabilitiesResponse`、`AdapterInvokeRequest(Schema)`、`AgentBackendsResponse`、`BotChannelsResponse`、`BridgeMembersResponse`、`DataSourcesResponse`、`HubEvent*`、`GitReposResponse`、`ErrorResponse` 等。对应 `/api/agent-backends/:id/*` 钻取端点本就没人调（见 §2），属同一休眠面。
- **`hermes.ts` / `lark-integration.ts`（9 个）**：`HermesInboundRequest/Response`、`HermesInvQueryArgs`、`HermesInvRecord*`、`HermesCredentialResponse`、`LarkConfig`、`LarkChat`、`LarkPushReminderResponse` 等类型别名——服务端路由用 Schema 不用类型，Hermes 侧消费在仓库外（skill 归用户维护）。**HERMES-CHAT-MVP 落地时自然复活**。
- **`pm-core.ts`（14 个）**：`DependencyType/Status/Source`、`NeedStatus`、`MemberStatus`、`TaskConvergenceScope`、`OverloadSignal`、`ProgressSignalKind`、`TasksQuery`、`GroupsResponse` 等类型别名 + `KNOWN_GROUP_KINDS`（见 §1）。字面量判定替代类型标注的历史习惯所致。
- **导入族（3 个）**：`FleetPreviewResponse`、`InventoryImportRowsRequest`、`RosterImportRowsRequest`——console 客户端自解析 CSV，预览/导入行请求类型没人标。
- **其余散件**：`growth.ts` 可见性类型 ×3、`kb.ts` 两个响应 Schema、`baseline` 的 `MilestoneKind/MilestoneStatus/PassMilestoneResponse`、`reimburse` 的 `ReimburseMaterials/StockInEntryContext/StockedLine`、`identity.ts` 的 `SetPin*`、`verticals/robotics.ts` 的 `ROBOTICS_TARGET_LABEL_OPTIONS` 等。

仅测试消费（5）：`DeploymentStorageEntry`、`WeeklyMinuteWindow`、`memberKnowledgeFixtures`、`scheduleResourceDownFixture`、`parseAppSettings`——fixture/纯函数配套，正常。

**收窄结论**：「逻辑乱」的死代码面其实很小——2 文件 + 1 常量是真尸体；65 个冗余导出是类型面子债，建议随 ARCH-UNIFY A4/A5 迁移顺手收（届时对应域代码会被触碰，成本低），不单独立项。

## 4. 建议处置顺序

1. 删 `FleetPage.tsx`、`Sparkline.tsx`、`KNOWN_GROUP_KINDS`（一个 commit，先确认 fleet 目录无其他残留引用）。
2. §2 休眠路由全部保留并在此备案；HERMES-CHAT-MVP / CHECKLIST-TPL-IMPORT 落地时复核 §3 对应簇。
3. 类型面子债不主动清，随 ARCH-UNIFY 迁移顺手收。

## 复核方式

```bash
node .harness/dead-code-audit.mjs   # 输出 JSON：路由对比/导出消费/孤儿/hooks/i18n
```
