import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileGovStore } from '../src/store/file-gov-store.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';
import { SqliteGovStore } from '../src/store/sqlite-gov-store.js';

// setMemberRole（K1 权限地基持久层 + 余项⑥ nit③ TOCTOU 修复）：role 枚举位就地改 members[idx]，落
// governance.json、重启不丢；结果走 SetMemberRoleResult 判别联合（ok / not-found / last-superadmin）。
// guardLastSuperAdmin 开启时降级保护收进 store 同一临界区（判与写不分离）。三实现（mock/file/sqlite）
// 同语义。**I0**：只改一个枚举位，绝不做按人聚合/排行。

describe('GovStore.setMemberRole', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  test('InMemory：命中 → ok+role 落库、updatedBy=console；未知 id → not-found', async () => {
    const store = new InMemoryGovStore();
    const before = (await store.getSnapshot()).members.find((m) => m.id === 'm-ecB');
    expect(before?.role).toBe('member');

    const updated = await store.setMemberRole('m-ecB', 'superAdmin');
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.member.role).toBe('superAdmin');
      expect(updated.member.updatedBy).toBe('console');
    }

    const snap = await store.getSnapshot();
    expect(snap.members.find((m) => m.id === 'm-ecB')?.role).toBe('superAdmin');

    // 不开 guard：降级无条件写（授权/保护语义由调用方选择）
    const demoted = await store.setMemberRole('m-ecB', 'groupAdmin');
    expect(demoted.ok && demoted.member.role).toBe('groupAdmin');

    const missing = await store.setMemberRole('m-nope', 'superAdmin');
    expect(missing).toEqual({ ok: false, reason: 'not-found' });
  });

  test('InMemory：guardLastSuperAdmin 降级保护（余项⑥ nit③）——摘最后一个 superAdmin 被拦且不落库', async () => {
    const store = new InMemoryGovStore();
    // 造唯一 superAdmin
    await store.setMemberRole('m-ecB', 'superAdmin');

    // guard 拦截：唯一 superAdmin 降级 → last-superadmin，库内 role 不变
    const blocked = await store.setMemberRole('m-ecB', 'member', {
      guardLastSuperAdmin: true,
    });
    expect(blocked).toEqual({ ok: false, reason: 'last-superadmin' });
    expect((await store.getSnapshot()).members.find((m) => m.id === 'm-ecB')?.role).toBe(
      'superAdmin',
    );

    // 有第二个 superAdmin 后，降第一个 → 放行（非最后一个）
    await store.setMemberRole('m-visionA', 'superAdmin');
    const ok = await store.setMemberRole('m-ecB', 'member', { guardLastSuperAdmin: true });
    expect(ok.ok && ok.member.role).toBe('member');

    // guard 不影响无关写：普通成员改角色照常
    const plain = await store.setMemberRole('m-mechC', 'groupAdmin', {
      guardLastSuperAdmin: true,
    });
    expect(plain.ok && plain.member.role).toBe('groupAdmin');

    // guard 下未知 id → not-found（不混淆 409/404 语义）
    const missing = await store.setMemberRole('m-nope', 'member', {
      guardLastSuperAdmin: true,
    });
    expect(missing).toEqual({ ok: false, reason: 'not-found' });
  });

  test('File：role 落盘 governance.json 且重启（新实例）仍在；guard 拦截不落盘', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-role-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);
    await store.setMemberRole('m-visionA', 'superAdmin');

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.members.find((m: { id: string }) => m.id === 'm-visionA').role).toBe('superAdmin');

    const reloaded = await FileGovStore.create(file);
    const snap = await reloaded.getSnapshot();
    expect(snap.members.find((m) => m.id === 'm-visionA')?.role).toBe('superAdmin');

    // guard 拦截（m-visionA 是唯一 superAdmin）→ 不落盘
    const blocked = await reloaded.setMemberRole('m-visionA', 'member', {
      guardLastSuperAdmin: true,
    });
    expect(blocked).toEqual({ ok: false, reason: 'last-superadmin' });
    const onDiskAfter = JSON.parse(await readFile(file, 'utf8'));
    expect(onDiskAfter.members.find((m: { id: string }) => m.id === 'm-visionA').role).toBe(
      'superAdmin',
    );
  });

  test('Sqlite：role 落库且重开仍在；未知 id → not-found；guard 拦截同事务', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-role-sqlite-'));
    const file = join(dir, 'gov.sqlite');
    const store = await SqliteGovStore.create(file);
    expect(await store.setMemberRole('m-nope', 'superAdmin')).toEqual({
      ok: false,
      reason: 'not-found',
    });
    await store.setMemberRole('m-mechC', 'groupAdmin');
    store.close();

    const reopened = await SqliteGovStore.create(file);
    const snap = await reopened.getSnapshot();
    expect(snap.members.find((m) => m.id === 'm-mechC')?.role).toBe('groupAdmin');

    // guard：唯一 superAdmin 降级被拦；放行路径正常
    await reopened.setMemberRole('m-ecB', 'superAdmin');
    const blocked = await reopened.setMemberRole('m-ecB', 'member', {
      guardLastSuperAdmin: true,
    });
    expect(blocked).toEqual({ ok: false, reason: 'last-superadmin' });
    expect(
      (await reopened.getSnapshot()).members.find((m) => m.id === 'm-ecB')?.role,
    ).toBe('superAdmin');
    reopened.close();
  });
});
