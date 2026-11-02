import { useCallback, useState } from 'react';
import type { Question } from '../../../../contracts/index';
import type { QuestionDetail } from '../../../shared/index';
import { Button, Dialog, Toast } from '../../components/index';
import { navigate, unwrap } from '../../lib/index';

export function BankActions({ detail, refresh }: { detail?: QuestionDetail; refresh: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState<Question[]>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => {
    setMessage('');
    setDeleted(undefined);
  }, []);
  return (
    <>
      <Button
        disabled={!detail}
        onClick={() => detail && navigate(`edit?id=${encodeURIComponent(detail.question.id)}`)}
      >
        편집
      </Button>
      <Button variant="danger" disabled={!detail} onClick={() => setConfirmDelete(true)}>
        삭제
      </Button>
      {confirmDelete && detail && (
        <Dialog title="문제를 삭제할까요?" close={() => setConfirmDelete(false)}>
          <p>선택한 문제 1개를 문제은행에서 삭제합니다. 알림의 실행 취소로 복원할 수 있습니다.</p>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void unwrap(window.qb.bank.delete([detail.question.id]))
                .then((questions) => {
                  setDeleted(questions);
                  setMessage('문제를 삭제했습니다.');
                  setConfirmDelete(false);
                  refresh();
                })
                .catch((cause: Error) => setMessage(cause.message))
                .finally(() => setBusy(false));
            }}
          >
            삭제
          </Button>
          <Button onClick={() => setConfirmDelete(false)}>취소</Button>
        </Dialog>
      )}
      {message && (
        <Toast
          message={message}
          close={close}
          undo={
            deleted
              ? () => {
                  void unwrap(window.qb.bank.restore(deleted))
                    .then(() => {
                      close();
                      refresh();
                    })
                    .catch((cause: Error) => setMessage(cause.message));
                }
              : undefined
          }
        />
      )}
    </>
  );
}
