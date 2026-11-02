import type Database from 'better-sqlite3';
import type {
  AssetRepository,
  HistoryRepository,
  PassageGroupRepository,
  QuestionRepository,
  RuleSetRepository,
  SnapshotRepository,
} from '../../contracts/index';

export interface Migration {
  version: number;
  up(db: Database.Database): void;
}

export interface StorageOptions {
  migrations?: Migration[];
  beforeMigrate?: (info: { fromVersion: number; toVersion: number }) => void;
}

export interface Storage {
  questions: QuestionRepository;
  assets: AssetRepository;
  passageGroups: PassageGroupRepository;
  ruleSets: RuleSetRepository;
  history: HistoryRepository;
  snapshots: SnapshotRepository;
  /** 실행 중에도 일관된 DB 복사본을 만든다(better-sqlite3 온라인 백업). */
  backupTo(path: string): Promise<void>;
  close(): void;
  schemaVersion(): number;
}
