import type {
  DefaultPreset,
  RelayHandoff,
  ResourceSession,
  ResourceStatus,
  SharedResource,
} from '@teamhub/hub-contracts';

/**
 * schedule 域写入口（STORE-SPLIT-SQLITE，product-redefine-2026-07 §4.4 / §9-③）：共享物理资源
 * （车）+ 差异化在场排班（D-029 占用窗口 / R1 接力交接线）——从原 god-interface `GovStore` 按语义
 * 拆出的第三个域接口，经交叉类型复合回 `GovStore`（见 gov-store.ts）。**8 个排班方法**
 * （createResourceSession/createResourceSessionsBatch/updateResourceSession/deleteResourceSession/
 * listResourceSessions/createRelayHandoff/deleteRelayHandoff/listRelayHandoffs）此前**连 JSON 落盘先例
 * 都没有**（仅走内存，D-029 粗粒度临时、重启回 seed）——**SCHEDULE-PERSIST 已补齐**：旧 JSON decorator 落盘到
 * 独立 schedule-sessions.json（resourceSessions + relayHandoffs 合一，见 旧 JSON decorator
 * ScheduleSessionsFileSchema 注释）；测试 fake 仍仅走内存（进程重启回 seed，符合 D-029 粗粒度临时
 * 语义）。SS3 迁 SQLite 时本域接口签名不变，只换第三实现。
 *
 * **为何独立读口**：SharedResource / ResourceSession 不在 GovernanceSnapshot 内（GovernanceSnapshot 是
 * 11 字段、无这两块）、且**不扩**它（扩会牵动 GovernanceSnapshotSchema +
 * GOVERNANCE_ARRAY_FIELDS + clone 列表 + 已落盘 JSON 格式兼容）——故走独立读口，路由层把
 * `{...snapshot, resources, resourceSessions}` 拼成 ScheduleSnapshot 喂纯函数。
 */

/**
 * createResource 入参（R3 车管理 / D-072 §3.2「车 = 带编号对象」）：建一台共享资源（整车）。
 * 人本字段 = projectId / name / kind / robotTarget（车号位）+ 可选 season / version（极低频代次）。
 * **displayCode 禁手写**（D-072 §3.2 决定 K）：**由 Store 内部经 `deriveDisplayCode(season, robotTarget,
 * version ?? 1)` 派生，调用方绝不传**（如同从不传 status/statusSource——故 ResourceDraft 一并 Omit displayCode）。
 * 给了 season 才派生，否则 undefined（读视图回退 name）。Store 还补 id + updatedAt、**钉 status=`available`**
 * （建车一律空闲可用）/ statusReason=null（建时无事实注释）/ statusSource=`console`（C5：来源 seam server 钉）。
 * 故 draft Omit id/status/statusReason/statusSource/displayCode/updatedAt。
 * **反监视红线**：SharedResource 结构无成员维度，draft 也绝不含 memberId / 出勤。
 */
export type ResourceDraft = Omit<
  SharedResource,
  'id' | 'status' | 'statusReason' | 'statusSource' | 'displayCode' | 'updatedAt'
>;

/**
 * updateResourceStatus 入参（R3 改状态 / D-072 §3.3 车生命周期）：既有车的状态迁移
 * （维修 repair / 退役 retired / 拆解 disassembling / 回 available 等）。**退役 = 状态迁移、非物删**
 * （整车留展示——ResourceSession 仍引用 resourceId，物删会悬空；故无 delete 方法）。
 * `statusReason`（"撞坏底盘" 等中性事实注释、非归咎于人）optional+nullable：省略=不动既有 reason、
 * 显式 null=清空、非空串=改写。Store 钉 statusSource=`console`（C5）、bump updatedAt。
 */
export interface ResourceStatusPatch {
  status: ResourceStatus;
  statusReason?: string | null;
}

/**
 * setResourceDefaultPreset 入参（PATCH /api/resources/:id/preset，D-082 §6 D2）：既有车的默认阵型
 * 整体写回。传 `DefaultPreset` 对象 = 设置/整体替换（非增量合并 lineup，C3 受限编辑）；传 `null` = 清除
 * （该车退出「使用预设」铺底，回到 §6 D1 手填路径）。镜像 ResourceStatusPatch 同一「受限单字段迁移」范式。
 */
export type ResourceDefaultPresetPatch = DefaultPreset | null;

