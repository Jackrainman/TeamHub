import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { GroupSchema, MemberSchema } from '@teamhub/hub-contracts';
import { hashPin } from '../../src/identity/pin.js';
import { FixedClock } from '../../src/clock.js';
import { buildHubServer } from '../../src/server.js';
import { openV1Database, type V1Database } from '../../src/store/v1-database.js';
import { createSystemModule, type SystemPublicApi } from '../../src/modules/system/public.js';

export const TEST_PASSWORDS = {
  admin: 'admin-password', owner: 'owner-password', reviewer: 'reviewer-password',
} as const;
export interface TestHub {
  app: FastifyInstance;
  database: V1Database;
  system: SystemPublicApi;
  root: string;
  close: () => Promise<void>;
}
export function createTestHub(now = '2026-11-17T04:00:00.000Z'): TestHub {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamhub-v1-server-'));
  const database = openV1Database(path.join(root, 'teamhub.sqlite'));
  database.initialize({ dataMode: 'real', identityMode: 'identity' }, new Date(now));
  const group = GroupSchema.parse({ id: 'grp-v1-1', name: '电路', kind: 'custom' });
  const members = [
    { id: 'member-v1-1', displayName: 'owner', grade: 'junior' as const, gateReviewer: false, projectManager: false },
    { id: 'member-v1-2', displayName: 'reviewer', grade: 'senior' as const, gateReviewer: true, projectManager: false },
    { id: 'member-v1-3', displayName: 'admin', grade: 'senior' as const, gateReviewer: true, projectManager: true },
  ].map((member) => MemberSchema.parse({
    ...member,
    role: 'member',
    groupId: group.id,
    updatedAt: new Date(now).toISOString(),
    pinHash: hashPin(TEST_PASSWORDS[member.displayName as keyof typeof TEST_PASSWORDS]),
  }));
  database.db.tx(() => {
    database.db.insertRow('groups', group.id, group);
    for (const member of members) database.db.insertRow('members', member.id, member);
  });
  const system = createSystemModule(database.db).publicApi;
  const evidenceDir = path.join(root, 'evidence');
  process.env.TEAMHUB_EVIDENCE_FILES_DIR = evidenceDir;
  const app = buildHubServer({ database, clock: new FixedClock(new Date(now)) });
  return {
    app, database, system, root,
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
  const member = hub.system.listMembers().find(item => item.displayName === displayName);
  if (!member) throw new Error(`missing fixture member ${displayName}`);
  return member.id;
}
