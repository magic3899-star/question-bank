import type { Constraint, ConstraintSpec, Diagnostic, SelectionContext } from '../../../contracts/index';

const valid = (spec: ConstraintSpec): boolean => !!spec.params && typeof spec.params === 'object' && !Array.isArray(spec.params)
  && Number.isSafeInteger(spec.params.lastNExams) && Number(spec.params.lastNExams) >= 0;
function recent(spec: ConstraintSpec, ctx: SelectionContext): Set<string> {
  return new Set([...ctx.history].sort((a, b) => {
    const timeA = Date.parse(a.createdAt);
    const timeB = Date.parse(b.createdAt);
    const difference = (Number.isFinite(timeB) ? timeB : -Infinity) - (Number.isFinite(timeA) ? timeA : -Infinity);
    return difference || (a.examId < b.examId ? -1 : a.examId > b.examId ? 1 : 0);
  }).slice(0, Number(spec.params.lastNExams)).flatMap((entry) => entry.questionIds));
}
export const excludeRecent: Constraint = {
  kind: 'constraint', id: 'exclude-recent', label: '최근 출제 문제 제외',
  filterCandidates(spec, candidates, state) {
    if (!valid(spec)) return candidates;
    const used = recent(spec, state.ctx);
    return candidates.filter((question) => !used.has(question.id));
  },
  verify(spec, exams, ctx) {
    if (!valid(spec)) return [{ severity: 'error', code: 'CONSTRAINT_PARAMS_INVALID', message: '최근 시험 수 lastNExams를 0 이상의 정수로 입력하세요.' }];
    const used = recent(spec, ctx);
    const diagnostics: Diagnostic[] = [];
    exams.forEach((exam, index) => {
      for (const question of exam.questions) if (used.has(question.id)) diagnostics.push({ severity: 'error', code: 'RECENT_QUESTION_USED',
        message: `${index + 1}회 문제 '${question.id}'는 최근 ${Number(spec.params.lastNExams)}개 시험에 사용되었습니다. 문제를 추가하거나 최근 제외 범위를 줄이세요.`, ref: { questionId: question.id } });
    });
    return diagnostics;
  },
};
