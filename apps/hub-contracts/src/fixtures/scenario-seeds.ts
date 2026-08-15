import type { GovernanceSnapshot } from '../attribution.js';
import type { ScheduleSnapshot } from '../schedule.js';
import { deriveDisplayCode } from '../verticals/robotics.js';
import { generateRoboconBaselineTemplate } from '../domains/baseline/index.js';
import type { SeasonBaseline } from '../domains/baseline/index.js';
import type { GateChecklistItem } from '../domains/checklist/index.js';
import type { MemberKnowledge } from '../growth.js';
import type { KbSnapshot } from '../kb.js';
import type { InventorySnapshot, TrackedPart } from '../inventory.js';
import { GOVERNANCE_SCENARIO_TIME, GOVERNANCE_SCENARIO_NOW, governanceScenarioFixture } from './pm-seed.js';

const BASELINE_DEMO_ANCHORS = {
  semesterStart: '2025-09-08T00:00:00.000Z',
  competitionDate: '2026-08-16T00:00:00.000Z',
};
const DEMO_GATE_REVIEWER = { id: 'm-senior-1', displayName: '大三验收', source: 'console' as const };
const DEMO_PASSED_MILESTONE_IDS = new Set(['m-g1', 'm-m1', 'm-g2']);

export const baselineScenarioFixture: SeasonBaseline[] = [
  (() => {
    const template = generateRoboconBaselineTemplate(BASELINE_DEMO_ANCHORS);
    return {
      id: 'baseline-season-robocon-2026',
      seasonId: 'season-robocon-2026',
      anchors: template.anchors,
      segments: template.segments,
      phases: template.phases,
      milestones: template.milestones.map((m) =>
        DEMO_PASSED_MILESTONE_IDS.has(m.id)
          ? { ...m, status: 'passed' as const, passedBy: DEMO_GATE_REVIEWER }
          : m,
      ),
    };
  })(),
];

export const checklistScenarioFixture: GateChecklistItem[] = [
  {
    id: 'chk-demo-1',
    seasonBaselineId: 'baseline-season-robocon-2026',
    title: '24V→5V 模块无溯源，先用着',
    anchorMilestoneId: 'm-g4',
    origin: 'iou',
    status: 'pending',
    note: '实验车随手用完全合法，但整车试跑门前必须补验证记录或书面豁免。',
    createdAt: GOVERNANCE_SCENARIO_NOW,
  },
  {
    id: 'chk-demo-2',
    seasonBaselineId: 'baseline-season-robocon-2026',
    title: '备用电池组没做过流保护测试，先用着',
    anchorDueAt: '2026-06-05T00:00:00.000Z',
    origin: 'iou',
    status: 'pending',
    createdAt: '2026-05-28T00:00:00.000Z',
  },
];

export const memberKnowledgeFixtures: MemberKnowledge[] = [
  { memberId: 'm-visionC', knowledgeNodeId: 'kn-vision-cal', relation: 'interested', visibility: 'private', updatedAt: GOVERNANCE_SCENARIO_NOW },
  { memberId: 'm-visionC', knowledgeNodeId: 'kn-rtos', relation: 'learning', visibility: 'private', updatedAt: GOVERNANCE_SCENARIO_NOW },
];

export const SCENARIO_WINDOW_WEEKDAY = '2026-06-21';
export const SCENARIO_WINDOW_CONVERGENCE = '2026-06-28';

const PROVIDER_PROGRAM_A = {
  id: 'm-progA',
  displayName: '程序A',
  source: 'console' as const,
};

