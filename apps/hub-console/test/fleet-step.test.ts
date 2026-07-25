import { describe, expect, test } from 'vitest';
import { RESOURCE_INIT_STATUSES } from '@teamhub/hub-contracts';
import { CreateResourcesBatchRequestSchema } from '../src/api/schemas/resources';
import {
  buildFleetBatchRequest,
  FLEET_STATUS_KEY,
  fleetRowsSubmittable,
  isFleetRowBlank,
  newFleetRow,
  suggestFleetSeasonCode,
  type FleetRow,
} from '../src/features/setup/BootstrapGate';
import { translations } from '../src/i18n/translations';

/**
 * 初始化向导「车队」步（FLEET-BATCH-INIT 刀⑩）纯数据单测——不测 DOM/RTL（「测逻辑不测 DOM」，
 * 同 bootstrap-gate.test.ts / season-suggest.test.ts 范式）：行编辑 helper（新行默认/空行判定/可提交判定/
 * 请求体构建）+ 空表跳过逻辑 + 赛季码派生 + i18n 双语键齐全。
 */
describe('fleet-step: 赛季码派生与新行默认', () => {
  test('suggestFleetSeasonCode = suggestSeason 年份后两位（9 月 → 次年赛季码；1 月 → 当年赛季码）', () => {
    expect(suggestFleetSeasonCode(new Date(Date.UTC(2026, 8, 1)))).toBe('27'); // 2026-09 → 2027赛季
    expect(suggestFleetSeasonCode(new Date(Date.UTC(2027, 0, 15)))).toBe('27'); // 2027-01 → 2027赛季
    expect(suggestFleetSeasonCode(new Date(Date.UTC(2026, 6, 25)))).toBe('26'); // 2026-07 → 2026赛季
  });

  test('newFleetRow：空名 / R1 / 赛季码预填 / 第 1 代 / 能用', () => {
    expect(newFleetRow('27')).toEqual({
      name: '',
      robotTarget: 'R1',
      season: '27',
      version: '1',
      status: 'available',
    });
  });
});

describe('fleet-step: 空表跳过与可提交判定', () => {
  const filled: FleetRow = {
    name: 'R1 比赛机器人',
    robotTarget: 'R1',
    season: '27',
    version: '2',
    status: 'repair',
  };

  test('空表（仅空行）→ 不可提交 = 走「跳过」（空行 = 名称为空）', () => {
    expect(isFleetRowBlank(newFleetRow('27'))).toBe(true);
    expect(fleetRowsSubmittable([newFleetRow('27')])).toBe(false);
    expect(fleetRowsSubmittable([])).toBe(false);
  });

  test('有非空行且 version 正整数 → 可提交；version 0/负/小数/非数 → 不可', () => {
    expect(fleetRowsSubmittable([newFleetRow('27'), filled])).toBe(true);
    for (const bad of ['0', '-1', '1.5', 'abc', '']) {
      expect(fleetRowsSubmittable([{ ...filled, version: bad }])).toBe(false);
    }
  });

  test('buildFleetBatchRequest：剔空行、trim、赛季留空 → undefined、version 转数；产物过 contracts schema', () => {
    const req = buildFleetBatchRequest([
      newFleetRow('27'), // 空行 → 剔除
      filled,
      { ...filled, name: '  共用备件车  ', robotTarget: 'shared', season: '  ', status: 'retired' },
    ]);
    expect(req.resources).toHaveLength(2);
    expect(req.resources[0]).toEqual({
      name: 'R1 比赛机器人',
      robotTarget: 'R1',
      season: '27',
      version: 2,
      status: 'repair',
    });
    expect(req.resources[1].name).toBe('共用备件车');
    expect(req.resources[1].season).toBeUndefined();
    // 与服务端同一 schema（console re-export 自 contracts）——前端构建的产物必过后端先验
    expect(CreateResourcesBatchRequestSchema.safeParse(req).success).toBe(true);
  });
});

describe('fleet-step: 状态四档与 i18n 双语', () => {
  test('FLEET_STATUS_KEY 与 contracts RESOURCE_INIT_STATUSES 一一对应（不多不少）', () => {
    expect(Object.keys(FLEET_STATUS_KEY).sort()).toEqual(
      [...RESOURCE_INIT_STATUSES].sort(),
    );
  });

  test('gate.fleet.* 与 gate.step.fleet 全部键 zh/en 双语齐全', () => {
    const keys = [
      'gate.step.fleet',
      'gate.fleet.desc',
      'gate.fleet.hasFleet',
      'gate.fleet.colName',
      'gate.fleet.colTarget',
      'gate.fleet.colSeason',
      'gate.fleet.colVersion',
      'gate.fleet.colStatus',
      'gate.fleet.namePlaceholder',
      'gate.fleet.addRow',
      'gate.fleet.removeRow',
      'gate.fleet.submit',
      'gate.fleet.submitting',
      'gate.fleet.created',
      'gate.fleet.next',
      'gate.fleet.skip',
      'gate.fleet.error',
      ...Object.values(FLEET_STATUS_KEY),
    ] as const;
    for (const key of keys) {
      expect(translations.zh[key]).toBeTruthy();
      expect(translations.en[key]).toBeTruthy();
    }
    // 四档语义锚点：能用/在修/退役/停用
    expect(translations.zh[FLEET_STATUS_KEY.available]).toBe('能用');
    expect(translations.zh[FLEET_STATUS_KEY.repair]).toBe('在修');
    expect(translations.zh[FLEET_STATUS_KEY.retired]).toBe('退役');
    expect(translations.zh[FLEET_STATUS_KEY.down]).toBe('停用');
  });
});
