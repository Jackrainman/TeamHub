import type { RelayStage } from '../../api/schemas/schedule';

// 一条泳道：一台机器人 + 其名下按 orderInWindow 排好的工作卡。
export type Lane = {
  resourceId: string;
  displayCode: string;
  stages: RelayStage[];
};

// 把 stages 按 resourceId 分组成泳道，保持 stages 首次出现顺序（后端已按资源登记顺序排好），
// 泳道内按 orderInWindow 升序。
export function buildLanes(stages: RelayStage[]): Lane[] {
  const laneByResource = new Map<string, Lane>();
  const order: string[] = [];
  for (const s of stages) {
    let lane = laneByResource.get(s.resourceId);
    if (!lane) {
      lane = { resourceId: s.resourceId, displayCode: s.displayCode, stages: [] };
      laneByResource.set(s.resourceId, lane);
      order.push(s.resourceId);
    }
    lane.stages.push(s);
  }
  for (const lane of laneByResource.values()) {
    lane.stages.sort((a, b) => a.orderInWindow - b.orderInWindow);
  }
  return order.map((id) => laneByResource.get(id)!);
}
