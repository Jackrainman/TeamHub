import type {
  RelayHandoff,
  ResourceSession,
  SharedResource,
} from '@teamhub/hub-contracts';
import {
  buildCreatedResource,
  buildCreatedResourceSession,
  buildCreatedResourceSessionsBatch,
  buildCreatedRelayHandoff,
  applyResourceStatus,
  applyResourceDefaultPreset,
  applyResourceSessionPatch,
} from '../../src/store/gov-store-logic.js';
import type {
  RelayHandoffDraft,
  ResourceDefaultPresetPatch,
  ResourceDraft,
  ResourceSessionDraft,
  ResourceSessionPatch,
  ResourceStatusPatch,
  ScheduleStore,
} from '../../src/store/gov-store.js';
import { nextSequentialId } from '../../src/store/id-sequence.js';
import type { InMemoryGovStoreBase } from './inmemory-gov-store-base.js';

/**
 * schedule 域方法 mixin（GOV-SPLIT）：ScheduleStore 全部 12 条方法（资源车读写 + 占用窗口 +
 * 接力交接线）叠到基座上。方法体逐字自原 InMemoryGovStore 搬迁（mock-gov-store.ts 单文件拆分），零行为变化。
 */
type Base = new (...args: any[]) => InMemoryGovStoreBase;

