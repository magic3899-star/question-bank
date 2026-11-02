import type { AssetData, Diagnostic, Question } from '../../contracts/index';
import type {
  EditorParseResult,
  ExplanationPair,
  ParsedExplanation,
  SaveRequest,
  SaveResult,
} from './editor';
import type { ImportCommitResult, ImportOptions, ImportPatch, ImportReview } from './import';
import type {
  BackupInfo,
  ExamSession,
  ExportProgress,
  ExportRequest,
  ExportResult,
  GenerateRequest,
  HistoryItem,
  RuleCheck,
  RuleSet,
  RuleSummary,
  UpdateStatus,
} from './exam';
import type { ExamSnapshot } from '../../contracts/index';

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
  openPath: 'app:open-path',
  rulesList: 'rules:list',
  rulesGet: 'rules:get',
  rulesSave: 'rules:save',
  rulesDuplicate: 'rules:duplicate',
  rulesDelete: 'rules:delete',
  rulesReset: 'rules:reset',
  rulesCheck: 'rules:check',
  examGenerate: 'exam:generate',
  examGet: 'exam:get',
  examReplace: 'exam:replace',
  examRegenerate: 'exam:regenerate',
  examDiscard: 'exam:discard',
  examExport: 'exam:export',
  historyList: 'history:list',
  historyGet: 'history:get',
  historyDelete: 'history:delete',
  backupList: 'backup:list',
  backupCreate: 'backup:create',
  backupRestore: 'backup:restore',
  backupOpenFolder: 'backup:open-folder',
  updateStatus: 'update:status',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
} as const;
/** main → 화면 알림 채널(요청-응답이 아님). */
export const events = {
  exportProgress: 'event:export-progress',
  updateStatus: 'event:update-status',
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
  app: {
    info(): Promise<Result<AppInfo>>;
    openDataDir(): Promise<Result<void>>;
    openPath(path: string): Promise<Result<void>>;
  };
  rules: {
    list(): Promise<Result<RuleSummary[]>>;
    get(id: string): Promise<Result<RuleSet>>;
    save(rules: RuleSet): Promise<Result<RuleSet>>;
    duplicate(id: string): Promise<Result<RuleSet>>;
    delete(id: string): Promise<Result<void>>;
    reset(id: string): Promise<Result<RuleSet>>;
    check(rules: RuleSet): Promise<Result<RuleCheck>>;
  };
  exam: {
    generate(request: GenerateRequest): Promise<Result<ExamSession>>;
    get(sessionId: string): Promise<Result<ExamSession>>;
    replace(request: { sessionId: string; examIndex: number; number: number }): Promise<Result<ExamSession>>;
    regenerate(request: { sessionId: string; examIndex: number }): Promise<Result<ExamSession>>;
    discard(sessionId: string): Promise<Result<void>>;
    export(request: ExportRequest): Promise<Result<ExportResult | null>>;
    onExportProgress(listener: (progress: ExportProgress) => void): () => void;
  };
  history: {
    list(request: {
      offset?: number;
      limit?: number;
      subject?: string;
      text?: string;
    }): Promise<Result<{ items: HistoryItem[]; total: number }>>;
    get(examId: string): Promise<Result<ExamSnapshot>>;
    delete(examIds: string[]): Promise<Result<void>>;
  };
  backup: {
    list(): Promise<Result<BackupInfo[]>>;
    create(): Promise<Result<BackupInfo>>;
    restore(name: string): Promise<Result<void>>;
    openFolder(): Promise<Result<void>>;
  };
  update: {
    status(): Promise<Result<UpdateStatus>>;
    check(): Promise<Result<UpdateStatus>>;
    install(): Promise<Result<void>>;
    onStatus(listener: (status: UpdateStatus) => void): () => void;
  };
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
