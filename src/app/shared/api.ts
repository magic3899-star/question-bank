import type { AssetData, Diagnostic, Question } from '../../contracts/index';
import type {
  EditorParseResult,
  ExplanationPair,
  ParsedExplanation,
  SaveRequest,
  SaveResult,
} from './editor';
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
  bankValidate: 'bank:validate',
  bankSave: 'bank:save',
  bankDelete: 'bank:delete',
  bankRestore: 'bank:restore',
  bankCodes: 'bank:objective-codes',
  bankExplanations: 'bank:apply-explanations',
  assetsAdd: 'assets:add',
  editorParse: 'editor:parse-text',
  editorExplanations: 'editor:parse-explanations',
  editorDirty: 'editor:dirty',
  importPickFiles: 'import:pick-files',
  importAnalyze: 'import:analyze',
  importCommit: 'import:commit',
  importDiscard: 'import:discard',
} as const;
export type Theme = 'system' | 'light' | 'dark';
export interface Settings {
  theme: Theme;
  pasteJoin?: 'space' | 'none';
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
  withoutExplanation?: boolean;
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
  editor: {
    parseText(request: {
      text: string;
      subject: string;
      joinWrappedLinesWith?: 'space' | 'none';
    }): Promise<Result<EditorParseResult>>;
    parseExplanations(request: {
      text: string;
      joinWrappedLinesWith?: 'space' | 'none';
    }): Promise<Result<ParsedExplanation[]>>;
    setDirty(dirty: boolean): Promise<Result<void>>;
  };
  assets: { add(request: { bytes: Uint8Array; mime: string }): Promise<Result<AssetData>> };
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
    validate(question: Question): Promise<Result<Diagnostic[]>>;
    save(request: SaveRequest): Promise<Result<SaveResult>>;
    delete(ids: string[]): Promise<Result<Question[]>>;
    restore(questions: Question[]): Promise<Result<void>>;
    objectiveCodes(subject: string): Promise<Result<string[]>>;
    applyExplanations(request: { pairs: ExplanationPair[] }): Promise<Result<Question[]>>;
    stats(): Promise<Result<BankStats>>;
    list(request: ListRequest): Promise<Result<{ items: QuestionSummary[]; total: number }>>;
    objectiveTree(subject: string): Promise<Result<ObjectiveNode[]>>;
    get(id: string): Promise<Result<QuestionDetail>>;
    deleteMany(ids: string[]): Promise<Result<void>>;
  };
}
