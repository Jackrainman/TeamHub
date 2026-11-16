import { describe, expect, test } from 'vitest';
import { ProjectSchema } from '@teamhub/hub-contracts';
import { deriveProjectGroupIds } from '../src/modules/pm/project-groups.js';

const members = [
  { id: 'member-ec', groupId: 'grp-ec' },
  { id: 'member-mech-a', groupId: 'grp-mech' },
  { id: 'member-mech-b', groupId: 'grp-mech' },
];

describe('deriveProjectGroupIds', () => {
  test('returns an empty list without participants', () => {
    expect(deriveProjectGroupIds([], members)).toEqual([]);
  });

  test('resolves one participant group', () => {
    expect(deriveProjectGroupIds(['member-mech-a'], members)).toEqual(['grp-mech']);
  });

  test('keeps first-seen order across groups', () => {
    expect(deriveProjectGroupIds(['member-ec', 'member-mech-a'], members)).toEqual(['grp-ec', 'grp-mech']);
  });

  test('deduplicates participants from the same group', () => {
    expect(deriveProjectGroupIds(['member-mech-a', 'member-mech-b'], members)).toEqual(['grp-mech']);
  });

  test('ignores unknown member ids', () => {
    expect(deriveProjectGroupIds(['member-unknown', 'member-ec'], members)).toEqual(['grp-ec']);
  });

  test('does not mutate participant input', () => {
    const memberIds = ['member-ec', 'member-mech-a'];
    deriveProjectGroupIds(memberIds, members);
    expect(memberIds).toEqual(['member-ec', 'member-mech-a']);
  });
});

describe('legacy project scope fields', () => {
  test('defaults missing groupIds to an empty array', () => {
    const project = ProjectSchema.parse({
      id: 'prj-legacy',
      seasonId: 'season-2026',
      name: 'Legacy project',
      status: 'active',
      createdAt: '2026-08-01T00:00:00.000Z',
    });
    expect(project.groupIds).toEqual([]);
  });
});
