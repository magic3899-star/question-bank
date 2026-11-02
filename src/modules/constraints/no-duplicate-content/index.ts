import type { Constraint, ConstraintSpec, Diagnostic } from '../../../contracts/index';
import { questionContentKey } from '../../content-model/index';

const valid = (spec: ConstraintSpec): boolean =>
  !!spec.params &&
  typeof spec.params === 'object' &&
  !Array.isArray(spec.params) &&
  (spec.params.scope === undefined || spec.params.scope === 'exam' || spec.params.scope === 'run');
export const noDuplicateContent: Constraint = {
  kind: 'constraint',
  id: 'no-duplicate-content',
  label: '같은 지문 중복 금지',
  filterCandidates(spec, candidates, state) {
    if (!valid(spec)) return candidates;
    const selected =
      spec.params.scope === 'exam'
        ? state.currentChosen
        : [...state.currentChosen, ...state.chosenSoFar.flatMap((exam) => exam.questions)];
    const used = new Set(selected.map(questionContentKey));
    return candidates.filter((question) => !used.has(questionContentKey(question)));
  },
  verify(spec, exams) {
    if (!valid(spec))
      return [
        {
          severity: 'error',
          code: 'CONSTRAINT_PARAMS_INVALID',
          message: '동일 내용 금지의 scope는 exam 또는 run으로 고치세요.',
        },
      ];
    const diagnostics: Diagnostic[] = [];
    const seen = new Map<string, string>();
    for (const exam of exams) {
      if (spec.params.scope === 'exam') seen.clear();
      for (const question of exam.questions) {
        const key = questionContentKey(question);
        const previous = seen.get(key);
        if (previous !== undefined)
          diagnostics.push({
            severity: 'error',
            code: 'DUPLICATE_CONTENT_SELECTED',
            message: `문제 '${previous}'와 '${question.id}'의 지문이 같아 중복으로 취급되며 한 시험·모든 회차에서 함께 출제되지 않습니다. 중복 문제를 정리하거나 제약 범위를 조정하세요.`,
            ref: { questionId: question.id },
          });
        else seen.set(key, question.id);
      }
    }
    return diagnostics;
  },
};
