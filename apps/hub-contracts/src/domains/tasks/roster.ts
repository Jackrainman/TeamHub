import { z } from 'zod';
import { MemberGradeSchema, type MemberGrade } from './model.js';
import { UTF8_BOM, decodeCsvBytes, tokenizeCsv } from '../../csv-core.js';

export const ROSTER_TEMPLATE_HEADERS = ['姓名', '年级', '组'] as const;
export function buildRosterTemplateCsv(): string {
  return `${UTF8_BOM}${ROSTER_TEMPLATE_HEADERS.join(',')}\r\n张三,大二,电路\r\n李四,研一,算法\r\n`;
}
const GRADE_BY_LABEL: Record<string, MemberGrade> = {
  大一: 'freshman', 大二: 'sophomore', 大三: 'junior', 大四: 'senior',
  研一: 'grad1', 研二: 'grad2', 研三: 'grad3', 研究生: 'graduate',
};
export const GATE_REVIEWER_DEFAULT_GRADES: ReadonlySet<MemberGrade> = new Set([
  'junior', 'senior', 'graduate', 'grad1', 'grad2', 'grad3',
]);
export const RosterImportRowSchema = z.object({
  displayName: z.string().trim().min(1),
  grade: MemberGradeSchema,
  groupName: z.string().trim().min(1),
  gateReviewer: z.boolean(),
  gateReviewerAuto: z.boolean(),
  line: z.number().int().positive().optional(),
});
export type RosterImportRow = z.infer<typeof RosterImportRowSchema>;
export interface RosterImportFailure { line: number; reason: string }
export interface RosterParseResult { rows: RosterImportRow[]; errors: RosterImportFailure[] }
export function parseRosterCsv(text: string): RosterParseResult {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = tokenizeCsv(clean);
  const rows: RosterImportRow[] = [];
  const errors: RosterImportFailure[] = [];
  let headerSkipped = false;
  for (const record of records) {
    if (!headerSkipped) { headerSkipped = true; continue; }
    const cell = (index: number) => (record.fields[index] ?? '').trim();
    const displayName = cell(0);
    const gradeLabel = cell(1);
    const groupName = cell(2);
    if (!displayName) { errors.push({ line: record.line, reason: '姓名为空' }); continue; }
    const grade = GRADE_BY_LABEL[gradeLabel];
    if (!grade) { errors.push({ line: record.line, reason: `年级无法识别：「${gradeLabel || '（空）'}」` }); continue; }
    if (!groupName) { errors.push({ line: record.line, reason: '组为空' }); continue; }
    const gateReviewer = GATE_REVIEWER_DEFAULT_GRADES.has(grade);
    rows.push({ displayName, grade, groupName, gateReviewer, gateReviewerAuto: gateReviewer, line: record.line });
  }
  return { rows, errors };
}
export const RosterImportFailureSchema = z.object({ line: z.number().int().nonnegative(), reason: z.string().min(1) });
export const RosterImportReportSchema = z.object({
  created: z.array(z.string()), updated: z.array(z.string()), failed: z.array(RosterImportFailureSchema),
  missingFromSheet: z.array(z.string()), createdGroups: z.array(z.string()), autoReviewers: z.array(z.string()),
});
export const RosterPreviewResponseSchema = z.object({ rows: z.array(RosterImportRowSchema), failed: z.array(RosterImportFailureSchema) });
export const RosterImportRowsRequestSchema = z.object({ rows: z.array(RosterImportRowSchema) });
export { decodeCsvBytes as decodeRosterBytes };
export type RosterImportReport = z.infer<typeof RosterImportReportSchema>;
export type RosterPreviewResponse = z.infer<typeof RosterPreviewResponseSchema>;
export type RosterImportRowsRequest = z.infer<typeof RosterImportRowsRequestSchema>;
