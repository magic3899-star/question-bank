import type { Block, Diagnostic } from '../../contracts/index';
export interface AutoNumber {
  value: number;
  label: string;
}
export interface Entry {
  block: Block;
  position: number;
  text: string;
  boundary: boolean;
  autoNumber?: AutoNumber;
}
export interface LocatedDiagnostic {
  diagnostic: Diagnostic;
  position: number;
}

export interface LayoutBlock {
  block: Block;
  text: string;
  sourceIndex: number;
  kind: 'paragraph' | 'table' | 'image' | 'box';
  circledNumbering?: boolean;
  autoNumber?: AutoNumber;
}
export interface LayoutOptions {
  subject: string;
  sourceFile?: string;
  includeGrades?: string[] | null;
  requireObjective?: boolean;
  dedupeByPassage?: boolean;
  lockChoicesOnReference?: boolean;
}
