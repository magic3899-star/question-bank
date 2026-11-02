import type { AssetData, Question } from '../../contracts/index';
import type { ImportCommitResult, ImportOptions, ImportPatch, ImportReview } from './import';

export const channels = {
  appInfo: 'app:info',
  openDataDir: 'app:open-data-dir',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  bankStats: 'bank:stats',
  bankList: 'bank:list',
  bankTree: 'bank:objective-tree',
  bankGet: 'bank:get',
  bankDeleteMany: 'bank:delete-many',
  importPickFiles: 'import:pick-files',
  importAnalyze: 'import:analyze',
  importCommit: 'import:commit',
  importDiscard: 'import:discard',
} as const;
export type Theme = 'system' | 'light' | 'dark';
export interface Settings {
  theme: Theme;
  subjects: { id: string; name: string }[];
  defaultSaveDir: string;
  window?: { width: number; height: number; x?: number; y?: number };
}
export interface AppInfo {
  version: string;
  dataDir: string;
  dbPath: string;
  isPackaged: boolean;
  startupError?: string;
}
export type Result<T> = { ok: true; value: T } | { ok: false; message: string };
export interface QuestionSummary {
  id: string;
  subject: string;
  objectiveCode?: string;
  grade?: string;
  stemPreview: string;
  hasPassage: boolean;
  hasImage: boolean;
  choiceCount: number;
  warnings: number;
}
export interface BankStats {
  total: number;
  bySubject: { subject: string; name: string; count: number; withoutObjective: number }[];
  warnings: { withoutObjective: number };
}
export interface ListRequest {
  batch?: string;
  subject?: string;
  objectivePrefix?: string;
  text?: string;
  withoutObjective?: boolean;
  offset: number;
  limit: number;
}
export interface ObjectiveNode {
  code: string;
  count: number;
  children: ObjectiveNode[];
}
export interface QuestionDetail {
  question: Question;
  assets: Record<string, AssetData>;
}
export interface QbApi {
  import: {
    pickFiles(): Promise<Result<string[]>>;
    pathsForFiles(files: File[]): string[];
    analyze(request: { paths: string[]; options: ImportOptions }): Promise<Result<ImportReview>>;
    commit(request: { batchId: string; patches: ImportPatch[] }): Promise<Result<ImportCommitResult>>;
    discard(batchId: string): Promise<Result<void>>;
  };
  app: { info(): Promise<Result<AppInfo>>; openDataDir(): Promise<Result<void>> };
  settings: {
    get(): Promise<Result<Settings>>;
    update(partial: Partial<Settings>): Promise<Result<Settings>>;
  };
  bank: {
    stats(): Promise<Result<BankStats>>;
    list(request: ListRequest): Promise<Result<{ items: QuestionSummary[]; total: number }>>;
    objectiveTree(subject: string): Promise<Result<ObjectiveNode[]>>;
    get(id: string): Promise<Result<QuestionDetail>>;
    deleteMany(ids: string[]): Promise<Result<void>>;
  };
}
