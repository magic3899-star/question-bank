import type { Question } from '../../../../contracts/index';
import type { ParsedExplanation } from '../../../shared/index';
import { explanationAnswerState } from '../../lib/editor/index';
import styles from './ExplanationAnswer.module.css';

export function ExplanationAnswer({
  question,
  explanation,
  checked,
  select,
  number,
}: {
  question: Question;
  explanation: ParsedExplanation;
  checked?: boolean;
  select: (checked: boolean) => void;
  number: string;
}) {
  const state = explanationAnswerState(question, explanation);
  return (
    <>
      <label>
        <input
          type="checkbox"
          aria-label={`${number}번 해설 정답 적용`}
          checked={checked ?? state.defaultApply}
          onChange={(event) => select(event.target.checked)}
        />
        {explanation.answerLabels?.join(', ') ?? explanation.answerPositions.join(', ')}번 적용
      </label>
      {state.invalid && (
        <p className={styles.error} role="alert">
          선지 범위를 벗어납니다. 정답 번호를 고치세요.
        </p>
      )}
      {state.conflict && <p className={styles.warn}>기존 정답과 다릅니다. 체크하면 덮어씁니다.</p>}
      {!question.answerChoiceIds.length && <p>비어 있는 정답을 채웁니다.</p>}
    </>
  );
}
