import type { Diagnostic, ExamHeader, ExamSnapshot, ExportPart, RuleSet } from '../../contracts/index';

export interface RuleSummary {
  id: string;
  name: string;
  subject: string;
  subjectName: string;
  examCount: number;
  questionsPerExam: number;
  needsConfirmation: boolean;
  isPreset: boolean;
}

export interface SlotCheck {
  slotId: string;
  label: string;
  perExam: number;
  /** 회차 간 겹침 금지면 회차 수 × 문제 수, 아니면 문제 수. */
  required: number;
  available: number;
  /** 중단원이 서로 달라야 하는 규칙이 있을 때 후보의 서로 다른 중단원 수. */
  distinctSegments?: number;
  /** 회차마다 예상되는 빈 번호 수. */
  expectedBlanksPerExam: number;
}

export interface RuleCheck {
  slots: SlotCheck[];
  diagnostics: Diagnostic[];
  description: string[];
  candidates: number;
}

export interface ShuffleSettings {
  shuffleQuestionOrder: boolean;
  /** 문제 번호를 학습목표 순으로 배치(기본). 끄면 무작위 순서. */
  sortByObjective: boolean;
  shuffleChoices: boolean;
  balanceAnswerPositions: boolean;
  minAnswerPositionShare: number;
}

export interface GenerateRequest {
  ruleSetId: string;
  seed?: string;
  shuffle: ShuffleSettings;
  excludeRecentExams?: number;
  titleTemplate?: string;
}

export interface ExamSession {
  sessionId: string;
  ruleSetId: string;
  ruleName: string;
  subject: string;
  seed: string;
  snapshots: ExamSnapshot[];
  diagnostics: Diagnostic[];
  /** 이미 파일로 저장해 출제 이력에 기록된 회차 ID. */
  savedExamIds: string[];
}

export type ExportFormat = 'pdf' | 'docx' | 'xlsx';

export interface ExportRequest {
  source: { sessionId: string } | { historyExamIds: string[] };
  examIndexes?: number[];
  formats: ExportFormat[];
  parts: ExportPart[];
  combineParts: boolean;
  header?: ExamHeader;
  folder?: string;
}

export interface ExportedFileInfo {
  path: string;
  format: ExportFormat;
  part: string;
  examTitle: string;
}

export interface ExportResult {
  folder: string;
  files: ExportedFileInfo[];
}

export interface ExportProgress {
  done: number;
  total: number;
  current: string;
}

export interface HistoryItem {
  examId: string;
  title: string;
  createdAt: string;
  subject: string;
  subjectName: string;
  ruleSetId: string;
  ruleName: string;
  seed: string;
  questionCount: number;
  blankCount: number;
}

export interface BackupInfo {
  name: string;
  createdAt: string;
  size: number;
  kind: 'auto' | 'manual' | 'pre-migrate' | 'pre-restore';
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error' | 'unsupported';
  version?: string;
  percent?: number;
  message?: string;
}

export type { RuleSet };
