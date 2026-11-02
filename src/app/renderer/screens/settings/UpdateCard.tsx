import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import type { AppInfo, UpdateStatus } from '../../../shared/index';
import { Button, Card } from '../../components/index';
import { unwrap } from '../../lib/index';
import styles from './UpdateCard.module.css';

export function describeUpdate(status: UpdateStatus | undefined): string {
  switch (status?.state) {
    case 'checking':
      return '새 버전을 확인하고 있습니다…';
    case 'available':
      return `새 버전 ${status.version ?? ''}을(를) 내려받고 있습니다.`;
    case 'downloading':
      return `새 버전을 내려받는 중입니다 (${status.percent ?? 0}%).`;
    case 'ready':
      return `새 버전 ${status.version ?? ''}이(가) 준비되었습니다. 다시 시작하면 적용됩니다.`;
    case 'none':
      return '최신 버전을 사용하고 있습니다.';
    case 'error':
    case 'unsupported':
      return status.message ?? '업데이트를 확인할 수 없습니다.';
    default:
      return '프로그램을 시작할 때 자동으로 새 버전을 확인합니다.';
  }
}

export function UpdateCard({ info, notify }: { info: AppInfo; notify: (message: string) => void }) {
  const [status, setStatus] = useState<UpdateStatus>();
  useEffect(() => {
    void unwrap(window.qb.update.status())
      .then(setStatus)
      .catch(() => undefined);
    return window.qb.update.onStatus(setStatus);
  }, []);
  return (
    <Card title="업데이트">
      <p>
        현재 버전 <strong>{info.version}</strong>
      </p>
      <p className={styles['path-caption']}>{describeUpdate(status)}</p>
      <div className={styles.actions}>
        <Button
          disabled={status?.state === 'checking' || status?.state === 'downloading'}
          onClick={() =>
            void unwrap(window.qb.update.check())
              .then(setStatus)
              .catch((cause: Error) => notify(cause.message))
          }
        >
          <RefreshCw aria-hidden="true" />
          지금 확인
        </Button>
        {status?.state === 'ready' && (
          <Button
            variant="primary"
            onClick={() =>
              void unwrap(window.qb.update.install()).catch((cause: Error) => notify(cause.message))
            }
          >
            <Download aria-hidden="true" />
            다시 시작해 업데이트
          </Button>
        )}
      </div>
    </Card>
  );
}
