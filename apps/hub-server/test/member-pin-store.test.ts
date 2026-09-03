import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryPmRepository } from './support/inmemory-gov-store.js';
import { hashPin, verifyPin } from '../src/identity/pin.js';
import { SqliteDatabase } from '../src/store/sqlite-db.js';
import { SqlitePmRepository } from '../src/modules/pm/sqlite-repository.js';

// setMemberPin（IDENTITY-LITE 持久层）：pinHash 就地改 members[idx]，落库重启不丢；未知 id → null；
// **密钥纪律（AUTH-GATE 2026-09-04，撤销刀⑧②明文副本例外）**：只存 scrypt 散列，绝不回存明文；
// 旧库残留的 pinPlaintext 键由 SqlitePmRepository 启动清扫剥掉。

describe('PmRepository.setMemberPin', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('InMemory：命中 → pinHash 落库，未知 id → null；响应对象不含明文副本键', async () => {
    const store = new InMemoryPmRepository();
    const hash = hashPin('1234abcd');
    const updated = await store.setMemberPin('m-visionA', hash);
    expect(updated).not.toBeNull();
    expect(updated?.pinHash).toBe(hash);
    expect('pinPlaintext' in (updated as object)).toBe(false);

    const snap = await store.getSnapshot();
    const m = snap.members.find((x) => x.id === 'm-visionA');
    expect(m?.pinHash).toBe(hash);
    expect(verifyPin('1234abcd', m!.pinHash!)).toBe(true);

    expect(await store.setMemberPin('m-does-not-exist', hash)).toBeNull();
  });

  test('清除路径（pinHash=null）：pinHash 移除，成员回未设密码态', async () => {
    const mem = new InMemoryPmRepository();
    await mem.setMemberPin('m-ecB', hashPin('1234abcd'));
    const cleared = await mem.setMemberPin('m-ecB', null);
    expect(cleared?.pinHash).toBeUndefined();
    expect('pinHash' in (cleared as object)).toBe(false);
  });

  test('SQLite 启动清扫：旧库 members 行残留的 pinPlaintext 被剥掉重写', async () => {
    dir = await mkdtemp(join(tmpdir(), 'teamhub-pin-scrub-'));
    const dbPath = join(dir, 'teamhub.sqlite');
    const sdb = SqliteDatabase.open(dbPath);
    sdb.ensureMetaTable();
    // 第一次构造：seed fixtures 落库
    SqlitePmRepository.fromSharedDb(sdb);
    // 模拟旧库残留：直接往行 JSON 里塞 pinPlaintext
    const rows = sdb.allRows<Record<string, unknown>>('members');
    const dirty = { ...rows[0], pinPlaintext: '1234' };
    sdb.updateRow('members', String(rows[0].id), dirty);
    expect('pinPlaintext' in (sdb.allRows<Record<string, unknown>>('members')[0] as object)).toBe(true);
    // 第二次构造（等价进程重启）→ 启动清扫剥掉
    SqlitePmRepository.fromSharedDb(sdb);
    const cleaned = sdb.allRows<Record<string, unknown>>('members');
    for (const row of cleaned) {
      expect('pinPlaintext' in row).toBe(false);
    }
    sdb.close();
  });
});
