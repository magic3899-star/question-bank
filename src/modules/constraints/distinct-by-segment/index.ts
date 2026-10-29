import type { Constraint, ConstraintSpec, Diagnostic } from '../../../contracts/index';
import { segmentKey } from '../../objective-code/index';

function valid(spec: ConstraintSpec): boolean {
  return !!spec.params && typeof spec.params === 'object' && !Array.isArray(spec.params)
    && Number.isSafeInteger(spec.params.depth) && Number(spec.params.depth) > 0
    && (spec.params.mode === undefined || spec.params.mode === 'strict' || spec.params.mode === 'prefer' || spec.params.mode === 'strict-unless-single')
    && (spec.params.scope === undefined || spec.params.scope === 'slot' || spec.params.scope === 'exam');
}
export const distinctBySegment: Constraint = {
  kind: 'constraint', id: 'distinct-by-segment', label: '학습목표 구간 중복 금지',
  filterCandidates(spec, candidates, state) {
    if (!valid(spec)) return candidates;
    const mode = spec.params.mode ?? 'strict-unless-single';
    if (mode === 'strict-unless-single' && spec.params.scope === 'slot') {
      const segments = new Set(state.slot.pool.map((question) => segmentKey(question.objectiveCode ?? '', Number(spec.params.depth)))
        .filter((key) => key !== null));
      if (segments.size <= 1) return candidates;
    }
    const chosen = spec.params.scope === 'slot' ? state.slot.chosen : state.currentChosen;
    const used = new Set(chosen.map((question) => segmentKey(question.objectiveCode ?? '', Number(spec.params.depth))).filter((key) => key !== null));
    const distinct = candidates.filter((question) => {
      const key = segmentKey(question.objectiveCode ?? '', Number(spec.params.depth));
      return key === null || !used.has(key);
    });
    return spec.params.mode === 'prefer' && !distinct.length ? candidates : distinct;
  },
  verify(spec, exams) {
    if (!valid(spec)) return [{ severity: 'error', code: 'CONSTRAINT_PARAMS_INVALID', message: '학습목표 구간 깊이는 양의 정수, scope는 slot 또는 exam, mode는 strict, prefer, strict-unless-single 중 하나로 입력하세요.' }];
    const mode = spec.params.mode ?? 'strict-unless-single';
    const diagnostics: Diagnostic[] = [];
    exams.forEach((exam, index) => {
      const seen = new Map<string, number>();
      for (const question of exam.questions) {
        const key = segmentKey(question.objectiveCode ?? '', Number(spec.params.depth));
        if (key === null) continue;
        const scopeKey = JSON.stringify([spec.params.scope === 'slot' ? exam.slotOfQuestion[question.id] : '', key]);
        const reused = seen.get(scopeKey) ?? 0;
        // 사후 검사에는 정적 슬롯 풀이 없어 단일 구간 면제를 재판정할 수 없다.
        if (reused) diagnostics.push({ severity: mode === 'strict' ? 'error' : 'info',
          code: mode === 'strict' ? 'SEGMENT_NOT_DISTINCT' : 'SEGMENT_REUSED',
          message: `${index + 1}회에서 학습목표 '${key}' 구간을 ${reused}번 재사용했습니다. ${mode === 'strict-unless-single' ? '면제 가능 여부는 선택 단계에서 판단했습니다.' : mode === 'prefer' ? '서로 다른 구간이 부족해 가능한 만큼 구분했습니다.' : '다른 구간 문제를 추가하거나 깊이·범위를 조정하세요.'}`, ref: { questionId: question.id } });
        seen.set(scopeKey, reused + 1);
      }
    });
    return diagnostics;
  },
};
