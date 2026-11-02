import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import styles from './ErrorState.module.css';
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className={styles['error-state']} role="alert">
      <AlertTriangle aria-hidden="true" />
      <h2>작업을 완료하지 못했습니다</h2>
      <p>{message}</p>
      {retry && <Button onClick={retry}>다시 시도</Button>}
    </div>
  );
}
