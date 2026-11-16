import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEAMHUB_UNIFIED_SCHEMA_VERSION, openUnifiedDb } from '../src/store/sqlite-unified.js';
import type { UnifiedDatabase } from '../src/store/sqlite-unified.js';

const NOW = new Date('2026-08-15T01:02:03.000Z');
const START = '2026-09-01T00:00:00.000Z';
const END = '2026-10-01T00:00:00.000Z';

describe('projects 单表持久化', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'teamhub-projects-'));
    dbPath = join(dir, 'teamhub.sqlite');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function initialize(dataMode: 'demo' | 'real' = 'demo'): UnifiedDatabase {
    const database = openUnifiedDb(dbPath);
    database.initialize({ dataMode, identityMode: 'anonymous' }, NOW);
    return database;
  }

  it('SQLite 实现：create → close → reopen → 项目仍在（重启存活）', async () => {
    const database = initialize();
    const result = await database.openStores().gov.createProject({ name: '持久项目', startsAt: START, endsAt: END });
    expect(result.ok).toBe(true);
    database.close();

    const reopened = openUnifiedDb(dbPath);
    try {
      const projects = await reopened.openStores().gov.listProjects();
      expect(projects.some((project) => project.name === '持久项目' && project.startsAt === START && project.endsAt === END)).toBe(true);
    } finally {
      reopened.close();
    }
  });

  it('update 不换 rowid：改动后列表顺序不变', async () => {
    const database = initialize();
    try {
      const store = database.openStores().gov;
      await store.createProject({ name: '第二个项目', startsAt: START });
      const before = (await store.listProjects()).map((project) => project.id);
      const updated = await store.updateProject(before[0]!, { name: '改名后的当前项目', startsAt: START, endsAt: END });
      expect(updated.ok).toBe(true);
      expect((await store.listProjects()).map((project) => project.id)).toEqual(before);
    } finally {
      database.close();
    }
  });

  it('并发/重复 create 同名：恰一条成功，另一条 name-exists', async () => {
    const database = initialize();
    try {
      const store = database.openStores().gov;
      const results = await Promise.all([
        store.createProject({ name: '同名项目', startsAt: START }),
        store.createProject({ name: '同名项目', startsAt: START }),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: 'name-exists' }]);
    } finally {
      database.close();
    }
  });
});

describe('老库升级（不加 user_version）', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'teamhub-projects-migration-'));
    dbPath = join(dir, 'teamhub.sqlite');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function initializeDemo(): Promise<UnifiedDatabase> {
    const database = openUnifiedDb(dbPath);
    database.initialize({ dataMode: 'demo', identityMode: 'anonymous' }, NOW);
    await database.openStores().gov.listProjects();
    return database;
  }

  it('v4 老库打开后 projects 表被创建且 user_version 仍为 4', async () => {
    const database = await initializeDemo();
    const tasksBefore = (await database.openStores().gov.getSnapshot()).tasks;
    database.db.prepare('DROP TABLE projects').run();
    expect(database.db.tableExists('projects')).toBe(false);
    database.close();

    const reopened = openUnifiedDb(dbPath);
    try {
      expect(reopened.db.readUserVersion()).toBe(4);
      const store = reopened.openStores().gov;
      expect(reopened.db.tableExists('projects')).toBe(true);
      expect(reopened.db.readUserVersion()).toBe(TEAMHUB_UNIFIED_SCHEMA_VERSION);
      expect(await store.listProjects()).toHaveLength(1);
      expect((await store.getSnapshot()).tasks).toEqual(tasksBefore);
    } finally {
      reopened.close();
    }
  });

  it('projects 已有行时不覆盖：保留用户改过的 name/日期', async () => {
    const database = await initializeDemo();
    const store = database.openStores().gov;
    const [seed] = await store.listProjects();
    await store.updateProject(seed!.id, { name: '用户命名', startsAt: START, endsAt: END });
    database.close();

    const reopened = openUnifiedDb(dbPath);
    try {
      expect(await reopened.openStores().gov.listProjects()).toEqual([
        expect.objectContaining({ id: seed!.id, name: '用户命名', startsAt: START, endsAt: END }),
      ]);
    } finally {
      reopened.close();
    }
  });

  it('回填行 startsAt/endsAt 均为 null（绝不写 createdAt）', async () => {
    const database = await initializeDemo();
    try {
      const [project] = await database.openStores().gov.listProjects();
      expect(project).toMatchObject({ startsAt: null, endsAt: null });
      expect(project!.startsAt).not.toBe(project!.createdAt);
    } finally {
      database.close();
    }
  });

  it('graduateToReal 后 projects 被清空，重开按 meta 回填 1 行', async () => {
    const database = await initializeDemo();
    database.graduateToReal(NOW);
    expect(database.db.rowCount('projects')).toBe(0);
    database.close();

    const reopened = openUnifiedDb(dbPath);
    try {
      const projects = await reopened.openStores().gov.listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({ id: 'prj-robots', startsAt: null, endsAt: null });
    } finally {
      reopened.close();
    }
  });
});
