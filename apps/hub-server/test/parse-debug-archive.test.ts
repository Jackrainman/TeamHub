import { describe, expect, test } from 'vitest';
import {
  buildCloseoutFromIssue,
  rankSimilarIssues,
} from '@teamhub/hub-contracts';
import type { IssueCard } from '@teamhub/hub-contracts';
import {
  fileNameToSlug,
  parseDebugArchive,
  splitFrontmatter,
  toIsoDateTime,
} from '../src/import/parse-debug-archive.js';
import { deriveErrorCode } from '../src/kb/error-code.js';

// 代表性样本（覆盖归档目录四种真实形态），保持单测 hermetic（不依赖机器上的 .debug-archive 路径）。

const FRONTMATTER_RESOLVED = `---
date: 2026-05-15 01:40
symptom: 串口只能进一次回调，vTaskDelay只工作一次
project: STM32 HAL + FreeRTOS
relatedCommits: []
relatedFiles: []
status: resolved
---

# 检查清单：STM32 HAL + FreeRTOS 经典初始化陷阱

**症状**：UART IDLE 回调只触发一次

## 实际根因与修复

### 问题1：UART IDLE回调只触发一次 [优先级：高]

**根因**：缺少 IDLE 标志的主动查询和清除逻辑。HAL_UART_IRQHandler 不会自动处理 IDLE 中断。

**修复代码**：
\`\`\`c
__HAL_UART_CLEAR_IDLEFLAG(&huart5);
\`\`\`
`;

const FRONTMATTER_MULTIBUG = `---
date: 2026-05-12 21:10
symptom: 项目历史Bug归档
project: STM32G4嵌入式机器人控制系统 (2026R2)
relatedCommits: ["c7b077e", "732f31b", "6133772"]
relatedFiles: ["User/Bsp/can_list/can_list.c", "User/Application/Src/microros_ctrl.c"]
status: archived
---

# 2026R2 历史Bug归档清单

## 一、CAN通信类问题

### 1. 底盘电机失控（FDCAN FIFO溢出导致HardFault） [优先级：高] [已修复]

**症状**: 底盘有时不受控制，电机像被开环控制

**根因分析** (commit 732f31b): 当CAN消息接收队列满时，FIFO中断中直接return，导致FDCAN FIFO持续占满

**修复方案**: 在直接return的逻辑前添加FIFO排空
`;

const NO_FRONTMATTER_CHECKLIST = `# 检查清单：main_ctrl 查表重构 + 夹爪自动化优化

**改动范围**：\`main_ctrl.c\`, \`catch_rod.c\`, \`chassis.c\`
**生成时间**：2026-05-12 13:45

## 检查项

1. **按键注册查表法正确性** [优先级：高]
`;

const NO_FRONTMATTER_BUGDB = `# STM32机器人固件 Debug Checklist

> 自动生成于 2026-05-12

## 一、历史Bug修复记录

| 提交ID | 提交信息 | 根本原因 |
|--------|----------|----------|
| \`06e013f\` | fix defer Damiao | 电机在初始化阶段使能 |
| \`703ef83\` | bug fix | FreeRTOS堆不足(16KB→32KB) |
`;

describe('splitFrontmatter', () => {
  test('有 frontmatter：抽出标量 + 数组 + body', () => {
    const fm = splitFrontmatter(FRONTMATTER_MULTIBUG);
    expect(fm.fields.symptom).toBe('项目历史Bug归档');
    expect(fm.fields.status).toBe('archived');
    expect(fm.arrays.relatedCommits).toEqual(['c7b077e', '732f31b', '6133772']);
    expect(fm.arrays.relatedFiles).toHaveLength(2);
    expect(fm.body).toContain('# 2026R2 历史Bug归档清单');
    expect(fm.body).not.toContain('symptom:');
  });

  test('无 frontmatter：fields/arrays 空，body 原样', () => {
    const fm = splitFrontmatter(NO_FRONTMATTER_CHECKLIST);
    expect(fm.fields).toEqual({});
    expect(fm.arrays).toEqual({});
    expect(fm.body).toContain('# 检查清单：main_ctrl');
  });
});

