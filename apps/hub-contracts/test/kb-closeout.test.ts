import { describe, expect, test } from 'vitest';

import {
  ArchiveDocumentSchema,
  ErrorEntrySchema,
  buildCloseoutFromIssue,
  deriveKnowledgeNodeFromIssue,
  kbScenarioFixture,
} from '../src/index.js';
import type { CloseoutOptions, IssueCard } from '../src/index.js';

// U3（KB-CORE）：buildCloseoutFromIssue 纯函数 + deriveKnowledgeNodeFromIssue（结案派生知识节点）。

function openIssue(overrides: Partial<IssueCard> = {}): IssueCard {
  return {
    id: 'iss-live',
    projectId: 'prj-robots',
    title: '舵机抖动',
    rawInput: '云台舵机一直抖',
    normalizedSummary: '云台舵机 PID 参数不当导致抖动',
    symptomSummary: '云台舵机抖动',
    suspectedDirections: ['PID 参数', '供电纹波'],
    suggestedActions: ['调 PID', '看供电'],
    status: 'investigating',
    severity: 'medium',
    tags: ['云台', '舵机'],
    relatedFiles: ['src/gimbal/pid.c'],
    relatedCommits: ['abc1234def'],
    relatedHistoricalIssueIds: [],
    createdAt: '2026-06-13T08:00:00.000Z',
    updatedAt: '2026-06-13T08:00:00.000Z',
    ...overrides,
  };
}

const opts: CloseoutOptions = {
  now: '2026-06-14T03:00:00.000Z',
  errorEntryId: 'err-live-1',
  errorCode: 'DBG-20260614-001',
  generatedBy: 'hybrid',
};

describe('buildCloseoutFromIssue 结案闭环', () => {
  test('成功结案 → 归档/错误表/已归档卡 + 派生知识节点', () => {
    const result = buildCloseoutFromIssue(
      openIssue(),
      [],
      { category: '云台', rootCause: 'PID 比例项过大', resolution: '下调 Kp + 加滤波', prevention: '' },
      opts,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 归档/错误表通过对应 schema
    expect(() => ArchiveDocumentSchema.parse(result.archiveDocument)).not.toThrow();
    expect(() => ErrorEntrySchema.parse(result.errorEntry)).not.toThrow();
    expect(result.updatedIssueCard.status).toBe('archived');

    // I0：归档来源 hybrid，不记人；prevention 空时自动派生
    expect(result.archiveDocument.generatedBy).toBe('hybrid');
    expect(result.errorEntry.prevention.length).toBeGreaterThan(0);

    // 结案派生知识节点（draft，无 id/createdAt，无人维度）
    expect(result.knowledgeNodeDraft.name).toContain('舵机抖动');
    expect(result.knowledgeNodeDraft.parentNodeId).toBeNull();
    expect(result.knowledgeNodeDraft).not.toHaveProperty('id');
    expect(result.knowledgeNodeDraft).not.toHaveProperty('createdAt');
    expect(result.knowledgeNodeDraft.resourceLinks.length).toBeGreaterThan(0);
  });

  test('缺 rootCause → 失败（结案仍需手填根因，可行性 §2）', () => {
    const result = buildCloseoutFromIssue(
      openIssue(),
      [],
      { category: '', rootCause: '', resolution: '随便修了', prevention: '' },
      opts,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.path).toEqual(['rootCause']);
  });

  test('已归档卡 → 拒绝重复结案', () => {
    const result = buildCloseoutFromIssue(
      kbScenarioFixture.issueCards[0], // status archived
      [],
      { category: 'x', rootCause: 'y', resolution: 'z', prevention: '' },
      opts,
    );
    expect(result.ok).toBe(false);
  });

  test('deriveKnowledgeNodeFromIssue：groupId 默认 null（不预设本体 C3）+ resourceLinks 含文件/提交', () => {
    const node = deriveKnowledgeNodeFromIssue({ issue: openIssue() });
    expect(node.groupId).toBeNull();
    const uris = node.resourceLinks.map((l) => l.uri);
    expect(uris.some((u) => u.startsWith('repo://'))).toBe(true);
    expect(uris.some((u) => u.startsWith('git://'))).toBe(true);
    // 指定组时落到该组
    const grouped = deriveKnowledgeNodeFromIssue({ issue: openIssue(), groupId: 'grp-ec' });
    expect(grouped.groupId).toBe('grp-ec');
  });
});
