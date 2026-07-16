import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RosterImportRow } from '@teamhub/hub-contracts';
import { FileGovStore } from '../src/store/file-gov-store.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';
import { SqliteGovStore } from '../src/store/sqlite-gov-store.js';

/**
 * GovStore.importRoster（ROSTER-IMPORT，K8 持久层）：三实现（mock/file/sqlite）同语义——
 * displayName 幂等 upsert + 自动建组 + superAdmin/pinHash 保护 + missingFromSheet（绝不删），
 * members/groups 落 governance.json / SQLite，重启不丢；`member-new-N`/`grp-new-N` id 重开后不撞。
 */

function row(over: Partial<RosterImportRow> & Pick<RosterImportRow, 'displayName' | 'groupName'>): RosterImportRow {
  return {
    grade: 'junior',
    role: 'member',
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

  test('InMemory：自动建组 + 更新既有（superAdmin role 保护、pinHash 不动）+ missingFromSheet', async () => {
    // fixture 既有成员含 m-visionA（视觉A, member）；先手动升一个人为 superAdmin + 设 pinHash 验保护。
    const store = new InMemoryGovStore();
    await store.setMemberRole('m-visionA', 'superAdmin');
    await store.setMemberPin('m-visionA', 'scrypt:aa:bb');

    const outcome = await store.importRoster([
      // 表里把 superAdmin「视觉A」标成组长——role 应保持 superAdmin、pinHash 不动。
      row({ displayName: '视觉A', groupName: '视觉', role: 'groupAdmin', grade: 'senior' }),
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
    expect(vA.role).toBe('superAdmin'); // 保护
    expect(vA.pinHash).toBe('scrypt:aa:bb'); // pinHash 永不动
    expect(vA.grade).toBe('senior'); // 其余字段仍更新
    const xuanchuan = snap.groups.find((g) => g.name === '宣传')!;
    expect(xuanchuan.id).toMatch(/^grp-new-/);
    expect(xuanchuan.kind).toBe('custom');
    // 众成员一个没删。
    expect(snap.members.find((m) => m.displayName === '电控B')).toBeDefined();
  });

  test('File：members + groups 落盘、重启（新实例）仍在；再导入 id 不撞', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-roster-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);
    const before = (await store.getSnapshot()).members.length;

    await store.importRoster([row({ displayName: '导入甲', groupName: '新组X', grade: 'junior' })]);
    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.members.find((m: { displayName: string }) => m.displayName === '导入甲')).toBeDefined();
    expect(onDisk.groups.find((g: { name: string }) => g.name === '新组X')).toBeDefined();

    const reloaded = await FileGovStore.create(file);
    expect((await reloaded.getSnapshot()).members.length).toBe(before + 1);
    // 重开后再导入一人：member-new id 从磁盘既有长度续接、不撞已落盘的那条。
    const out2 = await reloaded.importRoster([row({ displayName: '导入乙', groupName: '新组X' })]);
    expect(out2.created).toEqual(['导入乙']);
    expect(out2.createdGroups).toEqual([]); // 新组X 已存在、不重复建
    const snap = await reloaded.getSnapshot();
    const ids = snap.members.filter((m) => m.id.startsWith('member-new-')).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length); // 无重复 id
  });

  test('Sqlite：批量导入落库且重开仍在；同批同名组只建一次', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-roster-sqlite-'));
    const file = join(dir, 'gov.sqlite');
    const store = await SqliteGovStore.create(file);
    const out = await store.importRoster([
      row({ displayName: '甲', groupName: '同组' }),
      row({ displayName: '乙', groupName: '同组' }), // 同批同名组
    ]);
    expect(out.created).toEqual(['甲', '乙']);
    expect(out.createdGroups).toEqual(['同组']); // 只建一次
    store.close();

    const reopened = await SqliteGovStore.create(file);
    const snap = await reopened.getSnapshot();
    expect(snap.members.filter((m) => ['甲', '乙'].includes(m.displayName))).toHaveLength(2);
    expect(snap.groups.filter((g) => g.name === '同组')).toHaveLength(1);
    // 甲乙同挂新建的「同组」。
    const tongzu = snap.groups.find((g) => g.name === '同组')!;
    expect(snap.members.find((m) => m.displayName === '甲')?.groupId).toBe(tongzu.id);
    reopened.close();
  });
});
