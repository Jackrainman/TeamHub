import type {
  ArtifactRef,
  Dependency,
  Group,
  Member,
  Need,
  RelayHandoff,
  ResourceSession,
  SharedResource,
  Task,
} from '@teamhub/hub-contracts';

/**
 * 新建 / 受限状态迁移的「clamp 初始态默认值」单一定义（D-042 clamp 初始态纪律 + C5 来源 seam
 * server 钉，product-redefine-2026-07 §4.4 / §9-③）。
 *
 * **为何抽出**：这些字面量（`'pending'`/`'console'`/`'active'`/`'open'`/`'available'`/`'human'`）此前
 * 各在 `InMemoryGovStore`（mock-gov-store.ts:160 一带）每个 create/update 方法内联出现——三实现
 * （mock/file/sqlite）里只有 mock 真正定义，file 靠组合 mock 才没漂移，sqlite stub 未接线。
 * 集中到本文件后，SQLite 实现（SS3 后续刀）接线时直接复用同一份策略常量，杜绝「同一默认值
 * 三处各写一份、迁移时漏抄或悄悄改动」。
 *
 * 只收「跨调用点固定不变」的常量；随请求变化的字段（如 `clock.now()` 时间戳、`draft` 携带的人本字段）
 * 不进本文件——那些仍由各 Store 实现在调用处组装。
 */

// --- pm-core：新建任务 / 依赖 / 前置需求 clamp（D-042 决策 5） ---

/** 新任务未显式给 status 时的默认态（C1：console 录入是兜底，不取代 git/lark 派生信号）。 */
export const TASK_DEFAULT_STATUS: Task['status'] = 'pending';
/** 新任务未显式给 statusSource 时的默认来源（C5：console 是最低优先源）。 */
export const TASK_DEFAULT_STATUS_SOURCE: Task['statusSource'] = 'console';
/** 人建依赖边的初始态：断言「上游未满足、下游被卡」（satisfied/waived 由派生/人工 waive 转）。 */
export const DEPENDENCY_INITIAL_STATUS: Dependency['status'] = 'active';
/** 依赖边人工作废（POST /api/dependencies/:id/waive）迁移到的终态：软删除、经 toDepGraphView 从图隐藏。 */
export const DEPENDENCY_WAIVED_STATUS: Dependency['status'] = 'waived';
/** 新前置需求的初始态：必为「未认领」（A2 反派单——认领是本人后续主动动作，非创建即派单）。 */
export const NEED_INITIAL_STATUS: Need['status'] = 'open';

// --- 受限状态机迁移：人工流转钉最低优先源（C5，将来 git/lark/derived 派生信号可覆盖） ---

/** 任务人工流转（POST /api/tasks/:id/status）钉的 statusSource。 */
export const MANUAL_TASK_STATUS_SOURCE: Task['statusSource'] = 'console';
/**
 * 车 statusSource 来源 seam（C5）：新建车（POST /api/resources）与既有车状态迁移
 * （PATCH /api/resources/:id/status）两处都钉同一值——server 录入永远是「console」来源，
 * 共用一个常量避免两处各写一份字面量。
 */
export const RESOURCE_STATUS_SOURCE: SharedResource['statusSource'] = 'console';

// --- artifact：提交日志来源 seam（C5：请求不收，server 钉） ---

/** 图纸/归档物提交日志追加（POST /api/artifacts）钉的 submittedVia。 */
export const ARTIFACT_SUBMITTED_VIA: NonNullable<ArtifactRef['submittedVia']> = 'console';

// --- schedule：新建资源 / 占用窗口 / 接力交接线 clamp（D-029 / D-072） ---

/** 新建共享资源（POST /api/resources）的初始状态：建车一律空闲可用。 */
export const RESOURCE_DEFAULT_STATUS: SharedResource['status'] = 'available';
/** 占用窗口录入（POST /api/resource-sessions[/batch]）钉的来源 seam（客户端不冒充 derived/aiSuggested）。 */
export const RESOURCE_SESSION_SOURCE: ResourceSession['source'] = 'human';
/** 接力交接线录入（POST /api/relay-handoffs）钉的来源 seam（客户端不冒充 derived/lark/git）。 */
export const RELAY_HANDOFF_SOURCE: RelayHandoff['source'] = 'console';

// --- member：登录身份写路径来源 seam（IDENTITY-LITE） ---

/** 成员 PIN 散列写入（PUT /api/members/:id/pin）钉的 updatedBy。 */
export const MEMBER_PIN_UPDATED_BY: Member['updatedBy'] = 'console';
/** 成员门验收人资格写入（PATCH /api/members/:id/gate-reviewer，GATE-CHECKLIST-IOU）钉的 updatedBy。 */
export const MEMBER_GATE_REVIEWER_UPDATED_BY: Member['updatedBy'] = 'console';
/** 成员角色写入（PUT /api/members/:id/role + POST /api/setup/super-admin，K1 权限地基）钉的 updatedBy。 */
export const MEMBER_ROLE_UPDATED_BY: Member['updatedBy'] = 'console';

// --- 名册批量导入 clamp（ROSTER-IMPORT，K8）：新建成员 / 自动建组的初值 seam ---

/** 名册导入新建 / 更新成员钉的 updatedBy（K8 拍板③：updatedBy='console'）。 */
export const MEMBER_ROSTER_UPDATED_BY: Member['updatedBy'] = 'console';
/** 名册导入新建成员的初始 status（合理初值：待分配任务 = idle）。 */
export const ROSTER_IMPORT_MEMBER_STATUS: Member['status'] = 'idle';
/** 名册导入自动建组的 kind 默认值（开放串，K8 拍板③：不存在则自动建组、kind 用开放串默认值）。 */
export const ROSTER_IMPORT_GROUP_KIND: Group['kind'] = 'custom';
