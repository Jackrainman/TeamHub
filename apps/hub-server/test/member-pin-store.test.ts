import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryGovStore } from './support/inmemory-gov-store.js';
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



  // pinPlaintext 明文副本（刀⑧②，用户拍板的密钥纪律例外）：双写双清 + File 落盘回读。

  test('pinPlaintext 双清 + 防错位：设 hash 不传明文 → 旧副本清；pinHash=null → 两字段皆无', async () => {
    const mem = new InMemoryGovStore();
    await mem.setMemberPin('m-ecB', hashPin('1234'), '1234');
    // 只换 hash 不传明文 → 旧副本一并清（防 hash/明文错位）
    const swapped = await mem.setMemberPin('m-ecB', hashPin('9999'));
    expect(swapped?.pinPlaintext).toBeUndefined();
    // 清除路径 → 双字段皆无
    await mem.setMemberPin('m-ecB', hashPin('1234'), '1234');
    const cleared = await mem.setMemberPin('m-ecB', null);
    expect(cleared?.pinHash).toBeUndefined();
    expect(cleared?.pinPlaintext).toBeUndefined();
    expect('pinPlaintext' in cleared!).toBe(false);
  });
});
