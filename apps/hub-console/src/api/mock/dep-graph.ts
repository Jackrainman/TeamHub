import {
  DepGraphSchema,
  GOVERNANCE_SCENARIO_NOW,
  governanceScenarioFixture,
  toDepGraphView,
  type DepGraph,
} from '@teamhub/hub-contracts';

/**
 * Mock DepGraph = 从治理真实场景 fixtures 经派生算法 toDepGraphView() 投影出来，
 * 不是手工硬设状态。所以这页同时验证了归因算法本身（视觉C → blockedIdle 等）。
 */
export const mockDepGraph: DepGraph = DepGraphSchema.parse(
  toDepGraphView(governanceScenarioFixture, GOVERNANCE_SCENARIO_NOW),
);
