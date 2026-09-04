import {
  IDLE_HOLDER,
  InvalidPartActionError,
  deriveInventoryLedger,
  deriveShortfalls,
  parseHermesText,
} from '@teamhub/hub-contracts';
import {
  HermesInvQueryArgsSchema,
  HermesInvRecordArgsSchema,
} from '@teamhub/hub-contracts';
import type {
  HermesInboundRequest,
  HermesInboundResponse,
  InventoryImportRow,
  InventoryParseResult,
  InventoryResponse,
  PartAction,
  PartType,
  SharedResource,
} from '@teamhub/hub-contracts';
import { parseInventoryCsv } from '@teamhub/hub-contracts';
import type {
  InventoryImportOutcome,
  InventoryRepository,
  InventoryResourcePort,
  PartActionDraft,
  PartTypeDraft,
} from './repository.js';

/**
 * 库存域 application service（ARCH-UNIFY A4）：用例编排唯一落点——库存总表派生、holder 资源校验、
 * CSV 预览/导入、Hermes 对话记账（inv-query / inv-record）。route 只 parse/auth/映射 HTTP。
 *
 * 跨域只经窄口：资源清单走 `InventoryResourcePort`（不拿完整 PmRepository）；报销入库联动反向走
 * reimburse 侧 `InventoryStockInPort`（由同一 SQLite repository 兼任，见 modules/reimburse/service.ts）。
 */
