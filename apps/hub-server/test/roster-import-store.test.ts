import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RosterImportRow } from '@teamhub/hub-contracts';
import { InMemoryGovStore } from './support/inmemory-gov-store.js';

/**
 * GovStore.importRoster（ROSTER-IMPORT，K8 持久层）：三实现（mock/file/sqlite）同语义——
 * displayName 幂等 upsert + 自动建组 + pinHash/projectManager 旗标不动 + missingFromSheet（绝不删），
 * members/groups 落 governance.json / SQLite，重启不丢；`member-new-N`/`grp-new-N` id 重开后不撞。
 */

function row(over: Partial<RosterImportRow> & Pick<RosterImportRow, 'displayName' | 'groupName'>): RosterImportRow {
  return {
    grade: 'junior',
    gateReviewer: false,
    gateReviewerAuto: false,
    ...over,
  };
}

describe('GovStore.importRoster', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  test('InMemory：自动建组 + 更新既有（role / pinHash / projectManager 旗标不动）+ missingFromSheet', async () => {
    // fixture 既有成员含 m-visionA（视觉A, member）；先手动授旗 + 设 pinHash 验「导入不洗旗标/凭证/role」。
    const store = new InMemoryGovStore();
    await store.setProjectManager('m-visionA', true);
    await store.setMemberPin('m-visionA', 'scrypt:aa:bb');

    const outcome = await store.importRoster([
      // 重导「视觉A」——刀③ 起行草稿不含 role，库内 role/旗标/pinHash 全不动。
      row({ displayName: '视觉A', groupName: '视觉', grade: 'senior' }),
      // 全新组「宣传」→ 自动建组 + 新成员。
      row({ displayName: '新宣传员', groupName: '宣传', grade: 'freshman', gateReviewer: true, gateReviewerAuto: true }),
    ]);

    expect(outcome.created).toEqual(['新宣传员']);
    expect(outcome.updated).toEqual(['视觉A']);
    expect(outcome.createdGroups).toEqual(['宣传']);
    expect(outcome.autoReviewers).toEqual(['新宣传员']);
    // 库里众多成员没进表 → 全进 missingFromSheet（绝不删）。
    expect(outcome.missingFromSheet).toContain('电控B');
    expect(outcome.missingFromSheet).not.toContain('视觉A');

    const snap = await store.getSnapshot();
    const vA = snap.members.find((m) => m.displayName === '视觉A')!;
    expect(vA.role).toBe('member'); // role 永不动（重导幂等不洗已任命组长，刀③）
    expect(vA.projectManager).toBe(true); // 旗标永不动（导入不洗）
    expect(vA.pinHash).toBe('scrypt:aa:bb'); // pinHash 永不动
    expect(vA.grade).toBe('senior'); // 其余字段仍更新
    const xuanchuan = snap.groups.find((g) => g.name === '宣传')!;
    expect(xuanchuan.id).toMatch(/^grp-new-/);
    expect(xuanchuan.kind).toBe('custom');
    // 众成员一个没删。
    expect(snap.members.find((m) => m.displayName === '电控B')).toBeDefined();
  });



  // 刀④ PROGRAM-GROUP-ABSTRACT：组名命中批前既有的非叶子/哨兵组（fixture 的 grp-program /
  // grp-convergence）→ 该行拒绝进 failed（行号随行指回 CSV 原行），成员不建不改；叶子组正常。
  // InMemory 与 Sqlite 逐字镜像同语义。
  test('刀④：InMemory 拒抽象组（非叶子/哨兵）进 failed；叶子组不受影响', async () => {
    const store = new InMemoryGovStore();
    const outcome = await store.importRoster([
      row({ displayName: '程甲', groupName: '程序', line: 2 }), // grp-program 有子组 → 非叶子
      row({ displayName: '联乙', groupName: '全组联调', line: 3 }), // grp-convergence 哨兵
      row({ displayName: '视丙', groupName: '视觉', line: 4 }), // 叶子组正常
    ]);
    expect(outcome.failed).toHaveLength(2);
    expect(outcome.failed.map((f) => f.line)).toEqual([2, 3]);
    expect(outcome.failed[0].reason).toContain('汇报视角');
    expect(outcome.created).toEqual(['视丙']);
    const snap = await store.getSnapshot();
    expect(snap.members.find((m) => m.displayName === '程甲')).toBeUndefined();
    expect(snap.members.find((m) => m.displayName === '联乙')).toBeUndefined();
    expect(snap.members.find((m) => m.displayName === '视丙')?.groupId).toBe('grp-vision');
  });

});
