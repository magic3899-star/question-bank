import type { AssetData, Question } from '../../contracts/index';

export const channels = {
  appInfo: 'app:info',
  openDataDir: 'app:open-data-dir',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  bankStats: 'bank:stats',
  bankList: 'bank:list',
  bankTree: 'bank:objective-tree',
  bankGet: 'bank:get',
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
  };
}