export function ScheduleMixin<T extends Base>(
  BaseClass: T,
): T & (new (...args: any[]) => ScheduleStore) {
  return class InMemoryGovStoreSchedule extends BaseClass {
    /** 共享物理资源只读（GET /api/schedule 组装 ScheduleSnapshot 用；GET /api/resources 可选读视图）。 */
    async listResources(): Promise<SharedResource[]> {
      // 浅拷贝（对齐 getSnapshot 的克隆封装）：防外部读到 live 数组后 push/splice 绕过写白名单。
      return [...this.resources];
    }

    /**
     * 建一台共享资源（POST /api/resources，R3 车管理 / D-072 §3.2）。Store 补 id=`res-new-N` + updatedAt、
     * **钉 status=`available` / statusReason=null / statusSource=`console`**（C5：来源 seam server 钉，建车一律空闲可用）。
     * displayCode **禁手写**（D-072 §3.2 决定 K）——**store 内派生**（与 status/statusSource 同列由 server 钉）：
     * 给了 season 才经 deriveDisplayCode(season, robotTarget, version ?? 1) 派生，否则 undefined（读视图回退 name）。
     * 调用方（路由 / 旧生产 Store 委托）绝不传 displayCode（ResourceDraft 已 Omit 之）。
     * **I0**：SharedResource 无 person 字段，draft 也不含——车是中性对象，绝无 memberId / 出勤。
     */
    async createResource(draft: ResourceDraft): Promise<SharedResource> {
      const now = this.clock.now().toISOString();
      const resource = buildCreatedResource(
        draft,
        nextSequentialId('res-new', this.resourceSeq),
        now,
      );
      this.resources.push(resource);
      return resource;
    }

    /**
     * 既有车状态迁移（PATCH /api/resources/:id/status，R3 改状态 / D-072 §3.3）。在 ResourceStatus 枚举内流转
     * （维修 / 退役 retired / 拆解 / 回 available）。**退役 = 改 status、非物删**（整车留展示，无 splice）。
     * statusReason：未传（undefined）保留旧值、显式 null 清空、给非空串改写。**statusSource 钉 `console`**（C5），
     * bump updatedAt。id 不存在 → null（路由转 404）。
     */
    async updateResourceStatus(
      id: string,
      patch: ResourceStatusPatch,
    ): Promise<SharedResource | null> {
      const idx = this.resources.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      const now = this.clock.now().toISOString();
      const updated = applyResourceStatus(this.resources[idx], patch, now);
      this.resources[idx] = updated;
      return updated;
    }

    /**
     * 既有车默认阵型写回（PATCH /api/resources/:id/preset，D-082 §6 D2）。**整体替换**：传对象=设/改
     * `defaultPreset`（不与旧值合并 lineup）、传 `null`=清除（车退出「使用预设」铺底）。bump updatedAt；
     * `statusSource`/`status` 等其余字段不动（本方法只碰 defaultPreset 一个字段，C3 受限编辑）。
     * id 不存在 → null（路由转 404）。
     */
    async setResourceDefaultPreset(
      id: string,
      preset: ResourceDefaultPresetPatch,
    ): Promise<SharedResource | null> {
      const idx = this.resources.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      const now = this.clock.now().toISOString();
      const updated = applyResourceDefaultPreset(this.resources[idx], preset, now);
      this.resources[idx] = updated;
      return updated;
    }

    /** 占用窗口只读（GET /api/resource-sessions + GET /api/schedule 组装用）。 */
    async listResourceSessions(): Promise<ResourceSession[]> {
      // 浅拷贝（对齐 getSnapshot 的克隆封装）：防外部读到 live 数组后 push/splice 绕过写白名单。
      return [...this.resourceSessions];
    }

    /**
     * 占用窗口录入（POST /api/resource-sessions，D-029）。镜像 createNeed：补 id=`sess-new-N` + createdAt、
     * **钉 source=`human`**（C5：来源 seam server 钉，客户端不冒充 derived/aiSuggested）。confirmedBy 随 draft 传入
     * （录入即确认拍板，类比 Need/Dependency 内部凭证）。**I0**：本对象不进派生输出维度——GET /api/schedule 只回
     * derivePresenceSchedule 的组键建议（无 memberId），不回原始 session；invitedMemberIds 仅本窗操作名单、绝不按人累计。
     */
    async createResourceSession(
      draft: ResourceSessionDraft,
    ): Promise<ResourceSession> {
      const now = this.clock.now().toISOString();
      const session = buildCreatedResourceSession(
        draft,
        nextSequentialId('sess-new', this.resourceSessionSeq),
        now,
      );
      this.resourceSessions.push(session);
      return session;
    }

    /**
     * 占用窗口批量原子创建（POST /api/resource-sessions/batch，D-082 §5 表格页【确认】）。路由层已做
     * 全量校验（resource/group/task 存在、同车同窗 orderInWindow 不冲突）；本方法只负责「全部构造完毕才
     * 一次性 push」的原子语义——纯内存操作、无 IO 间隙，构造阶段不会出现部分失败。逐条补 id=`sess-new-N` +
     * createdAt、钉 `source='human'`；**invitedMemberIds 恒强制清空 []**（I0 双保险，不信任 draft 已清空）。
     */
    async createResourceSessionsBatch(
      drafts: ResourceSessionDraft[],
    ): Promise<ResourceSession[]> {
      const now = this.clock.now().toISOString();
      const sessions = buildCreatedResourceSessionsBatch(
        drafts,
        () => nextSequentialId('sess-new', this.resourceSessionSeq),
        now,
      );
      this.resourceSessions.push(...sessions);
      return sessions;
    }

    /**
     * 占用窗口受限编辑（PATCH /api/resource-sessions/:id，R1 接力画布）。只改 orderInWindow / eta
     * （C3 受限编辑、非通用字段 update）：传了才改、未传保留旧值（eta 显式 null=清空预估时间）。
     * id 不存在 → null（路由转 404）。与 resourceSessions 同走内存、不落盘（D-029）。
     */
    async updateResourceSession(
      id: string,
      patch: ResourceSessionPatch,
    ): Promise<ResourceSession | null> {
      const idx = this.resourceSessions.findIndex((s) => s.id === id);
      if (idx === -1) return null;
      const updated = applyResourceSessionPatch(this.resourceSessions[idx], patch);
      this.resourceSessions[idx] = updated;
      return updated;
    }

    /**
     * 删一棒（DELETE /api/resource-sessions/:id，A2 接力画布「删除一棒」）。删该 session，并**级联删除引用它的
     * 接力交接线**（fromSessionId===id 或 toSessionId===id 的边——删卡后箭头不悬空）。命中返回 true、不存在 false
     * （路由转 404）。与 resourceSessions/relayHandoffs 同走内存、不落盘（D-029）。
     */
    async deleteResourceSession(id: string): Promise<boolean> {
      const idx = this.resourceSessions.findIndex((s) => s.id === id);
      if (idx === -1) return false;
      this.resourceSessions.splice(idx, 1);
      // 级联：原地清掉引用该 session 的接力交接线（保持 relayHandoffs 数组引用稳定，与 deleteRelayHandoff 同语义）。
      for (let i = this.relayHandoffs.length - 1; i >= 0; i--) {
        const h = this.relayHandoffs[i];
        if (h.fromSessionId === id || h.toSessionId === id) {
          this.relayHandoffs.splice(i, 1);
        }
      }
      return true;
    }

    /** 接力交接线只读（GET /api/relay 组 ScheduleSnapshot 用）。先后交接、**非**任务依赖；无 memberId。 */
    async listRelayHandoffs(): Promise<RelayHandoff[]> {
      // 浅拷贝（对齐 getSnapshot 的克隆封装）：防外部读到 live 数组后 push/splice 绕过写白名单。
      return [...this.relayHandoffs];
    }

    /**
     * 接力交接线录入（POST /api/relay-handoffs，R1 画布拉线）。镜像 createResourceSession：补 id=`handoff-new-N` +
     * createdAt、**钉 source=`console`**（C5：来源 seam server 钉，客户端不冒充 derived/lark/git）。confirmedBy 随
     * draft 传入（拉线即确认拍板）。自环/成环校验在路由层（参照 wouldCreateCycle）。不落盘（D-029）。
     */
    async createRelayHandoff(draft: RelayHandoffDraft): Promise<RelayHandoff> {
      const now = this.clock.now().toISOString();
      const handoff = buildCreatedRelayHandoff(
        draft,
        nextSequentialId('handoff-new', this.relayHandoffSeq),
        now,
      );
      this.relayHandoffs.push(handoff);
      return handoff;
    }

    /** 删一条接力交接线（DELETE /api/relay-handoffs/:id）。命中删除返回 true、不存在 false（路由转 404）。 */
    async deleteRelayHandoff(id: string): Promise<boolean> {
      const idx = this.relayHandoffs.findIndex((h) => h.id === id);
      if (idx === -1) return false;
      this.relayHandoffs.splice(idx, 1);
      return true;
    }
  };
}
