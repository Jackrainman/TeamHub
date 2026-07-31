import {
  checklistScenarioFixture,
  type ActorRef,
  type ChecklistTemplate,
  type GateChecklistItem,
} from '@teamhub/hub-contracts';
import { createIdSequence, nextSequentialId } from './id-sequence.js';
import type { IdSequence } from './id-sequence.js';
import {
  applyChecklistClear,
  applyChecklistWaive,
  buildChecklistItem,
} from './base-checklist-logic.js';
import type { ChecklistItemDraft, ChecklistStore } from './checklist-store.js';

/** 单条检查项浅克隆隔离（无数组字段，`{...it}` 即够——挡外部改回读到的对象绕过写白名单，同 baseline 纪律）。 */
function cloneItem(item: GateChecklistItem): GateChecklistItem {
  return { ...item };
}

/**
 * 门检查单 / 欠条内存参考实现（GATE-CHECKLIST-IOU S-store）。items 键 = `id`；模板另存一份数组。
 *
 * 默认 seed = `checklistScenarioFixture`（demo 首屏「门详情检查单卡」+「总览告警区欠条未清」非空——同
 * InMemoryBaselineStore 缺省 seed `baselineScenarioFixture` 先例）；模板 seed 空（等复盘导入）。真实团队走
 * `POST /api/checklist` 现场快记覆盖之。进程重启丢失为预期；落盘持久层见 `FileChecklistStore`。
 *
 * 写方法（`createItem`/`clearItem`/`waiveItem`）**不原地 mutate** 已存条目——每次改动都经
 * `GateChecklistItemSchema.parse` 产出**新对象**整体替换 Map 条目（fail-closed：挂接二选一 + 状态不变式
 * 校验不过即抛、不落副作用，同 InMemoryBaselineStore「先算后写、非法即抛」纪律）。
 * id 单调自增（`chk-new-N`，L1 纪律，见 id-sequence.ts）。
 */
export class InMemoryChecklistStore implements ChecklistStore {
  private readonly items: Map<string, GateChecklistItem>;
  private readonly templates: ChecklistTemplate[];
  private readonly idSeq: IdSequence;

  constructor(
    seedItems: GateChecklistItem[] = checklistScenarioFixture,
    seedTemplates: ChecklistTemplate[] = [],
  ) {
    this.items = new Map(seedItems.map((it) => [it.id, cloneItem(it)]));
    this.templates = seedTemplates.map((t) => ({ ...t }));
    // 从 seed 条数起步（首条 create 得 chk-new-${len+1}）；seed 的 chk-demo-* 与生成的 chk-new-* 不同名段、不撞。
    this.idSeq = createIdSequence(seedItems.length);
  }

  async listItems(seasonBaselineId: string): Promise<GateChecklistItem[]> {
    const out: GateChecklistItem[] = [];
    for (const it of this.items.values()) {
      if (it.seasonBaselineId === seasonBaselineId) out.push(cloneItem(it));
    }
    return out;
  }

  async createItem(draft: ChecklistItemDraft): Promise<GateChecklistItem> {
    // id 由 store 生成、status 钉 pending；坏 draft（如挂接二选一违规）在 buildChecklistItem 内 parse 抛，不落进 Map。
    const item = buildChecklistItem(draft, nextSequentialId('chk-new', this.idSeq));
    this.items.set(item.id, item);
    return cloneItem(item);
  }

  async clearItem(id: string, clearedBy: ActorRef): Promise<GateChecklistItem | null> {
    // 状态机只许 pending 出发：不存在 / 已 passed / 已 waived → null（路由层区分 404 / 409）。
    const updated = applyChecklistClear(this.items.get(id), clearedBy);
    if (!updated) return null;
    this.items.set(id, updated);
    return cloneItem(updated);
  }

  async waiveItem(
    id: string,
    waivedBy: ActorRef,
    waiveReason: string,
  ): Promise<GateChecklistItem | null> {
    const updated = applyChecklistWaive(this.items.get(id), waivedBy, waiveReason);
    if (!updated) return null;
    this.items.set(id, updated);
    return cloneItem(updated);
  }

  async listTemplates(): Promise<ChecklistTemplate[]> {
    return this.templates.map((t) => ({ ...t }));
  }

  /**
   * @internal 持久层回滚专用（FileChecklistStore）：读某条目 live 引用（可能不存在）。
   * 不做克隆——调用方只用于捕获写前状态以便 persist() 失败时精确还原，不对外暴露给业务读路径。
   */
  peek(id: string): GateChecklistItem | undefined {
    return this.items.get(id);
  }

  /**
   * @internal 持久层回滚专用：整体替换或删除（`value===undefined`）某条目，供 persist() 失败时
   * 把内存精确还原到写前状态（含「写前本不存在、写后需撤销新建」的情形）。
   */
  restore(id: string, value: GateChecklistItem | undefined): void {
    if (value === undefined) {
      this.items.delete(id);
    } else {
      this.items.set(id, value);
    }
  }

  /** @internal 落盘专用：所有检查项（只读遍历序列化，无需克隆——JSON 与 live 逐字相同）。 */
  entriesItems(): GateChecklistItem[] {
    return Array.from(this.items.values());
  }

  /** @internal 落盘专用：所有模板。 */
  entriesTemplates(): ChecklistTemplate[] {
    return this.templates;
  }
}
