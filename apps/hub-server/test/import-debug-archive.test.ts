import { afterEach, describe, expect, test } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runImport } from '../src/import/import-debug-archive.js';
import { FileKbStore } from '../src/store/file-kb-store.js';

/**
 * runImport（导入 CLI 编排）的 IO 健壮性 + 幂等 + 召回闭环测（KB-IMPORT-FOLLOWUP，对抗审计 confirmed 修复）。
 * 纯解析器的字段级测在 parse-debug-archive.test.ts；本文件只测目录遍历 / 读失败 / 跳过 / 重跑等 IO 行为。
 */

const ARCHIVE_MD = `---
date: 2026-05-12 10:00
symptom: CAN 总线丢包电机失控
project: STM32G4 FreeRTOS
status: resolved
---

# CAN 丢包归档

**根因**：FDCAN FIFO 溢出。
**修复方案**：中断里排空 FIFO。
`;

describe('runImport — IO 健壮性 / 幂等', () => {
  let archiveDir = '';
  let dataDir = '';
  afterEach(async () => {
    if (archiveDir) await rm(archiveDir, { recursive: true, force: true });
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  async function setup(): Promise<{ archiveDir: string; dataFile: string }> {
    archiveDir = await mkdtemp(join(tmpdir(), 'pf-archive-'));
    dataDir = await mkdtemp(join(tmpdir(), 'pf-data-'));
    return { archiveDir, dataFile: join(dataDir, 'kb.json') };
  }

  test('名字以 .md 结尾的子目录被跳过、不触 EISDIR 崩整批', async () => {
    const { archiveDir, dataFile } = await setup();
    await writeFile(join(archiveDir, 'real.md'), ARCHIVE_MD, 'utf8');
    await mkdir(join(archiveDir, 'notes.md')); // 名字以 .md 结尾的目录——旧实现会 readFile 抛 EISDIR
    await writeFile(join(archiveDir, 'README.md'), '# readme\n正文', 'utf8');

    const summary = await runImport({ archiveDir, dataFile });
    // 不抛、真实 .md 导入、目录与 README 不在结果里（被 filter 掉）
    expect(summary.imported).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.results.map((r) => r.fileName)).toEqual(['real.md']);
  });

  test('大小写变体 README 被跳过（不污染语料）', async () => {
    const { archiveDir, dataFile } = await setup();
    await writeFile(join(archiveDir, 'real.md'), ARCHIVE_MD, 'utf8');
    await writeFile(join(archiveDir, 'Readme.md'), '# Readme\n正文非空', 'utf8');
    await writeFile(join(archiveDir, 'README.MD'), '# README\n正文非空', 'utf8');

    const summary = await runImport({ archiveDir, dataFile });
    expect(summary.results.map((r) => r.fileName)).toEqual(['real.md']);
  });

  test('两份 ascii 前缀相同、仅中文不同的归档 → 两张独立卡（不静默丢档）', async () => {
    const { archiveDir, dataFile } = await setup();
    await writeFile(join(archiveDir, 'CAN问题归档甲.md'), ARCHIVE_MD, 'utf8');
    await writeFile(join(archiveDir, 'CAN问题归档乙.md'), ARCHIVE_MD, 'utf8');

    const summary = await runImport({ archiveDir, dataFile });
    expect(summary.imported).toBe(2);
    expect(summary.results.filter((r) => r.status === 'skipped-existing')).toHaveLength(0);
    const ids = summary.results.map((r) => r.issueId);
    expect(new Set(ids).size).toBe(2); // 两个不同 issueId
  });

  test('重跑同目录 → 全部 skipped-existing（幂等，不重复追加）', async () => {
    const { archiveDir, dataFile } = await setup();
    await writeFile(join(archiveDir, 'real.md'), ARCHIVE_MD, 'utf8');
    const first = await runImport({ archiveDir, dataFile });
    expect(first.imported).toBe(1);
    const second = await runImport({ archiveDir, dataFile });
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(1);
  });

  test('IMPORT_FORCE 重导 → 三件物按确定主键 upsert、数组不膨胀（nit①）', async () => {
    const { archiveDir, dataFile } = await setup();
    await writeFile(join(archiveDir, 'real.md'), ARCHIVE_MD, 'utf8');

    await runImport({ archiveDir, dataFile });
    const after1 = await (await FileKbStore.create(dataFile)).getKbSnapshot();

    // force=true → 不跳过、重新结案；但 issueId=`iss-pf-<slug>` / errorEntryId=`err-<id>` /
    // archive 按 issueId 全确定，appendCloseoutInto 按主键 upsert → 覆盖既有、长度恒定、不堆重复。
    const forced = await runImport({ archiveDir, dataFile, force: true });
    expect(forced.imported).toBe(1);
    expect(forced.skipped).toBe(0);
    const after2 = await (await FileKbStore.create(dataFile)).getKbSnapshot();

    expect(after2.issueCards).toHaveLength(after1.issueCards.length);
    expect(after2.errorEntries).toHaveLength(after1.errorEntries.length);
    expect(after2.archiveDocuments).toHaveLength(after1.archiveDocuments.length);
  });
});
