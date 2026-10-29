import type Database from 'better-sqlite3';
import type {
  AssetRepository, HistoryRepository, PassageGroupRepository, QuestionRepository,
  RuleSetRepository, SnapshotRepository,
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
  close(): void;
  schemaVersion(): number;
}