export function buildScheduleSeed(base: GovernanceSnapshot): ScheduleSnapshot {
  return {
    ...base,
    resources: [
      { id: 'res-r1', projectId: 'prj-robots', name: 'R1 比赛机器人', kind: 'robot', robotTarget: 'R1', status: 'inUse', statusReason: null, statusSource: 'console', season: '26', version: 1, displayCode: deriveDisplayCode('26', 'R1', 1), defaultPreset: { lineup: [{ groupId: 'grp-ec', taskId: 't-r1-system-tune' }] }, updatedAt: GOVERNANCE_SCENARIO_NOW },
      { id: 'res-r2', projectId: 'prj-robots', name: 'R2 比赛机器人', kind: 'robot', robotTarget: 'R2', status: 'available', statusReason: null, statusSource: 'console', season: '26', version: 1, displayCode: deriveDisplayCode('26', 'R2', 1), defaultPreset: { lineup: [{ groupId: 'grp-mech', taskId: 't-r2-spare' }, { groupId: 'grp-ec' }] }, updatedAt: GOVERNANCE_SCENARIO_NOW },
    ],
    resourceSessions: [
      { id: 'sess-tonight-ec', projectId: 'prj-robots', resourceId: 'res-r1', windowLabel: SCENARIO_WINDOW_WEEKDAY, orderInWindow: 0, holderGroupId: 'grp-ec', holderTaskId: 't-r1-system-tune', invitedMemberIds: [], note: 'R1 归电控做系统调试（平日差异化场景）', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, eta: null, createdAt: GOVERNANCE_SCENARIO_NOW },
      { id: 'sess-convergence-day-r1', projectId: 'prj-robots', resourceId: 'res-r1', windowLabel: SCENARIO_WINDOW_CONVERGENCE, orderInWindow: 0, holderGroupId: 'grp-convergence', holderTaskId: 't-r1-integration', invitedMemberIds: [], note: '总联调日：R1 全组各到一人', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, eta: null, createdAt: GOVERNANCE_SCENARIO_NOW },
      { id: 'sess-convergence-day-r2', projectId: 'prj-robots', resourceId: 'res-r2', windowLabel: SCENARIO_WINDOW_CONVERGENCE, orderInWindow: 0, holderGroupId: 'grp-convergence', holderTaskId: 't-r2-integration', invitedMemberIds: [], note: '总联调日：R2 全组各到一人', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, eta: null, createdAt: GOVERNANCE_SCENARIO_NOW },
    ],
    relayHandoffs: [],
  };
}

export const scheduleScenarioFixture: ScheduleSnapshot = buildScheduleSeed(governanceScenarioFixture);

export function buildScheduleResourceDownVariant(base: ScheduleSnapshot): ScheduleSnapshot {
  return {
    ...base,
    resources: [
      { ...base.resources[0], status: 'down', statusReason: '撞坏维修中' },
      base.resources[1],
    ],
  };
}

export const scheduleResourceDownFixture: ScheduleSnapshot = buildScheduleResourceDownVariant(scheduleScenarioFixture);

