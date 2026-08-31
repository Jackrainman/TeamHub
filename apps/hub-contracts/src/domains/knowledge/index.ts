export {
  ARCHIVE_FILE_NAME_PATTERN,
  ArchiveDocumentSchema,
  ArchiveGeneratedBySchema,
  ERROR_CODE_PATTERN,
  ErrorEntrySchema,
  InvestigationRecordSchema,
  InvestigationRecordTypeSchema,
  IssueCardSchema,
  IssueSeveritySchema,
  IssueStatusSchema,
  KB_ARRAY_MAX,
  KB_DERIVED_PREVENTION_MAX,
  KB_ID_MAX,
  KB_LONG_TEXT_MAX,
  KB_MARKDOWN_MAX,
  KB_TAG_MAX,
  KB_TEXT_MAX,
  KB_TITLE_MAX,
} from './model.js';
export type {
  ArchiveDocument,
  ArchiveGeneratedBy,
  ErrorEntry,
  InvestigationRecord,
  InvestigationRecordType,
  IssueCard,
  IssueSeverity,
  IssueStatus,
  KbSnapshot,
} from './model.js';

export {
  ErrorEntriesResponseSchema,
  IssueCardsResponseSchema,
  KbImportDocIssueSchema,
  KbImportDocRefSchema,
  KbImportDocsReportSchema,
} from './requests.js';
export type {
  KbImportDocIssue,
  KbImportDocRef,
  KbImportDocsReport,
} from './requests.js';

export {
  KbSimilarResponseSchema,
  SimilarIssueMatchSchema,
  rankSimilarIssues,
} from './similar.js';
export type {
  KbSimilarResponse,
  RankSimilarIssuesInput,
  SimilarIssueMatch,
} from './similar.js';

export {
  KbCloseoutRequestSchema,
  KbCloseoutResponseSchema,
  buildCloseoutFromIssue,
  deriveErrorCode,
  deriveKnowledgeNodeFromIssue,
} from './closeout.js';
export type {
  CloseoutFailure,
  CloseoutGeneratedBy,
  CloseoutInput,
  CloseoutOptions,
  CloseoutResult,
  CloseoutSuccess,
  KbCloseoutRequest,
  KbCloseoutResponse,
} from './closeout.js';
