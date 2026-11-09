import { useEffect, useState } from 'react';
import type { ImportCommitResult } from '../../../shared/index';
import { Button } from '../../components/index';
import { navigate, unwrap } from '../../lib/index';
import styles from './ImportSavedToast.module.css';
export function ImportSavedToast({
  result,
  batchId,
  close,
  fail,
}: {
  result: ImportCommitResult;
  batchId: string;
  close: () => void;
  fail: (message: string) => void;
}) {
  const [undoable, setUndoable] = useState(true);
  const [undoing, setUndoing] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setUndoable(false), 10000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className={styles.toast} role="status">
      <span>
        {result.saved}문제를 저장했습니다.
        {result.newSubjects?.length ? ` 새로 등록된 과목: ${result.newSubjects.join(', ')}` : ''}
        {result.notSaved.length ? ` · ${result.notSaved.length}개 저장 안 됨` : ''}
      </span>
      {undoable && result.saved > 0 && (
        <Button
          disabled={undoing}
          onClick={() => {
            setUndoing(true);
            void unwrap(window.qb.bank.deleteMany(result.savedIds))
              .then(close)
              .catch((cause: Error) => {
                setUndoing(false);
                fail(cause.message);
              });
          }}
        >
          실행 취소 (10초)
        </Button>
      )}
      <Button onClick={() => navigate(`bank?batch=${encodeURIComponent(batchId)}`)}>문제은행에서 보기</Button>
      <Button aria-label="저장 알림 닫기" onClick={close}>
        닫기
      </Button>
    </div>
  );
}
