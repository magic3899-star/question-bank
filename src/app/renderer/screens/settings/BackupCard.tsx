import { useState } from 'react';
import { DatabaseBackup, FolderOpen, RotateCcw } from 'lucide-react';
import type { BackupInfo } from '../../../shared/index';
import { Button, Card, Dialog, ErrorState, Spinner } from '../../components/index';
import { useApi } from '../../hooks/index';
import { unwrap } from '../../lib/index';
import styles from './BackupCard.module.css';

const kindLabel: Record<BackupInfo['kind'], string> = {
  auto: '자동',
  manual: '직접',
  'pre-migrate': '업데이트 전',
  'pre-restore': '복원 전',
};

export function BackupCard({ notify }: { notify: (message: string) => void }) {
  const [revision, setRevision] = useState(0);
  const backups = useApi(() => window.qb.backup.list(), [revision]);
  const [restore, setRestore] = useState<BackupInfo>();
  const [busy, setBusy] = useState(false);
  return (
    <Card title="백업과 복원">
      <p>
        문제은행은 이 PC 에만 저장됩니다. 하루에 한 번 자동으로 백업하며(최근 10개 보관), 언제든 직접 백업할
        수 있습니다.
      </p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void unwrap(window.qb.backup.create())
              .then(() => {
                notify('백업을 만들었습니다.');
                setRevision((value) => value + 1);
              })
              .catch((cause: Error) => notify(cause.message))
              .finally(() => setBusy(false));
          }}
        >
          <DatabaseBackup aria-hidden="true" />
          지금 백업
        </Button>
        <Button
          onClick={() =>
            void unwrap(window.qb.backup.openFolder()).catch((cause: Error) => notify(cause.message))
          }
        >
          <FolderOpen aria-hidden="true" />
          백업 폴더 열기
        </Button>
      </div>
      {backups.error ? (
        <ErrorState message={backups.error} retry={backups.retry} />
      ) : !backups.value ? (
        <Spinner />
      ) : !backups.value.length ? (
        <p className={styles['path-caption']}>아직 백업이 없습니다.</p>
      ) : (
        <ul className={styles.backups}>
          {backups.value.slice(0, 12).map((backup) => (
            <li key={backup.name}>
              <span>
                <strong>{new Date(backup.createdAt).toLocaleString('ko-KR')}</strong>
                <small>
                  {kindLabel[backup.kind]} · {(backup.size / 1024 / 1024).toFixed(1)}MB
                </small>
              </span>
              <Button onClick={() => setRestore(backup)}>
                <RotateCcw aria-hidden="true" />이 백업으로 복원
              </Button>
            </li>
          ))}
        </ul>
      )}
      {restore && (
        <Dialog title="백업에서 복원" close={() => setRestore(undefined)}>
          <p>
            문제은행을 <strong>{new Date(restore.createdAt).toLocaleString('ko-KR')}</strong> 백업 상태로
            되돌립니다.
          </p>
          <p>지금 데이터는 '복원 전' 백업으로 따로 보관되며, 프로그램이 다시 시작됩니다.</p>
          <div className={styles.dialogActions}>
            <Button onClick={() => setRestore(undefined)}>취소</Button>
            <Button
              variant="danger"
              onClick={() =>
                void unwrap(window.qb.backup.restore(restore.name)).catch((cause: Error) =>
                  notify(cause.message),
                )
              }
            >
              복원하고 다시 시작
            </Button>
          </div>
        </Dialog>
      )}
    </Card>
  );
}
