// 库存 / BOM 读写契约下沉 @teamhub/hub-contracts（与 hub-server 共用同一源，D-052 重复真相收口纪律）；
// 此处 re-export 维持 console 侧 import 路径（client.ts / InvPage / InvQuickRecordForm from '../../api/schemas/inv'）。
export {
  InventoryResponseSchema,
  CreatePartTypeRequestSchema,
  CreatePartTypeResponseSchema,
  CreatePartActionRequestSchema,
  CreatePartActionResponseSchema,
} from '@teamhub/hub-contracts';
export type {
  InventoryResponse,
  InventoryLedgerRow,
  PartType,
  PartAction,
  PartActionKind,
  PartCategory,
  TrackedPart,
  CreatePartTypeRequest,
  CreatePartTypeResponse,
  CreatePartActionRequest,
  CreatePartActionResponse,
} from '@teamhub/hub-contracts';
