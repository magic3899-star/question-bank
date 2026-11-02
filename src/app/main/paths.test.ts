import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupBeforeMigrate, getPaths, preparePaths } from './paths';
import { openStorage } from '../../modules/storage/index';
import { makeQuestion } from '../../../tests/fixtures/builders';

describe('데이터 경로와 변경 전 백업', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'qb-paths-'));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));
  it('제품 표시명과 독립된 영문 폴더·검수 경로를 사용한다', () => {
    expect(getPaths(directory).dataDir).toBe(join(directory, 'QuestionBank'));
    expect(getPaths('ignored', directory).dbPath).toBe(join(directory, 'data', 'bank.sqlite'));
  });
  it('DB와 WAL/SHM을 주입 시각의 한 폴더에 원본 그대로 복사한다', () => {
    const paths = getPaths('', directory);
    preparePaths(paths);
    for (const suffix of ['', '-wal', '-shm']) writeFileSync(paths.dbPath + suffix, `가짜${suffix}`);
    backupBeforeMigrate(paths, () => '2026-11-02T00:00:00Z')({ fromVersion: 1, toVersion: 2 });
    const target = join(paths.backupsDir, readdirSync(paths.backupsDir)[0]);
    for (const suffix of ['', '-wal', '-shm'])
      expect(readFileSync(join(target, `bank.sqlite${suffix}`), 'utf8')).toBe(`가짜${suffix}`);
  });
  it('실제 storage 콜백에서 새 마이그레이션 직전의 DB를 복구할 수 있다', async () => {
    const paths = getPaths('', directory);
    preparePaths(paths);
    const first = openStorage(paths.dbPath);
    await first.questions.upsertMany([makeQuestion()]);
    first.close();
    const next = openStorage(paths.dbPath, {
      beforeMigrate: backupBeforeMigrate(paths, () => 'fixed'),
      migrations: [
        {
          version: 2,
          up(db) {
            db.exec('CREATE TABLE fake_extension (id TEXT)');
          },
        },
      ],
    });
    expect(next.schemaVersion()).toBe(2);
    next.close();
    const restored = openStorage(join(paths.backupsDir, 'pre-migrate-1-to-2-fixed', 'bank.sqlite'));
    expect(restored.schemaVersion()).toBe(1);
    expect(await restored.questions.count()).toBe(1);
    restored.close();
  });
});
