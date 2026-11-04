import { useState } from 'react';
import { ArrowLeft, FileDown, FolderOpen, History } from 'lucide-react';
import type { ExportPart } from '../../../../contracts/index';
import type { ExportFormat } from '../../../shared/index';
import { Button, ExportOptions, useExamHeader } from '../../components/index';
import { navigate, unwrap } from '../../lib/index';
import type { useGenerate } from './useGenerate';

import styles from './StepSave.module.css';

export function StepSave({
  model,
  notify,
}: {
  model: ReturnType<typeof useGenerate>;
  notify: (message: string) => void;
}) {
  const session = model.session!;
  const examHeader = useExamHeader();
  const [formats, setFormats] = useState<ExportFormat[]>(['pdf', 'docx']);
  const [parts, setParts] = useState<ExportPart[]>(['questions', 'answers', 'explanations']);
  const [combine, setCombine] = useState(false);
  const [exams, setExams] = useState<number[]>(session.snapshots.map((_, index) => index));
  const blanks = exams.reduce(
    (sum, index) => sum + (session.snapshots[index]?.items.filter((item) => item.blank).length ?? 0),
    0,
  );
  const open = (path: string) =>
    void unwrap(window.qb.app.openPath(path)).catch((cause: Error) => notify(cause.message));
  const reason = !formats.length
    ? '저장 형식을 하나 이상 고르세요.'
    : !parts.length
      ? '저장할 문서를 하나 이상 고르세요.'
      : !exams.length
        ? '저장할 회차를 하나 이상 고르세요.'
        : examHeader.reason;
  return (
    <div className={styles.step}>
      <div className={styles.heading}>
        <h2>파일로 저장</h2>
        <p>저장하면 출제 이력에 기록되어 나중에 다시 보거나 다시 저장할 수 있습니다.</p>
      </div>
      <ExportOptions
        snapshots={session.snapshots}
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
      {blanks > 0 && <p className={styles.warn}>선택한 회차에 비워 둔 번호가 {blanks}개 있습니다.</p>}
      {model.busy && model.progress && (
        <div className={styles.progress} role="status">
          <progress max={model.progress.total} value={model.progress.done} />
          <span>
            {model.progress.done}/{model.progress.total} {model.progress.current}
          </span>
        </div>
      )}
      {model.saved && (
        <div className={styles.saved}>
          <strong>{model.saved.files.length}개 파일을 저장했습니다.</strong>
          <ul>
            {model.saved.files.map((file) => (
              <li key={file.path}>
                <span>{file.path.split(/[\\/]/u).pop()}</span>
                <Button onClick={() => open(file.path)}>열기</Button>
              </li>
            ))}
          </ul>
          <div className={styles.actionsLeft}>
            <Button onClick={() => open(model.saved!.folder)}>
              <FolderOpen aria-hidden="true" />
              폴더 열기
            </Button>
            <Button onClick={() => navigate('history')}>
              <History aria-hidden="true" />
              출제 이력에서 보기
            </Button>
          </div>
        </div>
      )}
      <div className={styles.actions}>
        <Button onClick={() => model.setStep(4)}>
          <ArrowLeft aria-hidden="true" />
          결과로 돌아가기
        </Button>
        <Button
          variant="primary"
          disabledReason={reason}
          onClick={() =>
            void model.save({
              formats,
              parts,
              combineParts: combine,
              examIndexes: exams,
              ...examHeader.request,
            })
          }
        >
          <FileDown aria-hidden="true" />
          폴더를 골라 저장
        </Button>
      </div>
    </div>
  );
}
