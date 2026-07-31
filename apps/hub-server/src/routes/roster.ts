import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  buildRosterTemplateCsv,
  decodeRosterBytes,
  parseRosterCsv,
  RosterImportReportSchema,
  RosterImportRowsRequestSchema,
  RosterPreviewResponseSchema,
} from '@teamhub/hub-contracts';
import type { IdentityMode, RosterImportFailure, RosterImportRow } from '@teamhub/hub-contracts';
import type { GovStore } from '../store/gov-store.js';
import { isSuperAdmin } from '../authz.js';
import { parseBody, readCsvUpload } from './helpers.js';

const ROSTER_MAX_BYTES = 1024 * 1024;

export interface RosterRouteDeps {
  store: GovStore;
  identityMode: IdentityMode;
}

export function registerRosterRoutes(app: FastifyInstance, deps: RosterRouteDeps): void {
  const { store, identityMode } = deps;

  const rosterWriteAuth = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> => {
    const snapshot = await store.getSnapshot();
    const emptyRoster = snapshot.members.length === 0;
    if (identityMode === 'identity' && !emptyRoster) {
      if (!request.identity) {
        void reply.code(401).send({ detail: 'login required' });
        return false;
      }
      if (!isSuperAdmin(snapshot.members, request.identity.memberId)) {
        void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
        return false;
      }
    }
    return true;
  };

  const readRosterCsvText = (request: FastifyRequest, reply: FastifyReply) =>
    readCsvUpload(request, reply, { maxBytes: ROSTER_MAX_BYTES, decode: decodeRosterBytes });

  app.get('/api/roster/template', async (_request, reply) => {
    void reply.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('名册模板.csv')}`,
    );
    void reply.type('text/csv; charset=utf-8');
    return buildRosterTemplateCsv();
  });

  app.post('/api/roster/preview', async (request, reply) => {
    if (!(await rosterWriteAuth(request, reply))) return;
    const text = await readRosterCsvText(request, reply);
    if (text === null) return;
    const { rows, errors } = parseRosterCsv(text);
    return RosterPreviewResponseSchema.parse({ rows, failed: errors });
  });

  app.post('/api/roster/import', async (request, reply) => {
    if (!(await rosterWriteAuth(request, reply))) return;
    let rows: RosterImportRow[];
    let parseErrors: RosterImportFailure[] = [];
    if ((request.headers['content-type'] ?? '').includes('application/json')) {
      const parsed = parseBody(RosterImportRowsRequestSchema, request, reply);
      if (!parsed) return;
      rows = parsed.rows;
    } else {
      const text = await readRosterCsvText(request, reply);
      if (text === null) return;
      const parsedCsv = parseRosterCsv(text);
      rows = parsedCsv.rows;
      parseErrors = parsedCsv.errors;
    }
    const outcome = await store.importRoster(rows);
    return RosterImportReportSchema.parse({
      created: outcome.created,
      updated: outcome.updated,
      failed: [...parseErrors, ...outcome.failed],
      missingFromSheet: outcome.missingFromSheet,
      createdGroups: outcome.createdGroups,
      autoReviewers: outcome.autoReviewers,
    });
  });
}
