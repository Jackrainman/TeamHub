import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryPmRepository } from './support/inmemory-gov-store.js';

// setMemberRole + setProjectManager（K1 权限地基持久层 + MEMBER-PM-FLAG 公测补强刀②b）：role 枚举位
// （groupAdmin/member 两档，不再承载管理员权限）与 projectManager 旗标（原 superAdmin 的正交化）就地改
// members[idx]，落 governance.json、重启不丢。旗标写口结果走 SetProjectManagerResult 判别联合
// （ok / not-found / last-projectmanager），guardLastProjectManager 开启时降级保护收进 store 同一临界区
// （判与写不分离，照余项⑥ nit③ TOCTOU 修复先例）。三实现（mock/file/sqlite）同语义。**I0**：只改一个
// 枚举位 / 布尔位，绝不做按人聚合/排行。

describe('PmRepository.setMemberRole', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  test('InMemory：命中 → role 落库、updatedBy=console；未知 id → null', async () => {
    const store = new InMemoryPmRepository();
    const before = (await store.getSnapshot()).members.find((m) => m.id === 'm-ecB');
    expect(before?.role).toBe('member');

    const updated = await store.setMemberRole('m-ecB', 'groupAdmin');
    expect(updated?.role).toBe('groupAdmin');
    expect(updated?.updatedBy).toBe('console');

    const snap = await store.getSnapshot();
    expect(snap.members.find((m) => m.id === 'm-ecB')?.role).toBe('groupAdmin');

    // role 不再承载管理员权限：任意两档互换无降级保护
    const demoted = await store.setMemberRole('m-ecB', 'member');
    expect(demoted?.role).toBe('member');

    const missing = await store.setMemberRole('m-nope', 'groupAdmin');
    expect(missing).toBeNull();
  });


});

describe('PmRepository.setProjectManager', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  test('InMemory：授旗/收旗落库、updatedBy=console；未知 id → not-found', async () => {
    const store = new InMemoryPmRepository();
    // fixtures：m-progA 已持旗（demo），m-ecB 未持旗。
    const before = (await store.getSnapshot()).members.find((m) => m.id === 'm-ecB');
    expect(before?.projectManager).toBeUndefined();

    const granted = await store.setProjectManager('m-ecB', true);
    expect(granted.ok).toBe(true);
    if (granted.ok) {
      expect(granted.member.projectManager).toBe(true);
      expect(granted.member.updatedBy).toBe('console');
    }
    expect(
      (await store.getSnapshot()).members.find((m) => m.id === 'm-ecB')?.projectManager,
    ).toBe(true);

    // 不开 guard：收旗无条件写（授权/保护语义由调用方选择）
    const revoked = await store.setProjectManager('m-ecB', false);
    expect(revoked.ok && revoked.member.projectManager).toBe(false);

    const missing = await store.setProjectManager('m-nope', true);
    expect(missing).toEqual({ ok: false, reason: 'not-found' });
  });

  test('InMemory：guardLastProjectManager 降级保护——摘最后一个持旗成员被拦且不落库', async () => {
    const store = new InMemoryPmRepository();
    // fixtures 唯一持旗成员 = m-progA。

    // guard 拦截：唯一持旗成员收旗 → last-projectmanager，库内旗标不变
    const blocked = await store.setProjectManager('m-progA', false, {
      guardLastProjectManager: true,
    });
    expect(blocked).toEqual({ ok: false, reason: 'last-projectmanager' });
    expect((await store.getSnapshot()).members.find((m) => m.id === 'm-progA')?.projectManager).toBe(
      true,
    );

    // 有第二个持旗成员后，收第一个 → 放行（非最后一个）
    await store.setProjectManager('m-visionA', true);
    const ok = await store.setProjectManager('m-progA', false, {
      guardLastProjectManager: true,
    });
    expect(ok.ok && ok.member.projectManager).toBe(false);

    // guard 不影响无关写：普通成员改角色照常
    const plain = await store.setMemberRole('m-mechC', 'groupAdmin');
    expect(plain?.role).toBe('groupAdmin');

    // guard 下未知 id → not-found（不混淆 409/404 语义）
    const missing = await store.setProjectManager('m-nope', false, {
      guardLastProjectManager: true,
    });
    expect(missing).toEqual({ ok: false, reason: 'not-found' });
  });


});
