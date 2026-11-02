import { useEffect, useRef, useState } from 'react';
import type { Question } from '../../../../contracts/index';
import type { EditorParseResult } from '../../../shared/index';
import { blocksToPlainText } from '../../../../modules/content-model/index';
import { Button, Select } from '../../components/index';
import { ExplanationPaste } from './ExplanationPaste';
import styles from './EditorPastePanel.module.css';

export function EditorPastePanel({
  parse,
  busy,
  batch,
  position,
  question,
  statuses,
  unsavedCurrent,
  update,
  error,
  capture,
  edit,
  join,
  joinLoading,
  changeJoin,
  onPrimaryChange,
}: {
  parse: (text: string, replaceCurrent?: boolean, joinWrappedLinesWith?: 'space' | 'none') => Promise<void>;
  busy: boolean;
  batch?: EditorParseResult;
  position: number;
  question: Question;
  statuses: Record<number, string>;
  unsavedCurrent: boolean;
  update: (batch: EditorParseResult, current?: Question) => void;
  error: (message: string) => void;
  capture: boolean;
  edit: boolean;
  join: 'space' | 'none';
  joinLoading: boolean;
  changeJoin: (value: 'space' | 'none') => Promise<void>;
  onPrimaryChange?: (active: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(!edit);
  const started = useRef(false);
  useEffect(() => {
    onPrimaryChange?.(open && !!text.trim());
  }, [open, text, onPrimaryChange]);
  useEffect(() => {
    if (!capture || joinLoading || started.current) return;
    started.current = true;
    const value = sessionStorage.getItem('qb-capture-paste') ?? '';
    setText(value);
    if (value) void parse(value, true, join);
  }, [capture, parse, join, joinLoading]);
  return (
    <section>
      <h3>PDF 붙여넣기</h3>
      <Button
        aria-expanded={open}
        aria-controls="editor-paste-panel"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? '붙여넣기 접기' : '붙여넣기 펼치기'}
      </Button>
      <div id="editor-paste-panel" className={styles.panel} hidden={!open}>
        <Select
          label="줄바꿈 잇기"
          value={join}
          disabled={joinLoading}
          onChange={(event) => {
            const mode = event.target.value === 'none' ? 'none' : 'space';
            void changeJoin(mode).catch((cause: Error) => error(cause.message));
            if (text.trim()) void parse(text, true, mode);
          }}
        >
          <option value="space">띄어쓰기로</option>
          <option value="none">붙여서</option>
        </Select>
        <label className={styles.text}>
          PDF에서 복사한 문제를 붙여넣으세요
          <textarea
            aria-label="PDF에서 복사한 문제를 붙여넣으세요"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <Button
          variant={text.trim() ? 'primary' : 'secondary'}
          disabled={busy || joinLoading || !text.trim()}
          disabledReason={!text.trim() ? 'PDF에서 복사한 문제를 먼저 붙여넣으세요.' : undefined}
          onClick={() => void parse(text, false, join)}
        >
          문제 자동 분리
        </Button>
        {busy && <p role="status">문제를 확인하고 있습니다…</p>}
        {batch && (
          <>
            <h3>{batch.questions.length}개 문제로 나누었습니다</h3>
            <p>
              연속 추가 모드 ·{' '}
              {position < batch.questions.length ? `${position + 1}번째 편집 중` : '이번 묶음 검토 완료'}
            </p>
            <ol>
              {batch.questions.map((q, index) => (
                <li key={index} aria-current={index === position ? 'step' : undefined}>
                  {String(q.extra.originalNumber ?? index + 1)}번 · {blocksToPlainText(q.stem).slice(0, 50)} ·{' '}
                  {statuses[index] ?? (index === position ? '편집 중' : '대기')}
                  <details>
                    <summary>붙여넣기 당시 진단</summary>
                    <ul>
                      {batch.diagnostics
                        .filter((d) => d.ref?.draftIndex === index)
                        .map((d, i) => (
                          <li key={i}>
                            {d.severity === 'error' ? '오류' : d.severity === 'warn' ? '경고' : '정보'}:{' '}
                            {d.message}
                          </li>
                        ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ol>
            {batch.diagnostics
              .filter((d) => d.ref?.draftIndex === undefined)
              .map((d, i) => (
                <p key={i}>{d.message}</p>
              ))}
            <ExplanationPaste
              join={join}
              batch={batch}
              question={question}
              position={position}
              statuses={statuses}
              unsavedCurrent={unsavedCurrent}
              update={update}
              error={error}
            />
          </>
        )}
      </div>
    </section>
  );
}
