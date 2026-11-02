import { useEffect } from 'react';
import { Button } from './Button';
import styles from './Toast.module.css';
export function Toast({ message, undo, close }: { message: string; undo?: () => void; close: () => void }) {
  useEffect(() => {
    const timer = setTimeout(close, 5000);
    return () => clearTimeout(timer);
  }, [close]);
  return (
    <div className={styles['toast']} role="status">
      {message}
      {undo && <Button onClick={undo}>실행 취소</Button>}
      <Button aria-label="알림 닫기" onClick={close}>
        닫기
      </Button>
    </div>
  );
}
