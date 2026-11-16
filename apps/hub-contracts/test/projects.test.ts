import { describe, expect, test } from 'vitest';
import {
  CreateProjectRequestSchema,
  ProjectResponseSchema,
  ProjectSchema,
  ProjectsResponseSchema,
  UpdateProjectRequestSchema,
} from '../src/index.js';

const baseProject = {
  id: 'prj-robots',
  seasonId: 'season-2026',
  name: 'Robots',
  status: 'active' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
};
const startsAt = '2026-09-01T00:00:00.000Z';
const endsAt = '2026-10-01T00:00:00.000Z';

describe('Project 起止日期契约（P3a）', () => {
  test('旧形状（无 startsAt/endsAt）仍能 parse：两字段为 undefined', () => {
    const project = ProjectSchema.parse(baseProject);
    expect(project.startsAt).toBeUndefined();
    expect(project.endsAt).toBeUndefined();
  });

  test('startsAt/endsAt 可为 null（显式未定/至今）', () => {
    expect(ProjectSchema.parse({ ...baseProject, startsAt: null, endsAt: null })).toMatchObject({
      startsAt: null,
      endsAt: null,
    });
  });

  test("endsAt 早于 startsAt → parse 失败，issue path = ['endsAt']", () => {
    const result = ProjectSchema.safeParse({ ...baseProject, startsAt: endsAt, endsAt: startsAt });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['endsAt']);
  });

  test('endsAt 等于 startsAt 允许（按「不得早于」字面，不套用 Season 的严格 >）', () => {
    expect(ProjectSchema.parse({ ...baseProject, startsAt, endsAt: startsAt }).endsAt).toBe(startsAt);
  });

  test('只有一端为 null 时不做顺序校验', () => {
    expect(ProjectSchema.parse({ ...baseProject, startsAt, endsAt: null }).startsAt).toBe(startsAt);
    expect(ProjectSchema.parse({ ...baseProject, startsAt: null, endsAt }).endsAt).toBe(endsAt);
  });
});

describe('CreateProjectRequestSchema', () => {
  test('name 必填、startsAt 必填；endsAt 缺省/ null 均可', () => {
    expect(CreateProjectRequestSchema.safeParse({ startsAt }).success).toBe(false);
    expect(CreateProjectRequestSchema.safeParse({ name: 'Project' }).success).toBe(false);
    expect(CreateProjectRequestSchema.parse({ name: 'Project', startsAt }).endsAt).toBeUndefined();
    expect(CreateProjectRequestSchema.parse({ name: 'Project', startsAt, endsAt: null }).endsAt).toBeNull();
  });

  test('endsAt 早于 startsAt 拒绝；合法 body parse 后保留 seasonId?', () => {
    expect(CreateProjectRequestSchema.safeParse({ name: 'Project', startsAt: endsAt, endsAt: startsAt }).success).toBe(false);
    expect(CreateProjectRequestSchema.parse({ name: 'Project', startsAt, endsAt, seasonId: 'season-2027' }).seasonId).toBe('season-2027');
  });
});

describe('UpdateProjectRequestSchema', () => {
  test('空补丁 {} 拒绝', () => {
    expect(UpdateProjectRequestSchema.safeParse({}).success).toBe(false);
  });

  test('endsAt: null 合法（清除结束日）', () => {
    expect(UpdateProjectRequestSchema.parse({ endsAt: null }).endsAt).toBeNull();
  });

  test('同补丁内两端倒置拒绝', () => {
    expect(UpdateProjectRequestSchema.safeParse({ startsAt: endsAt, endsAt: startsAt }).success).toBe(false);
  });
});

describe('ProjectsResponseSchema / ProjectResponseSchema', () => {
  test('往返 parse 保留新字段；响应包形状分别为 {projects}/{project}', () => {
    const project = { ...baseProject, startsAt, endsAt };
    expect(ProjectsResponseSchema.parse({ projects: [project] })).toEqual({ projects: [project] });
    expect(ProjectResponseSchema.parse({ project })).toEqual({ project });
  });
});
