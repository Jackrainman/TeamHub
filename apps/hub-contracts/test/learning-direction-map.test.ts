import { describe, expect, test } from 'vitest';
import {
  AI_BOUNDARY_CROSSCUT,
  AiBoundaryCrosscutSchema,
  LearningDirectionEntrySchema,
  LearningSeedGapSchema,
  ROBOTICS_LEARNING_MAP,
  ROBOTICS_LEARNING_SEED_GAPS,
  ROBOTICS_OWNER_GROUP_VALUES,
} from '../src/index.js';

/**
 * 跨工种学习地图静态资产（LEARN-DIRECTION-REDESIGN，product-redefine §5）单测——
 * 不测派生逻辑（那部分在 hub-console/test/direction.test.ts），只测静态资产本身的结构完整性 +
 * I0/红线6 守恒（无 memberId/推荐人维度）。
 */
describe('ROBOTICS_LEARNING_MAP：跨工种学习地图静态资产', () => {
  test('恰好四个 discipline，且与 ROBOTICS_OWNER_GROUP_VALUES 同一份值集（一一对应，不多不少）', () => {
    const disciplines = ROBOTICS_LEARNING_MAP.map((e) => e.discipline).sort();
    expect(disciplines).toEqual([...ROBOTICS_OWNER_GROUP_VALUES].sort());
  });

  test('每条满足 LearningDirectionEntrySchema，crossSkillItems 非空', () => {
    for (const entry of ROBOTICS_LEARNING_MAP) {
      expect(LearningDirectionEntrySchema.safeParse(entry).success).toBe(true);
      expect(entry.crossSkillItems.length).toBeGreaterThan(0);
    }
  });

  test('I0/红线6：序列化后无人维度字段（memberId/displayName/ownerId/assignee）', () => {
    const json = JSON.stringify(ROBOTICS_LEARNING_MAP);
    expect(json).not.toContain('memberId');
    expect(json).not.toContain('displayName');
    expect(json).not.toContain('assignee');
  });
});

describe('AI_BOUNDARY_CROSSCUT：AI 边界横切列（各工种通用，非逐工种发挥）', () => {
  test('满足 schema，summary/example 均非空', () => {
    expect(AiBoundaryCrosscutSchema.safeParse(AI_BOUNDARY_CROSSCUT).success).toBe(true);
  });

  test('是单条通用资源，不是按 discipline 展开的数组（不逐工种编造内容）', () => {
    expect(Array.isArray(AI_BOUNDARY_CROSSCUT)).toBe(false);
  });
});

describe('ROBOTICS_LEARNING_SEED_GAPS：静态种子缺口（sim2real 第一条真实缺口种子）', () => {
  test('含 sim2real 种子，discipline=ec，milestoneRef 指向 baseline 模板里程碑 m-m1', () => {
    const seed = ROBOTICS_LEARNING_SEED_GAPS.find((s) => s.id === 'seed-sim2real');
    expect(seed).toBeDefined();
    expect(seed?.discipline).toBe('ec');
    expect(seed?.milestoneRef).toBe('m-m1');
    expect(seed?.statement).toContain('sim2real');
  });

  test('每条满足 LearningSeedGapSchema', () => {
    for (const seed of ROBOTICS_LEARNING_SEED_GAPS) {
      expect(LearningSeedGapSchema.safeParse(seed).success).toBe(true);
    }
  });

  test('I0/红线6：种子缺口序列化后无人维度字段', () => {
    const json = JSON.stringify(ROBOTICS_LEARNING_SEED_GAPS);
    expect(json).not.toContain('memberId');
    expect(json).not.toContain('displayName');
  });
});
