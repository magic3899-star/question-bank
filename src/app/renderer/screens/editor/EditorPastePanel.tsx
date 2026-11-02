import { useEffect, useRef, useState } from 'react';
import type { Question } from '../../../../contracts/index';
import type { EditorParseResult } from '../../../shared/index';
import { blocksToPlainText } from '../../../../modules/content-model/index';
import { Button } from '../../components/index';
import { ExplanationPaste } from './ExplanationPaste';

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
}: {
  parse: (text: string, capture?: boolean) => Promise<void>;
  busy: boolean;
  batch?: EditorParseResult;
  position: number;
  question: Question;
  statuses: Record<number, string>;
  unsavedCurrent: boolean;
  update: (batch: EditorParseResult, current?: Question) => void;
  error: (message: string) => void;
  capture: boolean;
}) {
  const [text, setText] = useState('');
  const started = useRef(false);
  useEffect(() => {
    if (!capture || started.current) return;
    started.current = true;
    const value = sessionStorage.getItem('qb-capture-paste') ?? '';
    setText(value);
    if (value) void parse(value, true);
  }, [capture, parse]);
  return (
    <section>
      <h3>PDF 붙여넣기</h3>
      <label>
        PDF에서 복사한 문제를 붙여넣으세요
        <textarea
          aria-label="PDF에서 복사한 문제를 붙여넣으세요"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <Button disabled={busy || !text.trim()} onClick={() => void parse(text)}>
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
    </section>
  );
}
