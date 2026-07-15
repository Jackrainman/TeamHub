import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileGovStore } from '../src/store/file-gov-store.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

// setMemberGateReviewer（GATE-CHECKLIST-IOU 验收人名单持久层，D-087 拍板②）：gateReviewer 布尔位就地改
// members[idx]，落 governance.json、重启不丢；未知 id → null；updatedBy 钉 console。**I0**：资格布尔而已，
// 绝不做按人聚合/排行（本域读方法从不提供按 gateReviewer 分组统计）。

describe('GovStore.setMemberGateReviewer', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('InMemory：命中 → gateReviewer 落库、updatedBy=console；未知 id → null', async () => {
    const store = new InMemoryGovStore();
    const updated = await store.setMemberGateReviewer('m-visionA', true);
    expect(updated).not.toBeNull();
    expect(updated?.gateReviewer).toBe(true);
    expect(updated?.updatedBy).toBe('console');

    const snap = await store.getSnapshot();
    const m = snap.members.find((x) => x.id === 'm-visionA');
    expect(m?.gateReviewer).toBe(true);

    // 撤销资格（换届更新）：false 也落库
    const revoked = await store.setMemberGateReviewer('m-visionA', false);
    expect(revoked?.gateReviewer).toBe(false);

    expect(await store.setMemberGateReviewer('m-does-not-exist', true)).toBeNull();
  });

  test('File：gateReviewer 落盘 governance.json 且重启（新实例）仍在', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-gate-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);
    await store.setMemberGateReviewer('m-ecB', true);

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    const persisted = onDisk.members.find((m: { id: string }) => m.id === 'm-ecB');
    expect(persisted.gateReviewer).toBe(true);

    // 模拟重启：新实例从同文件加载，gateReviewer 仍在
    const reloaded = await FileGovStore.create(file);
    const snap = await reloaded.getSnapshot();
    const m = snap.members.find((x) => x.id === 'm-ecB');
    expect(m?.gateReviewer).toBe(true);
  });
});
