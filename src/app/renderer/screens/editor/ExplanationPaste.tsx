import { useMemo, useState } from 'react';
import type { Question } from '../../../../contracts/index';
import type { EditorParseResult, ParsedExplanation } from '../../../shared/index';
import { blocksToPlainText } from '../../../../modules/content-model/index';
import { autoPolicy, matchExplanations } from '../../lib/editor/index';
import { unwrap } from '../../lib/index';
import { Button, Dialog } from '../../components/index';

export function ExplanationPaste({
  batch,
  question,
  position,
  statuses,
  unsavedCurrent,
  update,
  error,
}: {
  batch: EditorParseResult;
  question: Question;
  position: number;
  statuses: Record<number, string>;
  unsavedCurrent: boolean;
  update: (batch: EditorParseResult, current?: Question) => void;
  error: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedExplanation[]>();
  const [answers, setAnswers] = useState(false);
  const [busy, setBusy] = useState(false);
  const questions = useMemo(
    () => batch.questions.map((q, i) => (i === position ? question : q)),
    [batch, position, question],
  );
  const matched = parsed && matchExplanations(questions, parsed);
  const apply = async () => {
    if (!matched) return;
    setBusy(true);
    try {
      if (
        answers &&
        matched.rows.some((row) =>
          row.explanation?.answerPositions.some((n) => n < 1 || n > row.question.choices.length),
        )
      )
        throw new Error('해설 정답이 선지 범위를 벗어납니다. 번호를 확인하세요.');
      const pairs = matched.rows
        .filter(
          (r, i) =>
            r.question.id && r.explanation && statuses[i] === '저장됨' && !(i === position && unsavedCurrent),
        )
        .map((r) => ({
          questionId: r.question.id,
          number: r.number,
          explanation: r.explanation!.explanation,
          ...(answers && r.explanation!.answerPositions.length
            ? { answerPositions: r.explanation!.answerPositions }
            : {}),
        }));
      const saved = pairs.length ? await unwrap(window.qb.bank.applyExplanations({ pairs })) : [];
      const next = questions.map((q) => {
        const row = matched.rows.find((r) => r.question === q);
        if (!row?.explanation) return q;
        const persisted = saved.find((s) => s.id === q.id);
        if (persisted)
          return {
            ...q,
            explanation: persisted.explanation,
            answerChoiceIds: persisted.answerChoiceIds,
            shufflePolicy: persisted.shufflePolicy,
            updatedAt: persisted.updatedAt,
          };
        const positions = row.explanation.answerPositions;
        if (answers && positions.some((n) => n < 1 || n > q.choices.length))
          throw new Error(`${row.number}번 해설 정답이 선지 범위를 벗어납니다. 확인하세요.`);
        return autoPolicy({
          ...q,
          explanation: row.explanation.explanation,
          ...(answers && positions.length
            ? { answerChoiceIds: positions.map((n) => q.choices[n - 1]!.id) }
            : {}),
        });
      });
      update({ ...batch, questions: next }, next[position]);
      setOpen(false);
      setParsed(undefined);
    } catch (cause) {
      error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>해설 붙여넣기</Button>
      {open && (
        <Dialog title="해설 따로 붙이기" close={() => setOpen(false)}>
          <label>
            PDF에서 복사한 해설
            <textarea
              aria-label="해설 붙여넣기"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setParsed(undefined);
              }}
            />
          </label>
          <Button
            disabled={busy || !text.trim()}
            onClick={() => {
              setBusy(true);
              void unwrap(window.qb.editor.parseExplanations({ text }))
                .then(setParsed)
                .catch((cause: Error) => error(cause.message))
                .finally(() => setBusy(false));
            }}
          >
            번호별로 해석
          </Button>
          {matched && (
            <>
              <p>
                이번 추가 묶음의 원래 번호로 짝을 맞춥니다. 일치하지 않거나 중복된 번호는 적용하지 않습니다.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>번호</th>
                    <th>문제</th>
                    <th>해설</th>
                  </tr>
                </thead>
                <tbody>
                  {matched.rows.map((row, index) => (
                    <tr key={index}>
                      <td>{row.number}</td>
                      <td>
                        {blocksToPlainText(row.question.stem).slice(0, 60)} · {statuses[index] ?? '작성 중'}
                      </td>
                      <td>
                        {row.ambiguous ? '중복 번호 — 확인 필요' : row.explanation ? '일치' : '해설 없음'}
                        {row.explanation && (
                          <p>
                            {blocksToPlainText(row.explanation.explanation).slice(0, 100)}
                            {row.explanation.answerPositions.length
                              ? ` · 정답 ${row.explanation.answerPositions.join(', ')}번`
                              : ''}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {matched.unmatched.map((e, i) => (
                <p key={i}>{e.number}번: 짝이 없는 해설</p>
              ))}
              {!parsed?.length && <p>번호를 찾지 못했습니다. “1. 해설” 형식으로 입력하세요.</p>}
              {parsed?.some((e) => e.answerPositions.length) && (
                <label>
                  <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} />
                  해설에 있는 정답도 채울까요? 기존 정답을 바꿉니다.
                </label>
              )}
              <Button
                disabled={busy || !matched.rows.some((r) => r.explanation)}
                onClick={() => void apply()}
              >
                확인하고 일괄 적용
              </Button>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