export class InventoryService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly resources: InventoryResourcePort,
  ) {}

  /** GET /api/inventory：快照 + 资源列 → 占用矩阵派生 + 缺料告警。 */
  async getInventory(): Promise<InventoryResponse> {
    const snapshot = await this.repository.getInventorySnapshot();
    const resources = await this.resources.listResources();
    return {
      partTypes: snapshot.partTypes,
      trackedParts: snapshot.trackedParts,
      ledger: deriveInventoryLedger(snapshot, resources),
      shortfalls: deriveShortfalls(snapshot),
      actions: snapshot.actions,
    };
  }

  /** POST /api/inventory/part-types：盘点建底 / 补料 / 调阈值。 */
  async upsertPartType(draft: PartTypeDraft): Promise<PartType> {
    return this.repository.upsertPartType(draft);
  }

  /**
   * POST /api/inventory/actions：先校验 holder 引用真实资源（idle 除外），再落 append-only 动作。
   * 未知 resourceId / 非法迁移抛 InvalidPartActionError（路由映射 400）。
   */
  async recordPartAction(draft: PartActionDraft): Promise<PartAction> {
    const validResourceIds = new Set(
      (await this.resources.listResources()).map((r) => r.id),
    );
    for (const holder of [draft.fromHolder, draft.toHolder]) {
      if (holder && holder !== IDLE_HOLDER && !validResourceIds.has(holder)) {
        throw new InvalidPartActionError(`未知 resourceId: ${holder}`);
      }
    }
    return this.repository.recordPartAction(draft);
  }

  /** POST /api/inventory/preview：CSV 文本 → 已校验行 + 坏行（不落库，行内编辑后走 importRows）。 */
  previewCsv(text: string): InventoryParseResult {
    return parseInventoryCsv(text);
  }

  /** POST /api/inventory/import：已校验行整批幂等 upsert（解析层坏行由路由并入报告）。 */
  async importRows(rows: readonly InventoryImportRow[]): Promise<InventoryImportOutcome> {
    return this.repository.importPartTypes(rows);
  }

  /**
   * POST /api/hermes/inbound（HERMES-CHAT-MVP 前置落地）：对话记账最小闭环——自然语言或
   * {command,args} → inv-query / inv-record。**I0**：来源钉 hermes，绝无 memberId。
   * 将来命令面扩展（presence-checkin/task-advance 等）时，本方法进独立 hermes 适配模块，
   * 库存两命令经窄口回调本 service。
   */
  async handleHermesInbound(request: HermesInboundRequest): Promise<HermesInboundResponse> {
    let command: string;
    let args: Record<string, unknown>;

    if ('text' in request) {
      const result = parseHermesText(request.text);
      if (!result) {
        return {
          ok: false,
          text: `没听懂「${request.text}」。试试：「3508还有几个」「新到了5个电容」「3508烧了一个」「把电容从R1拆到R2」`,
        };
      }
      command = result.command;
      args = result.args;
    } else {
      command = request.command;
      args = request.args;
    }

    const snapshot = await this.repository.getInventorySnapshot();
    const resources = await this.resources.listResources();

    if (command === 'inv-query') {
      return this.hermesInvQuery(args, snapshot.partTypes, resources);
    }
    if (command === 'inv-record') {
      return this.hermesInvRecord(args, snapshot.partTypes, resources);
    }
    throw new HermesUnknownCommandError(command);
  }

  private async hermesInvQuery(
    rawArgs: Record<string, unknown>,
    partTypes: PartType[],
    resources: SharedResource[],
  ): Promise<HermesInboundResponse> {
    const q = HermesInvQueryArgsSchema.safeParse(rawArgs);
    if (!q.success) {
      return { ok: false, text: `查询参数不对：${firstIssueMessage(q.error)}` };
    }
    const { name, category, robot } = q.data;
    let matched = partTypes;
    if (name) {
      const lower = name.toLowerCase();
      matched = matched.filter((p) => p.name.toLowerCase().includes(lower) || p.partNumber.toLowerCase().includes(lower));
    }
    if (category) {
      const lower = category.toLowerCase();
      matched = matched.filter((p) => p.category.toLowerCase().includes(lower));
    }
    if (robot) {
      // 车匹配三路：编号 displayCode / 车号 robotTarget 精确等值，name 允许子串（口头叫法也能命中）。
      const res = resources.find((r) => r.displayCode?.toLowerCase() === robot.toLowerCase() || r.name.toLowerCase().includes(robot.toLowerCase()) || r.robotTarget.toLowerCase() === robot.toLowerCase());
      if (!res) {
        return { ok: false, text: `没找到叫「${robot}」的机器人。` };
      }
      matched = matched.filter((p) => p.allocations.some((a) => a.resourceId === res.id && (a.used > 0 || a.reserved > 0)));
      if (matched.length === 0) {
        return { ok: true, text: `${res.displayCode ?? res.name} 上没有装配任何零件。` };
      }
      const lines = matched.map((p) => {
        const alloc = p.allocations.find((a) => a.resourceId === res.id)!;
        return `  ${p.name}(${p.partNumber}): 已装${alloc.used} 预留${alloc.reserved}`;
      });
      return { ok: true, text: `${res.displayCode ?? res.name} 装配清单：\n${lines.join('\n')}` };
    }
    if (matched.length === 0) {
      const hint = name ? `没找到叫「${name}」的件。` : category ? `类别「${category}」下没有件。` : '没有匹配的零件。';
      return { ok: false, text: hint };
    }
    const lines = matched.slice(0, 20).map((p) => {
      const usedTotal = p.allocations.reduce((s, a) => s + a.used + a.reserved, 0);
      const idle = p.totalQuantity - usedTotal;
      return `  ${p.name}(${p.partNumber}): 总${p.totalQuantity} 闲置${idle} [${p.category}]`;
    });
    const suffix = matched.length > 20 ? `\n  …还有${matched.length - 20}条` : '';
    return { ok: true, text: `库存查询结果（${matched.length}条）：\n${lines.join('\n')}${suffix}` };
  }

  private async hermesInvRecord(
    rawArgs: Record<string, unknown>,
    partTypes: PartType[],
    resources: SharedResource[],
  ): Promise<HermesInboundResponse> {
    const r = HermesInvRecordArgsSchema.safeParse(rawArgs);
    if (!r.success) {
      return { ok: false, text: `记账参数不对：${firstIssueMessage(r.error)}` };
    }
    const { name, action, quantity, from, to, note } = r.data;
    const lower = name.toLowerCase();
    const partType = partTypes.find((p) => p.name.toLowerCase() === lower || p.partNumber.toLowerCase() === lower) ?? partTypes.find((p) => p.name.toLowerCase().includes(lower) || p.partNumber.toLowerCase().includes(lower));
    if (!partType) {
      return { ok: false, text: `没找到叫「${name}」的件，无法记账。` };
    }
    // 同上的三路车匹配：编号/车号精确等值，名字允许子串。
    const findResource = (label: string) => resources.find((res) => res.displayCode?.toLowerCase() === label.toLowerCase() || res.name.toLowerCase().includes(label.toLowerCase()) || res.robotTarget.toLowerCase() === label.toLowerCase());
    if (action === 'add') {
      await this.repository.recordPartAction({ projectId: partType.projectId, partTypeId: partType.id, trackedPartId: null, kind: 'restock', quantityDelta: quantity, fromHolder: null, toHolder: null, note: note ?? `Hermes 入库 +${quantity}`, source: 'hermes' });
      return { ok: true, text: `已记录：${partType.name} 入库 +${quantity}，当前总数 ${partType.totalQuantity + quantity}。` };
    }
    if (action === 'subtract') {
      await this.repository.recordPartAction({ projectId: partType.projectId, partTypeId: partType.id, trackedPartId: null, kind: 'damage', quantityDelta: -quantity, fromHolder: null, toHolder: null, note: note ?? `Hermes 损耗 -${quantity}`, source: 'hermes' });
      return { ok: true, text: `已记录：${partType.name} 损耗 -${quantity}，当前总数 ${partType.totalQuantity - quantity}。` };
    }
    const fromRes = findResource(from!);
    const toRes = findResource(to!);
    if (!fromRes) return { ok: false, text: `没找到叫「${from}」的机器人。` };
    if (!toRes) return { ok: false, text: `没找到叫「${to}」的机器人。` };
    const transferNote = note ?? `Hermes 调拨 ${fromRes.displayCode ?? fromRes.name}→${toRes.displayCode ?? toRes.name}`;
    await this.repository.recordPartAction({ projectId: partType.projectId, partTypeId: partType.id, trackedPartId: null, kind: 'dismount', quantityDelta: -quantity, fromHolder: fromRes.id, toHolder: null, note: transferNote, source: 'hermes' });
    try {
      await this.repository.recordPartAction({ projectId: partType.projectId, partTypeId: partType.id, trackedPartId: null, kind: 'mount', quantityDelta: quantity, fromHolder: null, toHolder: toRes.id, note: transferNote, source: 'hermes' });
    } catch (mountErr) {
      await this.repository.recordPartAction({ projectId: partType.projectId, partTypeId: partType.id, trackedPartId: null, kind: 'mount', quantityDelta: quantity, fromHolder: null, toHolder: fromRes.id, note: `补偿回滚：${transferNote}`, source: 'hermes' }).catch(() => {});
      throw mountErr;
    }
    return { ok: true, text: `已记录：${partType.name} ×${quantity} 从 ${fromRes.displayCode ?? fromRes.name} 调到 ${toRes.displayCode ?? toRes.name}。` };
  }
}

/** zod 首条 issue 文案（service 内聚，不依赖 routes/helpers）。 */
function firstIssueMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '参数格式不对';
}

/** Hermes 未知命令（route 映射 400）。 */
export class HermesUnknownCommandError extends Error {
  constructor(public readonly command: string) {
    super(`未知命令: ${command}`);
    this.name = 'HermesUnknownCommandError';
  }
}