export const kbScenarioFixture: KbSnapshot = {
  projectId: 'prj-robots',
  issueCards: [
    {
      id: 'iss-can-2025',
      projectId: 'prj-robots',
      title: 'CAN 总线丢包导致底盘电机失控',
      rawInput: '底盘跑着跑着突然一个电机不转，CAN 报文像是丢了',
      normalizedSummary: 'CAN 总线在高负载下丢包，底盘电机收不到指令偶发失控',
      symptomSummary: '底盘电机偶发失控、CAN 报文丢失',
      suspectedDirections: ['CAN 波特率/采样点配置', '总线终端电阻', '报文发送频率过高'],
      suggestedActions: ['示波器看 CAN_H/CAN_L 波形', '降低非关键报文频率', '检查 120Ω 终端电阻'],
      status: 'archived',
      severity: 'high',
      tags: ['CAN', '底盘', '通信', '电机'],
      relatedFiles: ['src/chassis/can_bus.c', 'src/chassis/motor.c'],
      relatedCommits: ['a1b2c3d'],
      relatedHistoricalIssueIds: [],
      createdAt: '2025-05-10T08:00:00.000Z',
      updatedAt: '2025-05-12T10:00:00.000Z',
    },
    {
      id: 'iss-motor-3508-2025',
      projectId: 'prj-robots',
      title: '3508 电机过热烧毁',
      rawInput: '连续跑了半小时，3508 烫手然后冒烟烧了',
      normalizedSummary: '3508 电机长时间堵转 + 散热不足导致绕组过热烧毁',
      symptomSummary: '3508 电机过热、烧毁',
      suspectedDirections: ['散热片/风扇不足', '堵转保护缺失', 'PWM 频率过高'],
      suggestedActions: ['加散热片', '加堵转保护', '降 PWM 频率'],
      status: 'archived',
      severity: 'high',
      tags: ['电机', '3508', '散热'],
      relatedFiles: ['src/chassis/motor.c'],
      relatedCommits: ['e4f5g6h'],
      relatedHistoricalIssueIds: [],
      createdAt: '2025-06-15T14:00:00.000Z',
      updatedAt: '2025-06-16T09:00:00.000Z',
    },
    {
      id: 'iss-micro-ros-2025',
      projectId: 'prj-robots',
      title: 'MicroROS 节点启动后串口挂死',
      rawInput: 'MicroROS 节点跑起来后串口就不响应了',
      normalizedSummary: 'MicroROS 节点初始化后串口通信挂死',
      symptomSummary: 'MicroROS 启动后串口无响应',
      suspectedDirections: ['DMA 冲突', '栈溢出', '初始化顺序'],
      suggestedActions: ['检查 DMA 通道', '加大栈', '调整初始化顺序'],
      status: 'archived',
      severity: 'medium',
      tags: ['MicroROS', '串口', '嵌入式'],
      relatedFiles: ['src/ros/micro_ros.c'],
      relatedCommits: ['i7j8k9l'],
      relatedHistoricalIssueIds: [],
      createdAt: '2025-07-20T11:00:00.000Z',
      updatedAt: '2025-07-21T16:00:00.000Z',
    },
  ],
  errorEntries: [
    {
      id: 'err-can-2025',
      projectId: 'prj-robots',
      sourceIssueId: 'iss-can-2025',
      errorCode: 'DBG-20250510-001',
      title: 'CAN 总线丢包导致底盘电机失控',
      category: 'communication',
      symptom: '底盘电机偶发失控、CAN 报文丢失',
      rootCause: 'CAN 波特率与采样点配置不匹配，高负载下丢帧',
      resolution: '调整波特率至 1Mbps + 采样点 87.5%，加 120Ω 终端电阻',
      prevention: '新板调试先跑 CAN 压力测试',
      relatedFiles: ['src/chassis/can_bus.c'],
      relatedCommits: ['a1b2c3d'],
      archiveFilePath: 'kb/err-can-2025.md',
      createdAt: '2025-05-12T10:00:00.000Z',
      updatedAt: '2025-05-12T10:00:00.000Z',
    },
    {
      id: 'err-motor-2025',
      projectId: 'prj-robots',
      sourceIssueId: 'iss-motor-3508-2025',
      errorCode: 'DBG-20250615-001',
      title: '3508 电机过热烧毁',
      category: 'hardware',
      symptom: '3508 电机过热、烧毁',
      rootCause: '3508 电机堵转保护缺失 + 散热不足',
      resolution: '加散热片 + 堵转保护逻辑',
      prevention: '电机选型时确认散热规格',
      relatedFiles: ['src/chassis/motor.c'],
      relatedCommits: ['e4f5g6h'],
      archiveFilePath: 'kb/err-motor-2025.md',
      createdAt: '2025-06-16T09:00:00.000Z',
      updatedAt: '2025-06-16T09:00:00.000Z',
    },
  ],
  archiveDocuments: [
    {
      issueId: 'iss-can-2025',
      projectId: 'prj-robots',
      fileName: '2025-05-12_can-bus-packet-loss.md',
      filePath: 'kb/archive/2025-05-12_can-bus-packet-loss.md',
      markdownContent: '# CAN 总线丢包导致底盘电机失控\n\n结案归档：调整波特率至 1Mbps + 采样点 87.5%，加 120Ω 终端电阻。',
      generatedBy: 'manual',
      generatedAt: '2025-05-12T10:00:00.000Z',
    },
  ],
};

export interface LedgerAllocationRefs {
  primary: string;
  secondary: string;
}

function resolveHolderPattern(
  pattern: ReadonlyArray<'primary' | 'secondary' | 'idle'>,
  refs: LedgerAllocationRefs,
): string[] {
  return pattern.map((tag) => (tag === 'idle' ? 'idle' : refs[tag]));
}

