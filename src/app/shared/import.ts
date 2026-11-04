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
/** 가져오기 분석 중 오래 걸리는 단계(글자 인식)의 진행 상황. */
export interface ImportAnalyzeProgress {
  file: string;
  label: string;
  done: number;
  total: number;
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
