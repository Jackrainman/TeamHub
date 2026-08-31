export { registerKnowledgeRoutes } from './routes.js';
export type { KnowledgeRouteDeps } from './routes.js';
export {
  KB_SIMILAR_NOTE,
  KbCloseoutDivergenceError,
  KbCloseoutRejectedError,
  KnowledgeService,
} from './service.js';
export type { KbImportDocInput, KbImportDocsOutcome, KbSimilarQuery } from './service.js';
export { SqliteKnowledgeRepository } from './sqlite-repository.js';
export type {
  KbAddArchiveDocsResult,
  KbCloseoutAppend,
  KnowledgeNodeCloseoutPort,
  KnowledgeReadPort,
  KnowledgeRepository,
} from './repository.js';