function makeTrackedParts(
  partTypeId: string,
  prefix: string,
  holders: string[],
): TrackedPart[] {
  return holders.map((holder, i) => ({
    id: `${prefix}-${i + 1}`,
    projectId: 'prj-robots',
    partTypeId,
    serialLabel: `${prefix.toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
    currentHolder: holder,
    reserved: false,
    status: 'ok' as const,
    updatedAt: GOVERNANCE_SCENARIO_NOW,
  }));
}

export function buildLedgerSeed(resourceRefs: LedgerAllocationRefs): InventorySnapshot {
  const GM6020_HOLDERS = resolveHolderPattern(
    ['primary', 'primary', 'secondary', 'secondary', 'secondary', 'secondary', 'idle', 'idle', 'idle'],
    resourceRefs,
  );
  const C620_HOLDERS = resolveHolderPattern(
    ['primary', 'primary', 'secondary', 'secondary', 'secondary', 'secondary', 'idle', 'idle', 'idle'],
    resourceRefs,
  );
  const MC_HOLDERS = resolveHolderPattern(['primary', 'secondary', 'idle'], resourceRefs);

  return {
    projectId: 'prj-robots',
    partTypes: [
      {
        id: 'parttype-gm6020',
        projectId: 'prj-robots',
        partNumber: 'GM6020',
        name: 'GM6020 电机',
        category: 'motor',
        unit: '个',
        trackIndividually: true,
        totalQuantity: 9,
        allocations: [
          { resourceId: resourceRefs.primary, used: 2, reserved: 0 },
          { resourceId: resourceRefs.secondary, used: 4, reserved: 0 },
        ],
        lowStockThreshold: 2,
        lastCountedAt: GOVERNANCE_SCENARIO_TIME,
        updatedAt: GOVERNANCE_SCENARIO_NOW,
      },
      {
        id: 'parttype-c620',
        projectId: 'prj-robots',
        partNumber: 'C620',
        name: 'C620 电调',
        category: 'esc',
        unit: '个',
        trackIndividually: true,
        totalQuantity: 9,
        allocations: [
          { resourceId: resourceRefs.primary, used: 2, reserved: 0 },
          { resourceId: resourceRefs.secondary, used: 4, reserved: 0 },
        ],
        lowStockThreshold: 2,
        lastCountedAt: GOVERNANCE_SCENARIO_TIME,
        updatedAt: GOVERNANCE_SCENARIO_NOW,
      },
      {
        id: 'parttype-maincontroller',
        projectId: 'prj-robots',
        partNumber: 'main-controller',
        name: '主控板',
        category: 'controller',
        unit: '块',
        trackIndividually: true,
        totalQuantity: 3,
        allocations: [
          { resourceId: resourceRefs.primary, used: 1, reserved: 0 },
          { resourceId: resourceRefs.secondary, used: 1, reserved: 0 },
        ],
        lowStockThreshold: 2,
        lastCountedAt: GOVERNANCE_SCENARIO_TIME,
        updatedAt: GOVERNANCE_SCENARIO_NOW,
      },
      {
        id: 'parttype-m4screw',
        projectId: 'prj-robots',
        partNumber: 'M4x10',
        name: 'M4 螺丝',
        category: 'mechanical',
        unit: '颗',
        trackIndividually: false,
        totalQuantity: 200,
        allocations: [],
        lowStockThreshold: 50,
        lastCountedAt: GOVERNANCE_SCENARIO_TIME,
        updatedAt: GOVERNANCE_SCENARIO_NOW,
      },
    ],
    trackedParts: [
      ...makeTrackedParts('parttype-gm6020', 'part-gm', GM6020_HOLDERS),
      ...makeTrackedParts('parttype-c620', 'part-c620', C620_HOLDERS),
      ...makeTrackedParts('parttype-maincontroller', 'part-mc', MC_HOLDERS),
    ],
    actions: [
      {
        id: 'act-gm-stocktake',
        projectId: 'prj-robots',
        partTypeId: 'parttype-gm6020',
        trackedPartId: null,
        kind: 'stocktake',
        quantityDelta: 10,
        fromHolder: null,
        toHolder: null,
        note: '赛季初盘点 GM6020 电机',
        recordedBy: { source: 'human', at: GOVERNANCE_SCENARIO_TIME },
        recordedAt: GOVERNANCE_SCENARIO_TIME,
      },
      {
        id: 'act-gm-mount-r2',
        projectId: 'prj-robots',
        partTypeId: 'parttype-gm6020',
        trackedPartId: 'part-gm-3',
        kind: 'mount',
        quantityDelta: 1,
        fromHolder: 'idle',
        toHolder: resourceRefs.secondary,
        note: 'GM6020 装到 R2 底盘',
        recordedBy: { source: 'human', at: '2026-06-10T03:00:00.000Z' },
        recordedAt: '2026-06-10T03:00:00.000Z',
      },
      {
        id: 'act-gm-damage',
        projectId: 'prj-robots',
        partTypeId: 'parttype-gm6020',
        trackedPartId: null,
        kind: 'damage',
        quantityDelta: 1,
        fromHolder: null,
        toHolder: null,
        note: '坏了一个 3508、烧了',
        recordedBy: { source: 'human', at: GOVERNANCE_SCENARIO_NOW },
        recordedAt: GOVERNANCE_SCENARIO_NOW,
      },
      {
        id: 'act-mc-stocktake',
        projectId: 'prj-robots',
        partTypeId: 'parttype-maincontroller',
        trackedPartId: null,
        kind: 'stocktake',
        quantityDelta: 3,
        fromHolder: null,
        toHolder: null,
        note: '盘点主控板',
        recordedBy: { source: 'human', at: GOVERNANCE_SCENARIO_TIME },
        recordedAt: GOVERNANCE_SCENARIO_TIME,
      },
    ],
  };
}

export const inventoryScenarioFixture: InventorySnapshot = buildLedgerSeed({
  primary: scheduleScenarioFixture.resources[0].id,
  secondary: scheduleScenarioFixture.resources[1].id,
});
