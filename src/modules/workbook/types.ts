import type { Diagnostic } from '../../contracts/index';

export type BookKind = 'questions' | 'answers' | 'unknown';

export interface WorkbookBook {
  name: string;
  lines: readonly string[];
}

export interface WorkbookOptions {
  requireObjective?: boolean;
  lockChoicesOnReference?: boolean;
  includeGrades?: string[] | null;
}

export interface SourceLine {
  text: string;
  sourceLine: number;
  noise: boolean;
}

export interface ParsedQuestion {
  subjectId: string;
  number: number;
  stem: string[];
  choices: string[];
  sourceLine: number;
}

export interface ParsedAnswer {
  subjectId: string;
  number: number;
  answerLabel?: string;
  titleParagraph: string;
  paragraphs: string[];
  objectiveCode?: string;
  sourceLine: number;
}

export interface ParseContext {
  diagnostics: Diagnostic[];
  estimated: number;
  discarded: number;
}
