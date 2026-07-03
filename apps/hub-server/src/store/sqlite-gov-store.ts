import type {
  ArtifactRef,
  Dependency,
  GovernanceSnapshot,
  KnowledgeNode,
  Need,
  RelayHandoff,
  ResourceSession,
  SharedResource,
  Task,
  TaskStatus,
} from '@teamhub/hub-contracts';
import type {
  ArtifactDraft,
  DependencyDraft,
  GovStore,
  KnowledgeNodeDraft,
  NeedDraft,
  RelayHandoffDraft,
  ResourceDefaultPresetPatch,
  ResourceDraft,
  ResourceSessionDraft,
  ResourceSessionPatch,
  ResourceStatusPatch,
  TaskDraft,
} from './gov-store.js';

/**
 * 持久化切换合约 stub（D-042 持久层切换契约 / 可行性 §3 第 4 行）。
 *
 * 存在意义：证明**同一 `GovStore` interface** 可落到 SQLite，而非把 InMemoryGovStore（重启丢失）
 * 当唯一实现、将来切持久层时再一次性重建底座（化解「四次重建底座」违 C3）。
 *
 * 本刀只给 skeleton：方法体一律 throw `not implemented`；真实 better-sqlite3 / drizzle 接线后置——
 * 待用户确认固定 IP / 部署服务器后再做（见 docs/design/three-pillar-feasibility.md §6 持久层闸门，
 * AGENTS §8：真实服务器写入 / 部署需用户白天审批，本刀不碰）。
 */
const SQLITE_NOT_IMPLEMENTED =
  'SqliteGovStore: not implemented — 持久层实现后置（D-042 切换合约 stub；待部署服务器确认后接 better-sqlite3/drizzle）';

export class SqliteGovStore implements GovStore {
  async getSnapshot(): Promise<GovernanceSnapshot> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async createTask(_draft: TaskDraft): Promise<Task> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async createDependency(_draft: DependencyDraft): Promise<Dependency> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async createNeed(_draft: NeedDraft): Promise<Need> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async closeoutKbNode(_draft: KnowledgeNodeDraft): Promise<KnowledgeNode> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async appendArtifact(_draft: ArtifactDraft): Promise<ArtifactRef> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async setArtifactFile(
    _id: string,
    _file: NonNullable<ArtifactRef['storedFile']>,
  ): Promise<ArtifactRef | null> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async listResources(): Promise<SharedResource[]> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async createResource(_resource: ResourceDraft): Promise<SharedResource> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async updateResourceStatus(
    _id: string,
    _patch: ResourceStatusPatch,
  ): Promise<SharedResource | null> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async setResourceDefaultPreset(
    _id: string,
    _preset: ResourceDefaultPresetPatch,
  ): Promise<SharedResource | null> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async listResourceSessions(): Promise<ResourceSession[]> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async createResourceSession(
    _draft: ResourceSessionDraft,
  ): Promise<ResourceSession> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async createResourceSessionsBatch(
    _drafts: ResourceSessionDraft[],
  ): Promise<ResourceSession[]> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async updateResourceSession(
    _id: string,
    _patch: ResourceSessionPatch,
  ): Promise<ResourceSession | null> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async deleteResourceSession(_id: string): Promise<boolean> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async listRelayHandoffs(): Promise<RelayHandoff[]> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async createRelayHandoff(_draft: RelayHandoffDraft): Promise<RelayHandoff> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async deleteRelayHandoff(_id: string): Promise<boolean> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async updateTaskStatus(
    _taskId: string,
    _status: TaskStatus,
  ): Promise<Task | null> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }

  async waiveDependency(_depId: string): Promise<Dependency | null> {
    throw new Error(SQLITE_NOT_IMPLEMENTED);
  }
}
