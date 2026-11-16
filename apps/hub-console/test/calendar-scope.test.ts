import { describe, expect, test } from 'vitest';
import type { Project } from '@teamhub/hub-contracts';
import { filterProjectsByScope } from '../src/features/pm/calendar/model';

function project(id: string, fields: Partial<Project> = {}): Project {
  return {
    id,
    seasonId: 'season-1',
    name: id,
    status: 'active',
    groupIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    startsAt: '2026-11-01T00:00:00.000Z',
    endsAt: null,
    ...fields,
  };
}

const created = project('created', { createdBy: 'member-me', groupIds: ['grp-ec'] });
const joined = project('joined', { memberIds: ['member-me'], groupIds: ['grp-mech'] });
const other = project('other', { createdBy: 'member-other', memberIds: ['member-other'], groupIds: ['grp-vision'] });
const projects = [created, joined, other];

describe('filterProjectsByScope', () => {
  test('个人包含本人创建的项目', () => {
    expect(filterProjectsByScope(projects, 'personal', 'member-me', null).map(item => item.id)).toContain('created');
  });

  test('个人包含本人参与的项目，排除他人项目', () => {
    expect(filterProjectsByScope(projects, 'personal', 'member-me', null).map(item => item.id)).toEqual(['created', 'joined']);
  });

  test('本组按 groupIds 包含当前会话组过滤', () => {
    expect(filterProjectsByScope(projects, 'group', null, 'grp-mech').map(item => item.id)).toEqual(['joined']);
  });

  test('全队保留全部项目', () => {
    expect(filterProjectsByScope(projects, 'team', null, null)).toEqual(projects);
  });

  test('未登录时个人和本组均为空，不退化为全队', () => {
    expect(filterProjectsByScope(projects, 'personal', null, null)).toEqual([]);
    expect(filterProjectsByScope(projects, 'group', null, null)).toEqual([]);
  });
});