/**
 * createResourceSession 入参（D-029 差异化在场排班）：队长一拍即录的「占用窗口」。
 * 逐字镜像 NeedDraft/DependencyDraft 范式——Store 补 id/createdAt、钉 `source='human'`（C5 来源 seam server 钉，
 * 客户端不冒充 derived/aiSuggested），故 draft 仅 Omit id/source/createdAt。**confirmedBy 随请求传入**
 * （录入即确认拍板：D-029 队长一拍即录，类比 Dependency/Need 的 confirmedBy 内部凭证），保留在 draft。
 * **I0**：派生输出（PresenceRecommendation，由 derivePresenceSchedule 在路由层算）主键 group/resource/task、
 * 永无 memberId；invitedMemberIds 仅本窗操作名单（合法录入字段），绝不跨窗按人累计（反排名护栏）。
 */
export type ResourceSessionDraft = Omit<
  ResourceSession,
  'id' | 'source' | 'createdAt'
>;

/**
 * updateResourceSession 入参（R1 接力画布编辑）：队长拖卡片排先后 / 选填预估完成时间。
 * 只两字段可改——`orderInWindow`（画布内拖动排序）+ `eta`（可空预估完成时间，nullable）；
 * 都 optional（拖卡只动 order、改 eta 只动 eta）。其余字段不开 update 口子（C3 受限编辑）。
 * 旧 JSON decorator 落盘到 schedule-sessions.json（SCHEDULE-PERSIST，与 resourceSessions 同落）；
 * 测试 fake 仅改内存数组（D-029：占用窗口粗粒度临时，重启回 seed）。
 */
export type ResourceSessionPatch = Partial<
  Pick<ResourceSession, 'orderInWindow' | 'eta'>
>;

/**
 * createRelayHandoff 入参（R1 接力画布拉线）：队长在两卡间拉「接力交接线」——先后交接、**非**任务依赖。
 * Store 补 id/createdAt、钉 `source='console'`（C5 来源 seam server 钉），故 draft 仅 Omit id/source/createdAt。
 * `confirmedBy` 随请求传入（拉线即确认拍板，类比 ResourceSession/Dependency 内部凭证），保留在 draft。
 * 旧 JSON decorator 落盘到 schedule-sessions.json（SCHEDULE-PERSIST，与 session 同落）；测试 fake
 * 仅改内存数组（D-029）。**反监视红线**：主键只 session/资源/组，永无 memberId。
 */
export type RelayHandoffDraft = Omit<
  RelayHandoff,
  'id' | 'source' | 'createdAt'
>;

/**
 * 共享物理资源（车）+ 差异化在场排班读写出入口（schedule 域）。
 *
 * 宪法护栏（写入实现时必须延续，见 AGENTS §5）：
 *   - **C2 反排名**：白名单永不暴露 memberId 完成量横比维度。
 *   - **C3 小作坊**：resourceSession/relayHandoff 只受限编辑（orderInWindow/eta）、不开通用字段 update；
 *     无 list 全家桶 / 物理 delete 大部分口子（deleteResourceSession/deleteRelayHandoff 是本域仅有的两条物删，
 *     镜像 D-029 粗粒度临时数据的可回收语义）。
 */
