import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileGovStore } from '../src/store/file-gov-store.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';
import { hashPin, verifyPin } from '../src/identity/pin.js';

// setMemberPin（IDENTITY-LITE 持久层）：pinHash 就地改 members[idx]，落 governance.json、重启不丢；
// 未知 id → null；**密钥纪律**：落盘文件里可以有 pinHash（散列，非明文），读视图剥离由路由层负责。

describe('GovStore.setMemberPin', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('InMemory：命中 → pinHash 落库，未知 id → null', async () => {
    const store = new InMemoryGovStore();
    const hash = hashPin('1234');
    const updated = await store.setMemberPin('m-visionA', hash);
    expect(updated).not.toBeNull();
    expect(updated?.pinHash).toBe(hash);

    const snap = await store.getSnapshot();
    const m = snap.members.find((x) => x.id === 'm-visionA');
    expect(m?.pinHash).toBe(hash);
    expect(verifyPin('1234', m!.pinHash!)).toBe(true);

    expect(await store.setMemberPin('m-does-not-exist', hash)).toBeNull();
  });

  test('File：pinHash 落盘 governance.json 且重启（新实例）仍在', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-pin-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);
    const hash = hashPin('4321');
    await store.setMemberPin('m-ecB', hash);

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    const persisted = onDisk.members.find((m: { id: string }) => m.id === 'm-ecB');
    expect(persisted.pinHash).toBe(hash);

    // 模拟重启：新实例从同文件加载，pinHash 仍在、仍可校验
    const reloaded = await FileGovStore.create(file);
    const snap = await reloaded.getSnapshot();
    const m = snap.members.find((x) => x.id === 'm-ecB');
    expect(verifyPin('4321', m!.pinHash!)).toBe(true);
  });

  test('清除（pinHash=null，余项⑦ PIN-RESET）：InMemory 移除字段；File 落盘后重启仍无 pinHash', async () => {
    const mem = new InMemoryGovStore();
    await mem.setMemberPin('m-ecB', hashPin('1234'));
    const cleared = await mem.setMemberPin('m-ecB', null);
    expect(cleared).not.toBeNull();
    expect(cleared?.pinHash).toBeUndefined();
    expect('pinHash' in cleared!).toBe(false);
    expect(
      (await mem.getSnapshot()).members.find((x) => x.id === 'm-ecB')?.pinHash,
    ).toBeUndefined();

    dir = await mkdtemp(join(tmpdir(), 'gov-pin-clear-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);
    await store.setMemberPin('m-ecB', hashPin('4321'));
    await store.setMemberPin('m-ecB', null);
    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.members.find((m: { id: string }) => m.id === 'm-ecB').pinHash).toBeUndefined();

    const reloaded = await FileGovStore.create(file);
    expect(
      (await reloaded.getSnapshot()).members.find((x) => x.id === 'm-ecB')?.pinHash,
    ).toBeUndefined();
  });
});
