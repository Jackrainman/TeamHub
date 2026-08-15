import {
  checklistScenarioFixture,
  type ActorRef,
  type ChecklistTemplate,
  type GateChecklistItem,
} from '@teamhub/hub-contracts';
import { createIdSequence, nextSequentialId } from '../../src/store/id-sequence.js';
import type { IdSequence } from '../../src/store/id-sequence.js';
import {
  applyChecklistClear,
  applyChecklistWaive,
  buildChecklistItem,
} from '../../src/modules/checklist/repository.js';
import type {
  ChecklistItemDraft,
  ChecklistRepository,
} from '../../src/modules/checklist/repository.js';

/** 单条检查项浅克隆隔离（无数组字段，`{...it}` 即够——挡外部改回读到的对象绕过写白名单，同 baseline 纪律）。 */
function cloneItem(item: GateChecklistItem): GateChecklistItem {
  return { ...item };
}

/**
 * 门检查单 / 欠条内存参考实现（GATE-CHECKLIST-IOU S-store）。items 键 = `id`；模板另存一份数组。
 *
 * 默认 seed = `checklistScenarioFixture`（demo 首屏「门详情检查单卡」+「总览告警区欠条未清」非空——同
 * InMemoryBaselineStore 缺省 seed `baselineScenarioFixture` 先例）；模板 seed 空（等复盘导入）。真实团队走
 * `POST /api/checklist` 现场快记覆盖之。该 fake 只服务测试，生产组合根不会引用。
 *
 * 写方法（`createItem`/`clearItem`/`waiveItem`）**不原地 mutate** 已存条目——每次改动都经
 * `GateChecklistItemSchema.parse` 产出**新对象**整体替换 Map 条目（fail-closed：挂接二选一 + 状态不变式
 * 校验不过即抛、不落副作用，同 InMemoryBaselineStore「先算后写、非法即抛」纪律）。
 * id 单调自增（`chk-new-N`，L1 纪律，见 id-sequence.ts）。
 */
export class InMemoryChecklistStore implements ChecklistRepository {
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
}