export interface ScheduleStore {
  /**
   * 共享物理资源（实车 / 测试台）只读。**为何独立读口**见本文件顶部注释。
   */
  listResources(): Promise<SharedResource[]>;
  /**
   * 建一台共享资源（POST /api/resources，R3 车管理 / D-072 §3.2）。Store 补 id + updatedAt、
   * **钉 status=`available` / statusReason=null / statusSource=`console`**（C5 来源 seam）。
   * displayCode 由 **Store 内部**经 deriveDisplayCode 派生（**禁手写**，调用方绝不传，D-072 §3.2 决定 K）。
   * **持久化（R3 核心）**：旧 JSON decorator 落盘到独立 resources.json（不入 GovernanceSnapshot）；
   * 测试 fake 仅改内存数组。**I0**：SharedResource 无成员维度，绝不引入 memberId / 出勤。
   */
  createResource(resource: ResourceDraft): Promise<SharedResource>;
  /**
   * 既有车状态迁移（PATCH /api/resources/:id/status，R3 改状态 / D-072 §3.3）。在 ResourceStatus 枚举内
   * 流转（维修 / 退役 / 拆解 / 回 available）。**退役 = 改 status→retired、非物删**（整车留展示，
   * ResourceSession 仍引用 resourceId；故无 delete 口子）。statusReason optional+nullable（省略=不动、
   * 显式 null=清空、非空串=改写）；Store 钉 statusSource=`console`（C5）、bump updatedAt。
   * id 不存在 → 返回 null（路由层转 404）。旧 JSON decorator 改 inner 后原子写 resources.json。
   */
  updateResourceStatus(
    id: string,
    patch: ResourceStatusPatch,
  ): Promise<SharedResource | null>;
  /**
   * 既有车默认阵型写回（PATCH /api/resources/:id/preset，D-082 §6 D2「使用预设」铺底基线）。
   * 整体替换 `defaultPreset`（传对象=设/改，传 `null`=清除）；不开局部 lineup 增量合并口子（C3）。
   * id 不存在 → 返回 null（路由层转 404）。旧 JSON decorator 与 status 同落 resources.json（同一持久化面）。
   */
  setResourceDefaultPreset(
    id: string,
    preset: ResourceDefaultPresetPatch,
  ): Promise<SharedResource | null>;
  /** 占用窗口（GET /api/resource-sessions 读视图）。invitedMemberIds 是本窗操作名单（I0 许可），绝不按人聚合。 */
  listResourceSessions(): Promise<ResourceSession[]>;
  /**
   * 占用窗口录入（POST /api/resource-sessions，append-only）。Store 补 id + createdAt、**钉 source=`human`**
   * （C5：来源 seam server 钉，请求不收）。confirmedBy 随 draft 传入（录入即确认拍板）。**I0**：窗口本身
   * 不进派生输出维度；GET /api/schedule 只回 derivePresenceSchedule 的组键建议，绝不回原始 session。
   */
  createResourceSession(draft: ResourceSessionDraft): Promise<ResourceSession>;
  /**
   * 占用窗口批量原子创建（POST /api/resource-sessions/batch，D-082 §5 表格页【确认】）。
   * 路由层已完成全量校验（resource/group/task 存在、同车同窗 orderInWindow 不冲突）——本方法只负责
   * 「全部通过才一次落盘、任一构造失败整批不落」的原子语义。纯内存构造 + 一次性 push，无 IO 间隙，
   * 天然原子（不会出现半成功）。每条 Store 补 id=`sess-new-N` + createdAt、钉 `source='human'`；
   * **invitedMemberIds 恒被强制清空为 `[]`**（I0 双保险：即便 draft 夹带成员 id 也在此原地清空，
   * 不信任调用方已清空）。confirmedBy 由调用方（路由）在每条 draft 上统一注入（点【确认】时一次性给）。
   */
  createResourceSessionsBatch(
    drafts: ResourceSessionDraft[],
  ): Promise<ResourceSession[]>;
  /**
   * 占用窗口受限编辑（PATCH /api/resource-sessions/:id，R1 接力画布）。只改 orderInWindow / eta
   * （C3 受限编辑、非通用字段 update）。id 不存在 → null（路由层转 404）。旧 JSON decorator 落盘到
   * schedule-sessions.json（SCHEDULE-PERSIST）；测试 fake 仅改内存数组。
   */
  updateResourceSession(
    id: string,
    patch: ResourceSessionPatch,
  ): Promise<ResourceSession | null>;
  /**
   * 删一棒（DELETE /api/resource-sessions/:id，A2 接力画布「删除一棒」）。删该 session 本体，并**级联删除
   * 引用它的接力交接线**（relayHandoffs 中 fromSessionId===id 或 toSessionId===id 的边——避免删卡后悬空箭头）。
   * 命中（删了 session）返回 true、不存在 false（路由转 404）。旧 JSON decorator 把 session + 级联删除的
   * handoffs 一并落盘到 schedule-sessions.json（SCHEDULE-PERSIST，同一次原子写）；测试 fake 仅改
   * 内存数组（重启回 seed）。**注意**与 deleteResource 不同：ResourceSession 是粗粒度临时占用窗口、可物删；
   * SharedResource 因被 session 引用故只退役不物删（见 updateResourceStatus 注释）。
   */
  deleteResourceSession(id: string): Promise<boolean>;
  /** 接力交接线只读（GET /api/relay 组 ScheduleSnapshot 用）。先后交接、**非**任务依赖；无 memberId。 */
  listRelayHandoffs(): Promise<RelayHandoff[]>;
  /**
   * 接力交接线录入（POST /api/relay-handoffs，R1 画布拉线）。Store 补 id + createdAt、**钉 source=`console`**
   * （C5：来源 seam server 钉，请求不收）。confirmedBy 随 draft 传入（拉线即确认拍板）。自环/成环校验在路由层。
   * 旧 JSON decorator 落盘到 schedule-sessions.json（SCHEDULE-PERSIST）；测试 fake 仅改内存数组
   * （D-029，重启回 seed=空）。
   */
  createRelayHandoff(draft: RelayHandoffDraft): Promise<RelayHandoff>;
  /** 删一条接力交接线（DELETE /api/relay-handoffs/:id）。命中删除返回 true，不存在 false（路由转 404）。 */
  deleteRelayHandoff(id: string): Promise<boolean>;
}