describe('toIsoDateTime', () => {
  test('日期+时间 → 带 Z 的 ISO', () => {
    expect(toIsoDateTime('2026-05-15 01:40')).toBe('2026-05-15T01:40:00.000Z');
  });
  test('仅日期 → 00:00', () => {
    expect(toIsoDateTime('2026-05-12')).toBe('2026-05-12T00:00:00.000Z');
  });
  test('非法/空 → null', () => {
    expect(toIsoDateTime('2026-13-99')).toBeNull();
    expect(toIsoDateTime(undefined)).toBeNull();
    expect(toIsoDateTime('not a date')).toBeNull();
  });
  test('范围内但不存在的日历日 → null（让 deriveDate 回退兜底，不产非法 ISO）', () => {
    expect(toIsoDateTime('2026-02-30')).toBeNull(); // 2 月没有 30 日
    expect(toIsoDateTime('2026-04-31')).toBeNull(); // 4 月没有 31 日
    expect(toIsoDateTime('2025-02-29')).toBeNull(); // 非闰年没有 2/29
    expect(toIsoDateTime('2026-13-01')).toBeNull();
    expect(toIsoDateTime('2026-01-01 25:00')).toBeNull(); // 小时越界
  });
  test('合法边界日历日 → 有效 ISO', () => {
    expect(toIsoDateTime('2026-02-28')).toBe('2026-02-28T00:00:00.000Z');
    expect(toIsoDateTime('2024-02-29')).toBe('2024-02-29T00:00:00.000Z'); // 闰年
    expect(toIsoDateTime('2026-12-31')).toBe('2026-12-31T00:00:00.000Z');
  });
});

describe('fileNameToSlug', () => {
  test('ascii 文件名 → 可读前缀 + 哈希后缀', () => {
    const slug = fileNameToSlug('2026-05-15-uart-idle-systick-heap.md');
    expect(slug).toMatch(/^2026-05-15-uart-idle-systick-heap-[a-z0-9]{1,6}$/);
  });
  test('纯中文文件名 → 确定性、可 slug', () => {
    const a = fileNameToSlug('26R2历史Bug归档清单.md');
    const b = fileNameToSlug('26R2历史Bug归档清单.md');
    expect(a).toBe(b); // 确定性
    expect(a).toMatch(/^[a-z0-9-]+$/); // 可作归档文件名
    expect(a.length).toBeGreaterThanOrEqual(3);
  });
  test('不同中文名 → 不同 slug（不撞）', () => {
    expect(fileNameToSlug('甲.md')).not.toBe(fileNameToSlug('乙.md'));
  });
  // 对抗审计 confirmed：旧算法 ascii≥3 直接返回前缀，下列真实风格文件名会撞 slug → issueId 撞 → 静默丢档
  test('ascii 前缀同、差异在中文 → 不撞（哈希后缀消歧）', () => {
    expect(fileNameToSlug('CAN问题归档甲.md')).not.toBe(
      fileNameToSlug('CAN问题归档乙.md'),
    );
    expect(fileNameToSlug('26R2历史Bug归档-CAN甲.md')).not.toBe(
      fileNameToSlug('26R2历史Bug归档-CAN乙.md'),
    );
  });
  test('>40 字符共同 ascii 前缀（截断区不同）→ 不撞', () => {
    const a = fileNameToSlug(
      '2026R2-historical-bug-archive-checklist-for-chassis-motor.md',
    );
    const b = fileNameToSlug(
      '2026R2-historical-bug-archive-checklist-for-chassis-arm.md',
    );
    expect(a).not.toBe(b);
  });
  test('标点折叠（a_b vs a-b）→ 不撞', () => {
    expect(fileNameToSlug('can_loss.md')).not.toBe(fileNameToSlug('can-loss.md'));
  });
});

