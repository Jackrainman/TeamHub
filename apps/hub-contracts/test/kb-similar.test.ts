import { describe, expect, test } from 'vitest';

import {
  SimilarIssueMatchSchema,
  kbScenarioFixture,
  rankSimilarIssues,
} from '../src/index.js';
import type { IssueCard } from '../src/index.js';

// U2（KB-CORE）：rankSimilarIssues 纯函数——跨赛季同类 bug 召回 + A4 护栏（只列候选不断言同因）。

function probeIssue(overrides: Partial<IssueCard>): IssueCard {
  return {
    id: 'iss-current',
    projectId: 'prj-robots',
    title: '',
    rawInput: '',
    normalizedSummary: '',
    symptomSummary: '',
    suspectedDirections: [],
    suggestedActions: [],
    status: 'open',
    severity: 'medium',
    tags: [],
    relatedFiles: [],
    relatedCommits: [],
    relatedHistoricalIssueIds: [],
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('rankSimilarIssues 跨赛季召回', () => {
  test('「3508 电机过热」症状 → 召回历史 3508 烧毁卡为最高分', () => {
    const current = probeIssue({
      title: '3508 又过热了',
      symptomSummary: '3508 电机发烫，怀疑要烧',
      normalizedSummary: '3508 电机长时间运行过热',
      tags: ['电机', '3508', '散热'],
    });
    const matches = rankSimilarIssues({
      currentIssue: current,
      issues: kbScenarioFixture.issueCards,
      errorEntries: kbScenarioFixture.errorEntries,
      archives: kbScenarioFixture.archiveDocuments,
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.issueId).toBe('iss-motor-3508-2025');
    // A4：reasons 是客观重合依据，不是「同因」断言
    expect(matches[0]?.reasons.some((r) => r.includes('重合'))).toBe(true);
  });

  test('CAN 通信症状 → 召回 CAN 历史卡（标签 + 根因术语重合）', () => {
    const current = probeIssue({
      title: '底盘 CAN 又丢报文',
      symptomSummary: 'CAN 总线丢包，底盘电机偶发不响应',
      tags: ['CAN', '通信', '底盘'],
    });
    const matches = rankSimilarIssues({
      currentIssue: current,
      issues: kbScenarioFixture.issueCards,
      errorEntries: kbScenarioFixture.errorEntries,
      archives: kbScenarioFixture.archiveDocuments,
    });
    expect(matches[0]?.issueId).toBe('iss-can-2025');
    expect(matches[0]?.matchedTags).toContain('CAN');
  });

  test('无关症状 → 低于 minScore 不召回（不强行凑结论，A4）', () => {
    const current = probeIssue({
      title: '比赛报名表填写',
      symptomSummary: '报名系统打不开',
      tags: ['行政'],
    });
    const matches = rankSimilarIssues({
      currentIssue: current,
      issues: kbScenarioFixture.issueCards,
      errorEntries: kbScenarioFixture.errorEntries,
      archives: kbScenarioFixture.archiveDocuments,
    });
    expect(matches.length).toBe(0);
  });

  test('每条 match 过 SimilarIssueMatchSchema（路由可直接 parse）', () => {
    const current = probeIssue({
      symptomSummary: '电机过热 CAN 丢包',
      tags: ['电机', 'CAN'],
    });
    const matches = rankSimilarIssues({
      currentIssue: current,
      issues: kbScenarioFixture.issueCards,
      errorEntries: kbScenarioFixture.errorEntries,
      archives: kbScenarioFixture.archiveDocuments,
      minScore: 1,
    });
    for (const m of matches) {
      expect(() => SimilarIssueMatchSchema.parse(m)).not.toThrow();
      expect(m).not.toHaveProperty('memberId');
    }
  });
});
