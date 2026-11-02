import { blocksToPlainText } from '../../../../modules/content-model/index';
import { matchExplanations } from '../../lib/editor/index';
import { ExplanationAnswer } from './ExplanationAnswer';
import styles from './ExplanationMatches.module.css';

export function ExplanationMatches({
  matched,
  statuses,
  answers,
  select,
}: {
  matched: ReturnType<typeof matchExplanations>;
  statuses: Record<number, string>;
  answers: Record<number, boolean>;
  select: (index: number, checked: boolean) => void;
}) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>번호</th>
            <th>문제</th>
            <th>해설</th>
            <th>정답</th>
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
                {row.explanation && <p>{blocksToPlainText(row.explanation.explanation).slice(0, 100)}</p>}
                {row.explanation?.diagnostics?.map((diagnostic, i) => (
                  <p role="status" className={styles.warn} key={i}>
                    {diagnostic.message}
                  </p>
                ))}
              </td>
              <td>
                {row.explanation?.answerPositions.length ? (
                  <ExplanationAnswer
                    question={row.question}
                    explanation={row.explanation}
                    checked={answers[index]}
                    select={(checked) => select(index, checked)}
                    number={row.number}
                  />
                ) : (
                  '정답 표기 없음'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
