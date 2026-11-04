import { useState } from 'react';
import type { ExamSnapshot, ExportPart } from '../../../../contracts/index';
import type { ExportFormat, ExportResult } from '../../../shared/index';
import { Button, Dialog, ExportOptions, useExamHeader } from '../../components/index';
import { unwrap } from '../../lib/index';
import styles from './SaveDialog.module.css';

export function SaveDialog({
  snapshot,
  close,
  notify,
}: {
  snapshot: ExamSnapshot;
  close: () => void;
  notify: (message: string) => void;
}) {
  const examHeader = useExamHeader();
  const [formats, setFormats] = useState<ExportFormat[]>(['pdf']);
  const [parts, setParts] = useState<ExportPart[]>(['questions', 'answers', 'explanations']);
  const [combine, setCombine] = useState(false);
  const [exams, setExams] = useState<number[]>([0]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<ExportResult>();
  return (
    <Dialog title={`'${snapshot.title}' 다시 저장`} close={close}>
      <ExportOptions
        snapshots={[snapshot]}
        formats={formats}
        setFormats={setFormats}
        parts={parts}
        setParts={setParts}
        combine={combine}
        setCombine={setCombine}
        exams={exams}
        setExams={setExams}
        examHeader={examHeader}
      />
      {saved && <p>{saved.files.length}개 파일을 저장했습니다.</p>}
      <div className={styles.dialogActions}>
        {saved && (
          <Button onClick={() => void unwrap(window.qb.app.openPath(saved.folder)).catch(() => undefined)}>
            폴더 열기
          </Button>
        )}
        <Button onClick={close}>닫기</Button>
        <Button
          variant="primary"
          disabled={busy}
          disabledReason={
            !formats.length || !parts.length
              ? '형식과 문서를 하나 이상 고르세요.'
              : !exams.length
                ? '저장할 회차를 하나 이상 고르세요.'
                : examHeader.reason
          }
          onClick={() => {
            setBusy(true);
            void unwrap(
              window.qb.exam.export({
                source: { historyExamIds: [snapshot.examId] },
                formats,
                parts,
                combineParts: combine,
                examIndexes: exams,
                ...examHeader.request,
              }),
            )
              .then((result) => result && setSaved(result))
              .catch((cause: Error) => notify(cause.message))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? '저장 중…' : '폴더를 골라 저장'}
        </Button>
      </div>
    </Dialog>
  );
}
