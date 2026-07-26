import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openUnifiedDb, defaultSeeds, TEAMHUB_UNIFIED_SCHEMA_VERSION } from '../src/store/sqlite-unified.js';
import { SqliteDatabase } from '../src/store/sqlite-db.js';

describe('sqlite-unified', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'teamhub-unified-'));
    dbPath = join(dir, 'teamhub.sqlite');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('fresh open seeds all five domains (demo)', () => {
    const stores = openUnifiedDb(dbPath, { seeds: defaultSeeds(true) });
    try {
      expect(stores.gov).toBeDefined();
      expect(stores.kb).toBeDefined();
      expect(stores.inv).toBeDefined();
      expect(stores.baseline).toBeDefined();
      expect(stores.checklist).toBeDefined();
    } finally {
      stores.close();
    }
  });

  it('gov store returns seeded snapshot', async () => {
    const stores = openUnifiedDb(dbPath, { seeds: defaultSeeds(true) });
    try {
      const snap = await stores.gov.getSnapshot();
      expect(snap.tasks.length).toBeGreaterThan(0);
      expect(snap.members.length).toBeGreaterThan(0);
      expect(snap.seasonId).toBeTruthy();
    } finally {
      stores.close();
    }
  });

  it('kb store returns seeded snapshot', async () => {
    const stores = openUnifiedDb(dbPath, { seeds: defaultSeeds(true) });
    try {
      const snap = await stores.kb.getKbSnapshot();
      expect(snap.issueCards.length).toBeGreaterThan(0);
      expect(snap.projectId).toBeTruthy();
    } finally {
      stores.close();
    }
  });

  it('inv store returns seeded snapshot', async () => {
    const stores = openUnifiedDb(dbPath, { seeds: defaultSeeds(true) });
    try {
      const snap = await stores.inv.getInventorySnapshot();
      expect(snap.partTypes.length).toBeGreaterThan(0);
    } finally {
      stores.close();
    }
  });

  it('baseline store returns seeded data', async () => {
    const stores = openUnifiedDb(dbPath, { seeds: defaultSeeds(true) });
    try {
      const b = await stores.baseline.getBaseline('season-robocon-2026');
      expect(b).not.toBeNull();
      expect(b!.milestones.length).toBeGreaterThan(0);
    } finally {
      stores.close();
    }
  });

  it('checklist store returns seeded items', async () => {
    const stores = openUnifiedDb(dbPath, { seeds: defaultSeeds(true) });
    try {
      const items = await stores.checklist.listItems('baseline-season-robocon-2026');
      expect(items.length).toBeGreaterThan(0);
    } finally {
      stores.close();
    }
  });

  it('real mode seeds empty domains', async () => {
    const stores = openUnifiedDb(dbPath, { seeds: defaultSeeds(false) });
    try {
      const snap = await stores.gov.getSnapshot();
      expect(snap.tasks).toHaveLength(0);
      const kbSnap = await stores.kb.getKbSnapshot();
      expect(kbSnap.issueCards).toHaveLength(0);
    } finally {
      stores.close();
    }
  });

  it('persistence across close/reopen', async () => {
    const stores = openUnifiedDb(dbPath, { seeds: defaultSeeds(true) });
    const task = await stores.gov.createTask({
      projectId: 'p',
      title: 'persist-test',
      rawSummary: 'test',
      groupId: 'grp-ec',
      ownerId: null,
      collaboratorIds: [],
      intrinsicComplexity: 'normal',
    });
    stores.close();

    const reopened = openUnifiedDb(dbPath, { seeds: defaultSeeds(true) });
    try {
      const snap = await reopened.gov.getSnapshot();
      expect(snap.tasks.some((t) => t.id === task.id)).toBe(true);
    } finally {
      reopened.close();
    }
  });

  it('cross-domain writes do not corrupt each other', async () => {
    const stores = openUnifiedDb(dbPath, { seeds: defaultSeeds(true) });
    try {
      await stores.gov.createTask({ projectId: 'p', title: 'x', rawSummary: 'x', groupId: 'grp-ec', ownerId: null, collaboratorIds: [], intrinsicComplexity: 'normal' });
      await stores.kb.appendCloseout({
        issueCard: { id: 'iss-test', projectId: 'p', title: 't', rawInput: '', normalizedSummary: '', symptomSummary: '', suspectedDirections: [], suggestedActions: [], status: 'archived', severity: 'medium', tags: [], relatedFiles: [], relatedCommits: [], relatedHistoricalIssueIds: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        errorEntry: { id: 'err-test', projectId: 'p', sourceIssueId: 'iss-test', errorCode: 'DBG-20260101-001', title: 't', category: 'c', symptom: 's', rootCause: 'r', resolution: 'res', prevention: 'p', relatedFiles: [], relatedCommits: [], archiveFilePath: '', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        archiveDocument: { issueId: 'iss-test', projectId: 'p', fileName: 'f.md', filePath: '/f.md', markdownContent: '# x', generatedBy: 'manual', generatedAt: '2026-01-01' },
      });
      const govSnap = await stores.gov.getSnapshot();
      const kbSnap = await stores.kb.getKbSnapshot();
      expect(govSnap.tasks.some((t) => t.title === 'x')).toBe(true);
      expect(kbSnap.issueCards.some((c) => c.id === 'iss-test')).toBe(true);
    } finally {
      stores.close();
    }
  });

  it('fail-closed: user_version too high', () => {
    const sdb = SqliteDatabase.open(dbPath);
    sdb.ensureMetaTable();
    sdb.setMeta('schema_kind', 'unified');
    sdb.setUserVersion(TEAMHUB_UNIFIED_SCHEMA_VERSION + 1);
    sdb.close();

    expect(() => openUnifiedDb(dbPath)).toThrow(/高于本代码支持/);
  });

  it('fail-closed: legacy gov-only DB (no schema_kind)', () => {
    const sdb = SqliteDatabase.open(dbPath);
    sdb.ensureMetaTable();
    sdb.setUserVersion(1);
    sdb.close();

    expect(() => openUnifiedDb(dbPath)).toThrow(/旧版 gov-only/);
  });
});
