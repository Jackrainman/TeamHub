import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileGovStore } from '../src/store/file-gov-store.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';
import { SqliteGovStore } from '../src/store/sqlite-gov-store.js';

// setMemberRole（K1 权限地基持久层）：role 枚举位就地改 members[idx]，落 governance.json、重启不丢；
// 未知 id → null；updatedBy 钉 console。三实现（mock/file/sqlite）同语义，照 setMemberGateReviewer 形状。
// **I0**：只改一个枚举位，绝不做按人聚合/排行。

describe('GovStore.setMemberRole', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  test('InMemory：命中 → role 落库、updatedBy=console；未知 id → null', async () => {
    const store = new InMemoryGovStore();
    const before = (await store.getSnapshot()).members.find((m) => m.id === 'm-ecB');
    expect(before?.role).toBe('member');

    const updated = await store.setMemberRole('m-ecB', 'superAdmin');
    expect(updated?.role).toBe('superAdmin');
    expect(updated?.updatedBy).toBe('console');

    const snap = await store.getSnapshot();
    expect(snap.members.find((m) => m.id === 'm-ecB')?.role).toBe('superAdmin');

    // 降级也落库（store 层无条件写；降级保护在路由层）
    expect((await store.setMemberRole('m-ecB', 'groupAdmin'))?.role).toBe('groupAdmin');
    expect(await store.setMemberRole('m-nope', 'superAdmin')).toBeNull();
  });

  test('File：role 落盘 governance.json 且重启（新实例）仍在', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-role-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);
    await store.setMemberRole('m-visionA', 'superAdmin');

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.members.find((m: { id: string }) => m.id === 'm-visionA').role).toBe('superAdmin');

    const reloaded = await FileGovStore.create(file);
    const snap = await reloaded.getSnapshot();
    expect(snap.members.find((m) => m.id === 'm-visionA')?.role).toBe('superAdmin');
  });

  test('Sqlite：role 落库且重开仍在；未知 id → null', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-role-sqlite-'));
    const file = join(dir, 'gov.sqlite');
    const store = await SqliteGovStore.create(file);
    expect(await store.setMemberRole('m-nope', 'superAdmin')).toBeNull();
    await store.setMemberRole('m-mechC', 'groupAdmin');
    store.close();

    const reopened = await SqliteGovStore.create(file);
    const snap = await reopened.getSnapshot();
    expect(snap.members.find((m) => m.id === 'm-mechC')?.role).toBe('groupAdmin');
    reopened.close();
  });
});
