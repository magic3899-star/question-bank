import type { Constraint, Diagnostic, FilterSpec, Question, RuleSet, SelectedExam, SelectionContext, SelectionResult, Selector } from '../../contracts/index';
import { createRng } from '../rng/index';
import { matchesObjectivePrefix, parseObjectiveCode, segmentKey } from '../objective-code/index';

function matches(question: Question, filter: FilterSpec): boolean {
  switch (filter.kind) {
    case 'all': return true;
    case 'objectivePrefix': return filter.prefixes.some((prefix) => matchesObjectivePrefix(question.objectiveCode ?? '', prefix));
    case 'tag': return filter.tags.some((tag) => question.tags.includes(tag));
    case 'sourceTag': return filter.values.some((value) => question.sourceTag === value);
  }
}

export const SELECTION_FILTER_CALL_LIMIT = 20_000;
export const PRECHECK_FILTER_CALL_LIMIT = 2_000;
export const SLOT_STAGNATION_LIMIT = 10;
export const EXAM_STAGNATION_LIMIT = 3;

export function createSelector(constraints: readonly Constraint[]): Selector {
  const plugins = new Map(constraints.map((constraint) => [constraint.id, constraint]));
  const unknown = (rules: RuleSet): Diagnostic[] => rules.constraints.filter((spec) => !plugins.has(spec.kind)).map((spec) => ({
    severity: 'error', code: 'UNKNOWN_CONSTRAINT', message: `알 수 없는 제약 '${spec.kind}' 때문에 출제를 중단했습니다. 해당 제약을 등록하거나 규칙에서 제거하세요.`,
  }));
  const poolAndInfo = (candidates: Question[]): { pool: Question[]; diagnostics: Diagnostic[] } => {
    const pool = candidates.filter((question) => parseObjectiveCode(question.objectiveCode ?? '') !== null);
    const count = candidates.length - pool.length;
    return { pool, diagnostics: count ? [{ severity: 'info', code: 'NO_OBJECTIVE_EXCLUDED',
      message: `학습목표가 없거나 형식이 잘못된 문제 ${count}개를 제외했습니다. 학습목표 코드를 입력하거나 수정하면 출제할 수 있습니다.` }] : [] };
  };
  const select = (rules: RuleSet, candidates: Question[], ctx: SelectionContext, filterCallLimit = SELECTION_FILTER_CALL_LIMIT): SelectionResult => {
    const errors = unknown(rules);
    if (errors.length) return { exams: [], diagnostics: errors };
    const { pool, diagnostics } = poolAndInfo(candidates);
    const exams: SelectedExam[] = [];
    const slots = rules.slots.map((slot, index) => ({ slot, index, pool: pool.filter((question) => matches(question, slot.filter)) }))
      .sort((a, b) => a.pool.length - b.pool.length || a.index - b.index);
    const capacity = slots.reduce((sum, entry) => {
      let possible = Math.min(entry.slot.count, new Set(entry.pool.map((q) => q.id)).size);
      for (const spec of rules.constraints) {
        if (spec.kind !== 'distinct-by-segment' || !spec.params || Array.isArray(spec.params)
          || spec.params.mode !== undefined && spec.params.mode !== 'strict' && spec.params.mode !== 'strict-unless-single'
          || spec.params.scope !== undefined && spec.params.scope !== 'slot' && spec.params.scope !== 'exam'
          || !Number.isSafeInteger(spec.params.depth) || Number(spec.params.depth) < 1) continue;
        const keys = entry.pool.map((q) => segmentKey(q.objectiveCode ?? '', Number(spec.params.depth)));
        if ((spec.params.mode ?? 'strict-unless-single') === 'strict-unless-single' && spec.params.scope === 'slot'
          && new Set(keys.filter((key) => key !== null)).size <= 1) continue;
        const upper = new Set(keys.filter((key) => key !== null)).size + keys.filter((key) => key === null).length;
        possible = Math.min(possible, upper);
      }
      return sum + possible;
    }, 0);
    const requested = rules.slots.reduce((sum, slot) => sum + slot.count, 0);
    for (let examIndex = 0; examIndex < rules.examCount; examIndex++) {
      let best: Question[][] = slots.map(() => []);
      let bestCount = -1;
      const reductions = new Map<string, Map<string, number>>();
      let complete = false;
      let filterCalls = 0;
      let limited = false;
      let staleRetries = 0;
      for (let retry = 0; retry < 50 && !complete && filterCalls < filterCallLimit; retry++) {
        const previousBest = bestCount;
        const chosen: Question[][] = slots.map(() => []);
        const attempts = slots.map(() => 0);
        const maxFilled = slots.map(() => -1);
        const staleAttempts = slots.map(() => 0);
        const root = ctx.rng.fork(`retry${retry}`);
        const remember = (): void => {
          const count = chosen.reduce((sum, questions) => sum + questions.length, 0);
          if (count > bestCount) { bestCount = count; best = chosen.map((questions) => [...questions]); }
        };
        const visit = (slotIndex: number): boolean => {
          remember();
          // 정적 상한을 채웠으면 다른 조합도 더 많은 문제를 채울 수 없다.
          if (bestCount >= capacity && capacity < requested) return false;
          if (slotIndex === slots.length) return chosen.every((items, i) => items.length === slots[i].slot.count);
          if (filterCalls >= filterCallLimit) { limited = true; return false; }
          const entry = slots[slotIndex];
          const slot = entry.slot;
          const seenAttempts = new Set<string>();
          while (attempts[slotIndex] < 200 && staleAttempts[slotIndex] < SLOT_STAGNATION_LIMIT && filterCalls < filterCallLimit) {
            const attempt = attempts[slotIndex]++;
            chosen[slotIndex] = [];
            for (let later = slotIndex + 1; later < slots.length; later++) chosen[later] = [];
            const rng = root.fork(`exam${examIndex}/slot${slot.id}/attempt${attempt}`);
            let startAvailable = 0;
            for (let pick = 0; pick < slot.count; pick++) {
              const currentChosen = chosen.flat();
              const ids = new Set(currentChosen.map((question) => question.id));
              let available = entry.pool.filter((question) => !ids.has(question.id));
              const state = { examIndex, chosenSoFar: exams, currentChosen, slot: { id: slot.id, chosen: chosen[slotIndex], pool: entry.pool }, ctx };
              for (const spec of rules.constraints) {
                if (!available.length) break;
                if (!plugins.get(spec.kind)!.filterCandidates) continue;
                if (filterCalls >= filterCallLimit) { limited = true; available = []; break; }
                filterCalls++;
                const plugin = plugins.get(spec.kind)!;
                const before = available.length;
                available = plugin.filterCandidates?.(spec, available, state) ?? available;
                const reduction = before - available.length;
                if (reduction > 0) {
                  const causes = reductions.get(slot.id) ?? new Map<string, number>();
                  const label = spec.kind === 'distinct-by-segment' && spec.params.depth === 2 && spec.params.scope === 'slot'
                    ? '중단원이 서로 달라야 하는 규칙' : plugin.label;
                  causes.set(label, Math.max(causes.get(label) ?? 0, reduction));
                  reductions.set(slot.id, causes);
                }
              }
              if (pick === 0) startAvailable = available.length;
              if (!available.length) {
                remember();
                break;
              }
              chosen[slotIndex].push(available[rng.int(available.length)]);
              remember();
            }
            const filled = chosen[slotIndex].length;
            if (filled > maxFilled[slotIndex]) { maxFilled[slotIndex] = filled; staleAttempts[slotIndex] = 0; }
            else staleAttempts[slotIndex]++;
            const key = JSON.stringify(chosen[slotIndex].map((question) => question.id).sort());
            if (!seenAttempts.has(key)) {
              seenAttempts.add(key);
              if (visit(slotIndex + 1)) return true;
            }
            if (bestCount >= capacity) break;
            if (filterCalls >= filterCallLimit) { limited = true; break; }
            if (startAvailable < slot.count || startAvailable === slot.count && seenAttempts.size > 0) break;
            if (staleAttempts[slotIndex] >= SLOT_STAGNATION_LIMIT) { limited = true; break; }
          }
          if (attempts[slotIndex] >= 200) limited = true;
          chosen[slotIndex] = [];
          return false;
        };
        complete = visit(0);
        if (complete) best = chosen.map((questions) => [...questions]);
        if (bestCount >= capacity) break;
        staleRetries = bestCount > previousBest ? 0 : staleRetries + 1;
        if (!complete && staleRetries >= EXAM_STAGNATION_LIMIT) { limited = true; break; }
        if (!complete && retry === 49) limited = true;
      }
      const byId = new Map(slots.map((entry, index) => [entry.slot.id, best[index]]));
      const questions = rules.slots.flatMap((slot) => byId.get(slot.id) ?? []);
      const slotOfQuestion = Object.fromEntries(slots.flatMap((entry, index) => best[index].map((question) => [question.id, entry.slot.id])));
      const blanks = rules.slots.flatMap((slot) => {
        const filled = byId.get(slot.id)?.length ?? 0;
        const count = slot.count - filled;
        if (count <= 0) return [];
        const causes = reductions.get(slot.id) ?? new Map<string, number>();
        diagnostics.push({ severity: 'warn', code: 'SLOT_BLANK',
          message: `${examIndex + 1}회 슬롯 '${slot.label}': 필요 ${slot.count}개, 채움 ${filled}개, 비는 ${count}개. ${causes.size ? `원인 제약 추정(후보 감소): ${[...causes].map(([label, reduction]) => `${label} ${reduction}개`).join(', ')}. ` : '후보 부족. '}빈 번호로 남습니다. 문제를 추가하거나 제약을 완화하면 더 채울 수 있습니다.` });
        return [{ slotId: slot.id, count }];
      });
      exams.push({ questions, slotOfQuestion, blanks });
      if (blanks.length && (limited || filterCalls >= filterCallLimit)) diagnostics.push({ severity: 'warn', code: 'SELECTION_SEARCH_LIMIT',
        message: `${examIndex + 1}회: 탐색 한도에 도달해 일부 슬롯을 비웠습니다. 제약을 완화하면 더 채울 수 있습니다.` });
    }
    for (const spec of rules.constraints) {
      diagnostics.push(...(plugins.get(spec.kind)!.verify?.(spec, exams, ctx) ?? []));
      if (spec.needsConfirmation) diagnostics.push({ severity: 'warn', code: 'UNCONFIRMED_RULE_APPLIED',
        message: `미확정 제약 '${plugins.get(spec.kind)!.label}'을 적용했습니다. ${spec.note ?? '출제 규칙의 의미를 확인하고 확정하세요.'}` });
    }
    return { exams, diagnostics };
  };
  return {
    select: (rules, candidates, ctx) => select(rules, candidates, ctx),
    precheck(rules, candidates, ctx) {
      const errors = unknown(rules);
      if (errors.length) return errors;
      const { pool, diagnostics } = poolAndInfo(candidates);
      const multiplier = rules.constraints.some((spec) => spec.kind === 'no-overlap-across-exams') ? rules.examCount : 1;
      for (const slot of rules.slots) {
        const available = new Set(pool.filter((question) => matches(question, slot.filter)).map((question) => question.id)).size;
        const required = slot.count * multiplier;
        if (available < required) diagnostics.push({ severity: 'warn', code: 'SLOT_SHORTAGE',
          message: `슬롯 '${slot.label}' 후보 부족: 필요 ${required}개, 가능 ${available}개, ${required - available}개 모자라 시험지에 빈 번호가 생깁니다. 문제를 추가하거나 슬롯 개수·회차 수를 조정하거나 제약을 완화하세요.` });
        else if (available < required * 1.2) diagnostics.push({ severity: 'warn', code: 'SLOT_TIGHT',
          message: `슬롯 '${slot.label}' 후보가 빠듯합니다. 필요 ${required}개, 가능 ${available}개입니다. 문제를 추가하거나 슬롯 개수·제약을 조정하세요.` });
      }
      const trial = select(rules, candidates, { ...ctx, rng: createRng('precheck') }, PRECHECK_FILTER_CALL_LIMIT);
      diagnostics.push(...trial.diagnostics.filter((diagnostic) => ['SLOT_BLANK', 'SELECTION_SEARCH_LIMIT'].includes(diagnostic.code) || diagnostic.severity === 'error')
        .map((diagnostic) => diagnostic.code === 'SLOT_BLANK' ? { ...diagnostic, code: 'SLOT_SHORTAGE',
          message: diagnostic.message.replace(/비는 (\d+)개/u, '$1개 모자라 시험지에 빈 번호가 생깁니다') } : diagnostic));
      return diagnostics;
    },
  };
}
