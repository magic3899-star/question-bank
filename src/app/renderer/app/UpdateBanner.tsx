import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { UpdateStatus } from '../../shared/index';
import { Button } from '../components/index';
import { unwrap } from '../lib/index';
import styles from './UpdateBanner.module.css';

/** 새 버전을 다 받았을 때만 화면 위에 알린다(확인 중·오류는 설정 화면에서만 보인다). */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>();
  const [hidden, setHidden] = useState(false);
  useEffect(() => window.qb.update.onStatus(setStatus), []);
  if (status?.state !== 'ready' || hidden) return null;
  return (
    <div className={styles.updateBanner} role="status">
      <Download aria-hidden="true" />
      <span>새 버전 {status.version}이(가) 준비되었습니다. 다시 시작하면 적용됩니다.</span>
      <Button
        variant="primary"
        onClick={() => void unwrap(window.qb.update.install()).catch(() => undefined)}
      >
        지금 다시 시작
      </Button>
      <Button onClick={() => setHidden(true)}>나중에</Button>
    </div>
  );
}
