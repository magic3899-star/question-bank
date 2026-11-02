import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Storage } from '../../../modules/storage/index';
import type { BackupInfo } from '../../shared/index';
import { requireText } from './bank';

const AUTO_KEEP = 10;
const AUTO_INTERVAL_MS = 24 * 60 * 60 * 1000;

function stamp(iso: string): string {
  return iso.replace(/[-:]/gu, '').replace(/\..*$/u, '').replace('T', '-');
}

function kindOf(name: string): BackupInfo['kind'] {
  if (name.startsWith('auto-')) return 'auto';
  if (name.startsWith('pre-migrate')) return 'pre-migrate';
  if (name.startsWith('pre-restore')) return 'pre-restore';
  return 'manual';
}

export function createBackupService(
  storage: Storage,
  deps: { backupsDir: string; dbPath: string; now: () => string },
) {
  const list = (): BackupInfo[] => {
    if (!existsSync(deps.backupsDir)) return [];
    return readdirSync(deps.backupsDir)
      .filter((name) => name.endsWith('.sqlite'))
      .map((name) => {
        const stats = statSync(join(deps.backupsDir, name));
        return { name, createdAt: stats.mtime.toISOString(), size: stats.size, kind: kindOf(name) };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };
  const create = async (kind: 'auto' | 'manual'): Promise<BackupInfo> => {
    mkdirSync(deps.backupsDir, { recursive: true });
    const name = `${kind}-${stamp(deps.now())}.sqlite`;
    await storage.backupTo(join(deps.backupsDir, name));
    return list().find((item) => item.name === name)!;
  };
  return {
    list,
    create: () => create('manual'),
    /** 하루에 한 번 자동 백업하고 오래된 자동 백업은 최근 10개만 남긴다. */
    async autoBackupIfDue(): Promise<BackupInfo | undefined> {
      const autos = list().filter((item) => item.kind === 'auto');
      const latest = autos[0];
      if (latest && Date.parse(deps.now()) - Date.parse(latest.createdAt) < AUTO_INTERVAL_MS)
        return undefined;
      const created = await create('auto');
      for (const old of list()
        .filter((item) => item.kind === 'auto')
        .slice(AUTO_KEEP))
        rmSync(join(deps.backupsDir, old.name), { force: true });
      return created;
    },
    /** 복원할 백업 파일 경로를 검증해 돌려준다. 실제 교체는 DB 를 닫은 뒤 main 이 한다. */
    resolve(value: unknown): string {
      const name = basename(requireText(value, '백업 이름'));
      const path = join(deps.backupsDir, name);
      if (!name.endsWith('.sqlite') || !existsSync(path))
        throw new Error('백업 파일을 찾을 수 없습니다. 백업 목록을 새로 고치세요.');
      return path;
    },
    /** DB 를 닫은 상태에서 호출: 현재 DB 를 보관하고 백업으로 바꾼다. */
    replaceDatabase(backupPath: string): void {
      const keep = join(deps.backupsDir, `pre-restore-${stamp(deps.now())}.sqlite`);
      if (existsSync(deps.dbPath)) copyFileSync(deps.dbPath, keep);
      copyFileSync(backupPath, deps.dbPath);
      for (const suffix of ['-wal', '-shm']) rmSync(`${deps.dbPath}${suffix}`, { force: true });
    },
  };
}
