import type { AssetData, Diagnostic, Question } from '../../contracts/index';
import type { QuestionSummary } from './api';

export interface ImportOptions {
  subject: string;
  includeGrades?: string[] | null;
  requireObjective?: boolean;
  dedupeByPassage?: boolean;
  lockChoicesOnReference?: boolean;
  pdfCopyCleanup?: boolean;
}
export interface ImportPatch {
  index: number;
  include?: boolean;
  objectiveCode?: string;
  grade?: string;
  shufflePolicy?: 'free' | 'lock-all';
}
export type ImportStatus = 'ok' | 'warn' | 'error' | 'excluded';
export interface ImportItem {
  index: number;
  sourceLocation: string;
  status: ImportStatus;
  excludedReason?: string;
  diagnostics: Diagnostic[];
  summary: QuestionSummary;
  draft: Question;
}
export interface ImportReview {
  batchId: string;
  files: { name: string; questions: number; skipped: number }[];
  items: ImportItem[];
  skipped: Diagnostic[];
  diagnostics: Diagnostic[];
  assets: Record<string, AssetData>;
  counts: Record<ImportStatus, number>;
}
export interface ImportCommitResult {
  saved: number;
  savedIds: string[];
  notSaved: { index: number; reason: string }[];
}
