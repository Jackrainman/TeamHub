import {
  GOVERNANCE_SCENARIO_NOW,
  kbScenarioFixture,
  rankSimilarIssues,
  type IssueCard,
} from '@teamhub/hub-contracts';
import {
  KbSimilarResponseSchema,
  type KbSimilarParams,
  type KbSimilarResponse,
} from '../schemas/kb';

/**
 * Mock 相似检索：前端本地用与后端**同一个纯函数** rankSimilarIssues 跑锚点语料
 * （CAN 丢包 / 3508 过热 / MicroROS 握手超时），让 Mock 模式无需后端即可演示
 * 「症状 → 跨赛季同类 bug 召回」。note 与后端 A4 措辞保持一致（只列候选、不断言同因）。
 */
const MOCK_KB_NOTE =
  '下面是几条相似的历史记录，按匹配程度排序。系统只给候选、不断言「就是同一个原因」，每条的 reasons 写了为什么像，合不合用你自己判断。';

export function mockKbSimilar(params: KbSimilarParams): KbSimilarResponse {
  const { symptom } = params;
  const tags = params.tags ?? [];
  const now = GOVERNANCE_SCENARIO_NOW;
  // 用症状构造一张「当前问题卡」喂排序纯函数（与 hub-server 路由同口径）。
  const currentIssue: IssueCard = {
    id: 'iss-probe',
    projectId: kbScenarioFixture.projectId,
    title: symptom,
    rawInput: symptom,
    normalizedSummary: symptom,
    symptomSummary: symptom,
    suspectedDirections: [],
    suggestedActions: [],
    status: 'open',
    severity: 'medium',
    tags,
    relatedFiles: [],
    relatedCommits: [],
    relatedHistoricalIssueIds: [],
    createdAt: now,
    updatedAt: now,
  };
  const items = rankSimilarIssues({
    currentIssue,
    issues: kbScenarioFixture.issueCards,
    errorEntries: kbScenarioFixture.errorEntries,
    archives: kbScenarioFixture.archiveDocuments,
    limit: params.limit,
    minScore: params.minScore,
  });
  return KbSimilarResponseSchema.parse({
    query: { symptom, tags },
    items,
    note: MOCK_KB_NOTE,
  });
}
