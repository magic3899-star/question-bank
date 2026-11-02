import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function getPaths(appData: string, override?: string) {
  const dataDir = override ? resolve(override) : join(appData, 'QuestionBank');
  return {
    dataDir,
    dbPath: join(dataDir, 'data', 'bank.sqlite'),
    settingsPath: join(dataDir, 'settings.json'),
    backupsDir: join(dataDir, 'backups'),
  };
}
export type AppPaths = ReturnType<typeof getPaths>;
export function preparePaths(paths: AppPaths): void {
  mkdirSync(join(paths.dataDir, 'data'), { recursive: true });
  mkdirSync(paths.backupsDir, { recursive: true });
}
export function backupBeforeMigrate(paths: AppPaths, now: () => string) {
  return ({ fromVersion, toVersion }: { fromVersion: number; toVersion: number }): void => {
    const stamp = now().replace(/[^0-9A-Za-z-]/gu, '-');
    const target = join(paths.backupsDir, `pre-migrate-${fromVersion}-to-${toVersion}-${stamp}`);
    mkdirSync(target, { recursive: true });
    for (const suffix of ['', '-wal', '-shm']) {
      const source = paths.dbPath + suffix;
      if (existsSync(source)) copyFileSync(source, join(target, `bank.sqlite${suffix}`));
    }
  };
}
