import type { Constraint, ConstraintSpec, Diagnostic } from '../../../contracts/index';

const valid = (spec: ConstraintSpec): boolean => !!spec.params && typeof spec.params === 'object' && !Array.isArray(spec.params)
  && (spec.params.scope === undefined || spec.params.scope === 'all');
export const noOverlapAcrossExams: Constraint = {
  kind: 'constraint', id: 'no-overlap-across-exams', label: '회차 간 동일 문제 금지',
  filterCandidates(spec, candidates, state) {
    if (!valid(spec)) return candidates;
    const used = new Set(state.chosenSoFar.flatMap((exam) => exam.questions.map((question) => question.id)));
    return candidates.filter((question) => !used.has(question.id));
  },
  verify(spec, exams) {
    if (!valid(spec)) return [{ severity: 'error', code: 'CONSTRAINT_PARAMS_INVALID', message: '회차 간 동일 문제 금지의 scope는 all로 지정하거나 생략하세요.' }];
    const seen = new Map<string, number>();
    const diagnostics: Diagnostic[] = [];
    exams.forEach((exam, index) => {
      for (const question of exam.questions) {
        const previous = seen.get(question.id);
        if (previous !== undefined && previous !== index) diagnostics.push({ severity: 'error', code: 'OVERLAP_ACROSS_EXAMS',
          message: `문제 '${question.id}'가 ${previous + 1}회·${index + 1}회에 중복되었습니다. 문제를 추가하거나 회차 수를 줄이세요.`, ref: { questionId: question.id } });
        else seen.set(question.id, index);
      }
    });
    return diagnostics;
  },
};
