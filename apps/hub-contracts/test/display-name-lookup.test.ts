import { describe, expect, test } from 'vitest';
import { lookupMemberByDisplayName } from '../src/index.js';
import type { Member } from '../src/index.js';

// AUTH-LOGIN-USERNAME：displayName = 登录用户名（全名册唯一）。查找三分支——
// none（登录 401 防枚举）/ ok（正常）/ duplicate（数据损坏 → 409 运营信号，不进 401）。
const member = (id: string, displayName: string): Member => ({
  id,
  displayName,
  role: 'member',
  grade: 'freshman',
  groupId: 'grp-ec',
  status: 'idle',
  currentTaskId: null,
  updatedBy: 'console',
  updatedAt: '2026-09-05T00:00:00.000Z',
});

describe('lookupMemberByDisplayName', () => {
  test('无命中 → none', () => {
    expect(lookupMemberByDisplayName([member('m-a', '张三')], '李四')).toEqual({ kind: 'none' });
  });

  test('唯一命中 → ok + 该成员', () => {
    const m = member('m-a', '张三');
    expect(lookupMemberByDisplayName([member('m-b', '李四'), m], '张三')).toEqual({
      kind: 'ok',
      member: m,
    });
  });

  test('重名（历史脏数据）→ duplicate + 命中数', () => {
    const result = lookupMemberByDisplayName(
      [member('m-a', '张三'), member('m-b', '张三'), member('m-c', '李四')],
      '张三',
    );
    expect(result).toEqual({ kind: 'duplicate', count: 2 });
  });

  test('精确匹配：不做 trim / 大小写折叠（输入即事实）', () => {
    const roster = [member('m-a', '张三')];
    expect(lookupMemberByDisplayName(roster, ' 张三')).toEqual({ kind: 'none' });
    expect(lookupMemberByDisplayName(roster, '张三 ')).toEqual({ kind: 'none' });
  });
});
