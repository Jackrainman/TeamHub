import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { hashPin } from '../../src/identity/pin.js';
import { FixedClock } from '../../src/clock.js';
import { buildHubServer } from '../../src/server.js';
import { openV1Database, type V1Database } from '../../src/store/v1-database.js';
import { SqliteSettingsRepository } from '../../src/modules/system/sqlite-repository.js';

export const TEST_PASSWORDS = {
  admin: 'admin-password', owner: 'owner-password', reviewer: 'reviewer-password',
} as const;
export interface TestHub {
  app: FastifyInstance;
  database: V1Database;
  root: string;
  close: () => Promise<void>;
}
export function createTestHub(now = '2026-11-17T04:00:00.000Z'): TestHub {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamhub-v1-server-'));
  const database = openV1Database(path.join(root, 'teamhub.sqlite'));
  database.initialize({ dataMode: 'real', identityMode: 'identity' }, new Date(now));
  const repository = new SqliteSettingsRepository(database.db);
  const group = repository.createGroup('电路');
  if (!group.ok) throw new Error('fixture group failed');
  repository.importRoster([
    { displayName: 'owner', grade: 'junior', groupName: '电路', gateReviewer: false, gateReviewerAuto: false },
    { displayName: 'reviewer', grade: 'senior', groupName: '电路', gateReviewer: true, gateReviewerAuto: true },
  ]);
  repository.bootstrapAdministrator({ displayName: 'admin', groupName: '电路', grade: 'senior', pinHash: hashPin(TEST_PASSWORDS.admin) });
  for (const [name, password] of [['owner', TEST_PASSWORDS.owner], ['reviewer', TEST_PASSWORDS.reviewer]] as const) {
    const member = repository.listMembers().find(item => item.displayName === name)!;
    repository.setMemberPin(member.id, hashPin(password));
  }
  const evidenceDir = path.join(root, 'evidence');
  process.env.TEAMHUB_EVIDENCE_FILES_DIR = evidenceDir;
  const app = buildHubServer({ database, clock: new FixedClock(new Date(now)) });
  return {
    app, database, root,
    close: async () => {
      await app.close();
      database.close();
      delete process.env.TEAMHUB_EVIDENCE_FILES_DIR;
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
export async function login(app: FastifyInstance, username: string, pin: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/session', payload: { username, pin } });
  if (response.statusCode !== 200) throw new Error(`login failed: ${response.statusCode} ${response.body}`);
  return response.headers['set-cookie']!.toString().split(';')[0];
}
export function memberId(hub: TestHub, displayName: string): string {
  const member = new SqliteSettingsRepository(hub.database.db).listMembers().find(item => item.displayName === displayName);
  if (!member) throw new Error(`missing fixture member ${displayName}`);
  return member.id;
}
