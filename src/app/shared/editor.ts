import type { AssetData, Block, Diagnostic, Question } from '../../contracts/index';

export interface EditorParseResult {
  batchId: string;
  questions: Question[];
  diagnostics: Diagnostic[];
}
export interface ParsedExplanation {
  number: string;
  explanation: Block[];
  answerPositions: number[];
}
export interface ExplanationPair {
  questionId: string;
  number: string;
  explanation: Block[];
  answerPositions?: number[];
}
export interface SaveRequest {
  question: Question;
  assets: AssetData[];
  force?: boolean;
}
export type SaveResult =
  { saved: true; question: Question; previous?: Question } | { saved: false; duplicates: Question[] };
