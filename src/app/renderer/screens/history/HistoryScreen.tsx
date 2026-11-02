import { useEffect, useState } from 'react';
import { ClipboardList, FileDown, History as HistoryIcon, RotateCcw, Trash2 } from 'lucide-react';
import type { ExamSnapshot, ExportPart } from '../../../../contracts/index';
import type { ExportFormat, ExportResult, HistoryItem } from '../../../shared/index';
import type { ScreenProps } from '../../lib/index';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  ExamPaper,
  ExportOptions,
  SearchInput,
  Spinner,
  Tabs,
} from '../../components/index';
import { useApi, useReadySignal } from '../../hooks/index';
import { navigate, unwrap } from '../../lib/index';
import styles from './HistoryScreen.module.css';

const partItems: { id: ExportPart; label: string }[] = [
  { id: 'questions', label: '문제지' },
  { id: 'answers', label: '정답지' },
  { id: 'explanations', label: '해설지' },
];

export function HistoryScreen({ notify }: ScreenProps) {
  const [text, setText] = useState('');
  const [revision, setRevision] = useState(0);
  const list = useApi(
    () => window.qb.history.list({ text: text.trim() || undefined, limit: 200 }),
    [text, revision],
  );
  const [selected, setSelected] = useState<HistoryItem>();
  const [snapshot, setSnapshot] = useState<ExamSnapshot>();
  const [part, setPart] = useState<ExportPart>('questions');
  const [dialog, setDialog] = useState<'save' | 'delete'>();
  useReadySignal('history', list.loading, list.error);
  useEffect(() => {
    if (!selected) return setSnapshot(undefined);
    let active = true;
    void unwrap(window.qb.history.get(selected.examId))
      .then((value) => active && setSnapshot(value))
      .catch((cause: Error) => notify(cause.message));
    return () => {
      active = false;
    };
  }, [selected, notify]);
  useEffect(() => {
    if (!selected && list.value?.items[0]) setSelected(list.value.items[0]);
  }, [list.value, selected]);
  if (list.error) return <ErrorState message={list.error} retry={list.retry} />;
  if (!list.value) return <Spinner />;
  if (!list.value.total && !text)
    return (
      <EmptyState
        icon={<HistoryIcon />}
        title="아직 만든 시험이 없습니다"
        description="시험을 만들어 파일로 저장하면 여기에 기록됩니다."
      >
        <Button variant="primary" onClick={() => navigate('generate')}>
          <ClipboardList aria-hidden="true" />
          시험 만들기
        </Button>
      </EmptyState>
    );
  return (
    <div className={styles.page}>
      <section className={styles.list} aria-label="출제 이력 목록">
        <div className={styles.listHead}>
          <SearchInput
            label="이력 검색"
            placeholder="제목·다시 만들기 번호 검색"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <span>{list.value.total}개</span>
        </div>
        <ul>
          {list.value.items.map((item) => (
            <li key={item.examId}>
              <button
                type="button"
                className={item.examId === selected?.examId ? styles.selected : ''}
                onClick={() => setSelected(item)}
              >
                <strong>{item.title}</strong>
                <span>
                  {new Date(item.createdAt).toLocaleString('ko-KR')} · {item.subjectName}
                </span>
                <span>
                  {item.ruleName} · {item.questionCount}문제
                  {item.blankCount ? ` · 빈 번호 ${item.blankCount}` : ''} · 번호 {item.seed}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.detail} aria-label="시험지 확인">
        {!selected || !snapshot ? (
          <Spinner label="시험지를 불러오고 있습니다" />
        ) : (
          <>
            <div className={styles.toolbar}>
              <Tabs label="문서" value={part} items={partItems} onChange={setPart} />
              <Button onClick={() => setDialog('save')}>
                <FileDown aria-hidden="true" />
                다시 저장
              </Button>
              <Button
                onClick={() =>
                  navigate(
                    `generate?rule=${encodeURIComponent(selected.ruleSetId)}&seed=${encodeURIComponent(selected.seed)}`,
                  )
                }
              >
                <RotateCcw aria-hidden="true" />
                같은 번호로 다시 만들기
              </Button>
              <Button variant="danger" onClick={() => setDialog('delete')}>
                <Trash2 aria-hidden="true" />
                이력에서 삭제
              </Button>
            </div>
            <ExamPaper snapshot={snapshot} part={part} />
          </>
        )}
      </section>
      {dialog === 'save' && snapshot && (
        <SaveDialog snapshot={snapshot} close={() => setDialog(undefined)} notify={notify} />
      )}
      {dialog === 'delete' && selected && (
        <Dialog title="출제 이력에서 삭제" close={() => setDialog(undefined)}>
          <p>'{selected.title}'을(를) 출제 이력에서 지웁니다. 저장해 둔 파일은 지워지지 않습니다.</p>
          <p>"최근 N회 출제 문제 제외"를 쓸 때 이 시험은 더 이상 계산되지 않습니다.</p>
          <div className={styles.dialogActions}>
            <Button onClick={() => setDialog(undefined)}>취소</Button>
            <Button
              variant="danger"
              onClick={() =>
                void unwrap(window.qb.history.delete([selected.examId]))
                  .then(() => {
                    setDialog(undefined);
                    setSelected(undefined);
                    setRevision((value) => value + 1);
                    notify('출제 이력에서 지웠습니다.');
                  })
                  .catch((cause: Error) => notify(cause.message))
              }
            >
              삭제
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function SaveDialog({
  snapshot,
  close,
  notify,
}: {
  snapshot: ExamSnapshot;
  close: () => void;
  notify: (message: string) => void;
}) {
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
          disabledReason={!formats.length || !parts.length ? '형식과 문서를 하나 이상 고르세요.' : undefined}
          onClick={() => {
            setBusy(true);
            void unwrap(
              window.qb.exam.export({
                source: { historyExamIds: [snapshot.examId] },
                formats,
                parts,
                combineParts: combine,
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