describe('parseDebugArchive — frontmatter resolved', () => {
  const res = parseDebugArchive(FRONTMATTER_RESOLVED, '2026-05-15-uart-idle.md')!;
  test('非空', () => expect(res).not.toBeNull());
  test('历史日期取 frontmatter（非兜底）', () => {
    expect(res.parsed.historicalNow).toBe('2026-05-15T01:40:00.000Z');
    expect(res.warnings).not.toContain('无可解析日期，落兜底 2026-05-12T00:00:00.000Z');
  });
  test('标题剥「检查清单：」前缀', () => {
    expect(res.parsed.title).toBe('STM32 HAL + FreeRTOS 经典初始化陷阱');
  });
  test('症状取 frontmatter symptom', () => {
    expect(res.parsed.symptom).toContain('串口只能进一次回调');
  });
  test('词表标签命中子系统', () => {
    expect(res.parsed.tags).toEqual(
      expect.arrayContaining(['串口', 'IDLE', 'FreeRTOS']),
    );
  });
  test('抽到根因段（关键词富集，非兜底）', () => {
    expect(res.parsed.rootCause).toContain('IDLE');
    expect(res.warnings).not.toContain('未抽到根因段，用指向性兜底文案');
  });
});

describe('parseDebugArchive — frontmatter multibug', () => {
  const res = parseDebugArchive(FRONTMATTER_MULTIBUG, '26R2历史Bug归档清单.md')!;
  test('relatedCommits/Files 取 frontmatter 数组', () => {
    expect(res.parsed.relatedCommits).toEqual(['c7b077e', '732f31b', '6133772']);
    expect(res.parsed.relatedFiles).toContain('User/Bsp/can_list/can_list.c');
  });
  test('标签含 CAN/MicroROS/电机', () => {
    expect(res.parsed.tags).toEqual(
      expect.arrayContaining(['CAN', 'MicroROS', '电机']),
    );
  });
  test('severity=high（含 HardFault/失控）', () => {
    expect(res.parsed.severity).toBe('high');
  });
  test('中文文件名 → ascii slug 可用', () => {
    expect(res.parsed.slug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('parseDebugArchive — 无 frontmatter', () => {
  test('checklist：日期取「生成时间」、标题剥前缀、无日期兜底未触发', () => {
    const res = parseDebugArchive(NO_FRONTMATTER_CHECKLIST, 'debug-checklist-2026-05-12.md')!;
    // 文件名日期前缀优先于正文「生成时间」，两者一致
    expect(res.parsed.historicalNow.startsWith('2026-05-12')).toBe(true);
    expect(res.parsed.title).toBe('main_ctrl 查表重构 + 夹爪自动化优化');
    expect(res.parsed.tags).toEqual(expect.arrayContaining(['夹爪', '底盘']));
  });
  test('bugDB：无文件名日期 → 取正文「自动生成于」', () => {
    const res = parseDebugArchive(NO_FRONTMATTER_BUGDB, 'debug_checklist.md')!;
    expect(res.parsed.historicalNow).toBe('2026-05-12T00:00:00.000Z');
    expect(res.warnings).not.toContain('无可解析日期，落兜底 2026-05-12T00:00:00.000Z');
    expect(res.parsed.relatedCommits).toEqual(
      expect.arrayContaining(['06e013f', '703ef83']),
    );
    expect(res.parsed.tags).toContain('FreeRTOS');
  });
});

describe('extractSection — 段内续行不再硬插 `；`（nit②）', () => {
  // 单段多续行：段内续行用空格接、不插 `；`；两个独立根因 marker 段之间才用 `；`。
  const MULTILINE = `# 多行根因归档

**根因**：FDCAN FIFO 在高负载下
持续溢出导致丢帧
最终触发失控

## 根因补充
中断优先级配置错误
`;
  const res = parseDebugArchive(MULTILINE, 'multiline-root.md')!;

  test('同段续行用空格接、不被 `；` 切成伪分句', () => {
    expect(res.parsed.rootCause).toContain('持续溢出导致丢帧');
    expect(res.parsed.rootCause).toContain(
      'FDCAN FIFO 在高负载下 持续溢出导致丢帧 最终触发失控',
    );
  });
  test('两个独立根因段之间仍用 `；` 分隔（段内仍空格接）', () => {
    // 段1 收尾「最终触发失控」→ `；` → 段2（`## 根因补充` 余「补充」+ 续行空格接）
    expect(res.parsed.rootCause).toContain('最终触发失控；补充 中断优先级配置错误');
  });
});

describe('parseDebugArchive — 边界', () => {
  test('空 body → null', () => {
    expect(parseDebugArchive('---\nstatus: x\n---\n', 'empty.md')).toBeNull();
    expect(parseDebugArchive('   \n  ', 'blank.md')).toBeNull();
  });
  test('无根因/修复段 → 指向性兜底 + warning（不静默）', () => {
    const res = parseDebugArchive('# 只有标题的归档\n\n一些没有结构的描述文字。', 'x.md')!;
    expect(res.parsed.rootCause).toContain('归档正文');
    expect(res.warnings).toContain('未抽到根因段，用指向性兜底文案');
  });
});

describe('parse → closeout → recall 端到端（纯函数）', () => {
  test('导入的卡可被同症状检索召回，且 errorCode 用历史日期', () => {
    const res = parseDebugArchive(FRONTMATTER_MULTIBUG, '26R2历史Bug归档清单.md')!;
    const issueId = `iss-pf-${res.parsed.slug}`;
    const p = res.parsed;
    const inputCard: IssueCard = {
      id: issueId,
      projectId: 'prj-robots',
      title: p.title,
      rawInput: p.rawInput,
      normalizedSummary: p.symptom,
      symptomSummary: p.symptom,
      suspectedDirections: [],
      suggestedActions: [],
      status: 'resolved',
      severity: p.severity,
      tags: p.tags,
      relatedFiles: p.relatedFiles,
      relatedCommits: p.relatedCommits,
      relatedHistoricalIssueIds: [],
      createdAt: p.historicalNow,
      updatedAt: p.historicalNow,
    };
    const errorCode = deriveErrorCode(p.historicalNow, issueId);
    const closeout = buildCloseoutFromIssue(
      inputCard,
      [],
      {
        category: p.category,
        rootCause: p.rootCause,
        resolution: p.resolution,
        prevention: p.prevention,
      },
      { now: p.historicalNow, errorEntryId: `err-${issueId}`, errorCode, generatedBy: 'hybrid' },
    );
    expect(closeout.ok).toBe(true);
    if (!closeout.ok) return;

    // 历史时戳：errorCode 日期段 = 归档当年（2026-05-12），归档文件名同
    expect(closeout.errorEntry.errorCode).toBe(errorCode);
    expect(errorCode).toMatch(/^DBG-20260512-\d{3}$/);
    expect(closeout.archiveDocument.fileName.startsWith('2026-05-12_')).toBe(true);
    expect(closeout.updatedIssueCard.status).toBe('archived');

    // 召回：用「CAN 电机失控」症状查，命中刚导入的卡
    const query: IssueCard = {
      ...inputCard,
      id: 'iss-query',
      title: 'CAN 电机失控',
      rawInput: 'CAN 总线电机失控',
      normalizedSummary: 'CAN 电机失控',
      symptomSummary: 'CAN 电机失控',
      tags: ['CAN', '电机'],
      status: 'open',
    };
    const matches = rankSimilarIssues({
      currentIssue: query,
      issues: [closeout.updatedIssueCard],
      errorEntries: [closeout.errorEntry],
      archives: [closeout.archiveDocument],
    });
    expect(matches.some((m) => m.issueId === issueId)).toBe(true);
    const hit = matches.find((m) => m.issueId === issueId)!;
    expect(hit.errorCode).toBe(errorCode);
    expect(hit.matchedTags).toEqual(expect.arrayContaining(['CAN', '电机']));
  });
});
